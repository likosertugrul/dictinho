-- Translations are stored per source language, but both autocomplete RPCs
-- ignored that: search_lexicon returned whichever translation sorted first
-- (a Turkish learner could be shown a Spanish gloss once the same entry had
-- been enriched by a Spanish speaker), and search_lexicon_en filtered on a
-- hardcoded 'en'. Both now take the caller's source language.
--
-- search_lexicon prefers the requested language and falls back to any other,
-- so the English-only base lexicon keeps working for every source language.
-- search_lexicon_en is a reverse lookup *from* the source language, so there
-- it is a hard filter — matching a word the user cannot read is pointless.

-- Return/argument changes require drop + recreate
drop function if exists search_lexicon(text, text, int);

create or replace function search_lexicon(
  q text, target text, max_results int default 8, src text default 'en'
)
returns table (
  id uuid, lemma text, pos text, gender text, auxiliary text, cefr text, translation text
)
language sql stable
set search_path = public
as $$
  with norm as (select lower(unaccent(q)) as nq)
  select e.id, e.lemma, e.pos, e.gender, e.auxiliary, e.cefr,
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

drop function if exists search_lexicon_en(text, text, int);

create or replace function search_lexicon_en(
  q text, target text, max_results int default 8, src text default 'en'
)
returns table (
  id uuid, lemma text, pos text, gender text, auxiliary text, cefr text, translation text
)
language sql stable
set search_path = public
as $$
  with norm as (select lower(trim(q)) as nq)
  select s.id, s.lemma, s.pos, s.gender, s.auxiliary, s.cefr, s.translation
  from (
    select distinct on (e.id)
      e.id, e.lemma, e.pos, e.gender, e.auxiliary, e.cefr, t.translation,
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
