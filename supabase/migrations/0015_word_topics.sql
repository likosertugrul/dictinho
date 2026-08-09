-- Words are grouped by word class (pos); this adds a second axis: topic —
-- food, travel, work… — so the user can browse and drill a theme.
-- Modelled exactly like `pos`: a plain text column whose allowed keys live in
-- the app (src/lib/topics.ts), shared by the DB, the AI prompts and the UI.

alter table lexicon_entries add column if not exists topic text;
alter table user_words      add column if not exists topic text;

-- The topic filter always runs inside one user's words for one language
create index if not exists user_words_topic_idx
  on user_words (user_id, target_language, topic);

-- Autocomplete has to carry the topic so a newly added word inherits it.
-- Return type changes require drop + recreate.
drop function if exists search_lexicon(text, text, int, text);

create or replace function search_lexicon(
  q text, target text, max_results int default 8, src text default 'en'
)
returns table (
  id uuid, lemma text, pos text, gender text, auxiliary text, cefr text,
  topic text, translation text
)
language sql stable
set search_path = public
as $$
  with norm as (select lower(unaccent(q)) as nq)
  select e.id, e.lemma, e.pos, e.gender, e.auxiliary, e.cefr, e.topic,
         (select t.translation from lexicon_translations t
           where t.entry_id = e.id
           order by (t.source_language = src) desc, t.sense_order
           limit 1) as translation
  from lexicon_entries e, norm
  where e.target_language = target
    and (e.normalized like norm.nq || '%'
         or similarity(e.normalized, norm.nq) > 0.15)
  order by (e.normalized like norm.nq || '%') desc,
           similarity(e.normalized, norm.nq) desc,
           e.frequency_rank nulls last,
           e.lemma
  limit max_results;
$$;

drop function if exists search_lexicon_en(text, text, int, text);

create or replace function search_lexicon_en(
  q text, target text, max_results int default 8, src text default 'en'
)
returns table (
  id uuid, lemma text, pos text, gender text, auxiliary text, cefr text,
  topic text, translation text
)
language sql stable
set search_path = public
as $$
  with norm as (select lower(trim(q)) as nq)
  select s.id, s.lemma, s.pos, s.gender, s.auxiliary, s.cefr, s.topic, s.translation
  from (
    select distinct on (e.id)
      e.id, e.lemma, e.pos, e.gender, e.auxiliary, e.cefr, e.topic, t.translation,
      e.frequency_rank,
      greatest(
        similarity(lower(t.translation), norm.nq),
        case
          when lower(t.translation) like norm.nq || '%' then 1.0
          when lower(t.translation) like 'to ' || norm.nq || '%' then 0.95  -- verbs: "have" → "to have"
          else 0.0
        end
      ) as score
    from lexicon_translations t
    join lexicon_entries e on e.id = t.entry_id, norm
    where e.target_language = target
      and t.source_language = src
      and (lower(t.translation) like norm.nq || '%'
           or lower(t.translation) like 'to ' || norm.nq || '%'
           or similarity(lower(t.translation), norm.nq) > 0.25)
    order by e.id, score desc
  ) s
  order by s.score desc, s.frequency_rank nulls last, s.lemma
  limit max_results;
$$;
