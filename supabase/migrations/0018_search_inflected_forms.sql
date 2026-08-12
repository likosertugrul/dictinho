-- Searching an inflected form found nothing: "vado" returned grado/stado/valle,
-- never "andare", so the only way forward was to save "vado" as if it were a
-- word of its own. Autocomplete now also matches the conjugation table and
-- returns the entry the form belongs to, with `matched_form` naming the form
-- that hit — the app uses it to say "that's a form of andare".
--
-- Only exact form matches count; fuzzy matching on 7k forms would drown the
-- lemma results in noise.

create index if not exists conjugations_form_idx
  on conjugations (lower(form))
  where lexicon_ref is not null;

drop function if exists search_lexicon(text, text, int, text);

create or replace function search_lexicon(
  q text, target text, max_results int default 8, src text default 'en'
)
returns table (
  id uuid, lemma text, pos text, gender text, auxiliary text, cefr text,
  topic text, matched_form text, translation text
)
language sql stable
set search_path = public
as $$
  with norm as (select lower(unaccent(q)) as nq, lower(trim(q)) as raw),
  hits as (
    -- the headword itself
    select e.id, e.lemma, e.pos, e.gender, e.auxiliary, e.cefr, e.topic,
           null::text as matched_form,
           (e.normalized like norm.nq || '%') as prefix,
           similarity(e.normalized, norm.nq) as sim,
           e.frequency_rank,
           0 as kind
    from lexicon_entries e, norm
    where e.target_language = target
      and (e.normalized like norm.nq || '%'
           or similarity(e.normalized, norm.nq) > 0.15)
    union all
    -- an inflected form of it: "vado" → andare, "ho mangiato" → mangiare
    select e.id, e.lemma, e.pos, e.gender, e.auxiliary, e.cefr, e.topic,
           c.form as matched_form,
           true as prefix,
           1.0::real as sim,
           e.frequency_rank,
           1 as kind
    from conjugations c
    join lexicon_entries e on e.id = c.lexicon_ref, norm
    where e.target_language = target
      and (lower(c.form) = norm.raw or lower(unaccent(c.form)) = norm.nq)
  ),
  best as (
    -- one row per entry; the headword match wins over the form match
    select distinct on (id) *
    from hits
    order by id, kind, sim desc
  )
  select b.id, b.lemma, b.pos, b.gender, b.auxiliary, b.cefr, b.topic, b.matched_form,
         (select t.translation from lexicon_translations t
           where t.entry_id = b.id
           order by (t.source_language = src) desc, t.sense_order
           limit 1) as translation
  from best b
  order by b.prefix desc, b.sim desc, b.kind, b.frequency_rank nulls last, b.lemma
  limit max_results;
$$;
