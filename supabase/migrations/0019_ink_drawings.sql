-- Handwriting (tablet stylus) notes. Two kinds share one table:
--   kind='word' → the handwritten note under a word card's typed Notes
--   kind='page' → a free-form notebook page, not tied to any word
--
-- Deliberately NOT a jsonb column on user_words: the word list queries read
-- `select('*')` (src/lib/words.ts), so stroke data living there would be
-- dragged into every list fetch.
--
-- `strokes` holds vectors, not a bitmap — small, undoable, and the ink colour
-- can follow the theme. Shape (see src/components/ink/strokes.ts):
--   [{ "c": "#141414", "w": 3, "p": [[x, y, pressure], …] }, …]
-- Coordinates are in the drawing's own `width`/`height` space, so a pad
-- rendered at another size scales instead of clipping.

create table if not exists ink_drawings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  kind          text not null check (kind in ('word', 'page')),
  user_word_id  uuid references user_words (id) on delete cascade,
  title         text,
  strokes       jsonb not null default '[]'::jsonb,
  width         real not null,
  height        real not null,
  position      int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- A word drawing points at a word; a notebook page never does.
  constraint ink_drawings_target check (
    (kind = 'word' and user_word_id is not null)
    or (kind = 'page' and user_word_id is null)
  )
);

-- One handwritten note per word, so the editor can upsert without a read
-- first. Plain (not partial) unique index on purpose: notebook pages leave
-- user_word_id null and nulls never collide, while a plain index is the only
-- kind PostgREST can name as an on_conflict target.
create unique index if not exists ink_drawings_word_unique
  on ink_drawings (user_word_id);

-- The notebook list: one user's pages in their own order.
create index if not exists ink_drawings_pages_idx
  on ink_drawings (user_id, kind, position, updated_at desc);

alter table ink_drawings enable row level security;

create policy "own ink" on ink_drawings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Saving is an upsert from the client, which cannot call now() itself.
create or replace function touch_ink_drawing()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ink_drawings_touch on ink_drawings;
create trigger ink_drawings_touch
  before update on ink_drawings
  for each row execute function touch_ink_drawing();
