-- A personal word normally comes from a lexicon entry, so it can inherit that
-- entry's topic instead of being classified again. scripts/classify-topics.mjs
-- calls this after it has filled in the lexicon.
--
-- security definer: the function only ever touches rows the caller owns
-- (auth.uid()), but it needs to read the public lexicon regardless of RLS.

create or replace function backfill_user_word_topics()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  touched integer;
begin
  update user_words w
  set topic = e.topic
  from lexicon_entries e
  where w.lexicon_ref = e.id
    and w.topic is null
    and e.topic is not null
    and (auth.uid() is null or w.user_id = auth.uid());
  get diagnostics touched = row_count;
  return touched;
end;
$$;

grant execute on function backfill_user_word_topics() to anon, authenticated;
