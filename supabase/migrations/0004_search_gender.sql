-- Nouns need their gender to derive the definite article (la casa, il giorno,
-- l'acqua, lo studente). The autocomplete RPC didn't return gender, so saved
-- nouns had gender null. Fix the RPC and backfill existing rows.

-- Return type changes require drop + recreate
drop function if exists search_lexicon(text, text, int);

create or replace function search_lexicon(q text, target text, max_results int default 8)
returns table (
  id uuid, lemma text, pos text, gender text, auxiliary text, cefr text, translation text
)
language sql stable
set search_path = public
as $$
  with norm as (select lower(unaccent(q)) as nq)
  select e.id, e.lemma, e.pos, e.gender, e.auxiliary, e.cefr,
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

-- Backfill gender on already-saved words from their lexicon entry
update user_words w
set gender = e.gender
from lexicon_entries e
where w.lexicon_ref = e.id
  and w.gender is null
  and e.gender is not null;
