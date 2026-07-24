-- Autocomplete tuning: default pg_trgm '%' threshold (0.3) is too strict for
-- short queries ("ave" vs "avvertire" ≈ 0.17). Use explicit similarity() with a
-- lower cutoff and rank: prefix > similarity > frequency.

create or replace function search_lexicon(q text, target text, max_results int default 8)
returns table (id uuid, lemma text, pos text, auxiliary text, cefr text, translation text)
language sql stable
set search_path = public
as $$
  with norm as (select lower(unaccent(q)) as nq)
  select e.id, e.lemma, e.pos, e.auxiliary, e.cefr,
         (select t.translation from lexicon_translations t
           where t.entry_id = e.id order by t.sense_order limit 1) as translation
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
