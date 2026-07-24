-- Reverse lookup: search by English translation, get Italian entries.
-- Same return shape as search_lexicon so the client can reuse the row type.

create index if not exists lexicon_translations_translation_trgm
  on lexicon_translations using gin (lower(translation) gin_trgm_ops);

create or replace function search_lexicon_en(q text, target text, max_results int default 8)
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
      and t.source_language = 'en'
      and (lower(t.translation) like norm.nq || '%'
           or lower(t.translation) like 'to ' || norm.nq || '%'
           or similarity(lower(t.translation), norm.nq) > 0.25)
    order by e.id, score desc
  ) s
  order by s.score desc, s.frequency_rank nulls last, s.lemma
  limit max_results;
$$;
