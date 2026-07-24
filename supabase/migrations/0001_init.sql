-- Dictinho initial schema (see docs/DATABASE.md for rationale)
-- i18n-ready: content tables carry source_language / target_language (ISO-639-1).

-- ── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- ── Reference tables ─────────────────────────────────────────────────────────
create table languages (
  code        text primary key,
  name_native text not null,
  name_en     text not null,
  is_rtl      boolean not null default false
);

insert into languages (code, name_native, name_en) values
  ('en', 'English', 'English'),
  ('it', 'Italiano', 'Italian');

-- Public base dictionary — autocomplete source; grows via seed + AI enrichment.
create table lexicon_entries (
  id              uuid primary key default gen_random_uuid(),
  target_language text not null references languages(code),
  lemma           text not null,
  normalized      text not null,            -- lower + unaccent(lemma)
  pos             text not null,            -- 'verb'|'noun'|'adj'|'adv'|'prep'|...
  gender          text,                     -- 'm'|'f' (nouns)
  auxiliary       text,                     -- 'essere'|'avere' (verbs)
  is_irregular    boolean not null default false,
  cefr            text,                     -- 'A1'..'C2'
  frequency_rank  int,
  source          text not null default 'seed',
  created_at      timestamptz not null default now(),
  unique (target_language, lemma, pos)
);

create table lexicon_translations (
  id              uuid primary key default gen_random_uuid(),
  entry_id        uuid not null references lexicon_entries(id) on delete cascade,
  source_language text not null references languages(code),
  translation     text not null,
  sense_order     int not null default 0,
  notes           text
);

-- ── User data ────────────────────────────────────────────────────────────────
create table profiles (
  id            uuid primary key references auth.users(id),
  display_name  text,
  avatar_url    text,
  learning_pair jsonb not null default '{"source":"en","target":"it"}',
  streak_count  int not null default 0,
  gems          int not null default 0,
  created_at    timestamptz not null default now()
);

create table user_words (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  lexicon_ref     uuid references lexicon_entries(id),
  target_language text not null references languages(code),
  source_language text not null references languages(code),
  lemma           text not null,
  translation     text not null,
  pos             text not null,
  gender          text,
  auxiliary       text,
  cefr            text,
  notes           text,
  created_at      timestamptz not null default now()
);

create table tags (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,  -- null => system tag (CEFR)
  name    text not null,
  kind    text not null,                    -- 'theme'|'cefr'|'custom'
  color   text,                             -- pastel token name
  icon    text
);

-- System CEFR tags, available to everyone
insert into tags (name, kind) values
  ('A1','cefr'), ('A2','cefr'), ('B1','cefr'), ('B2','cefr'), ('C1','cefr'), ('C2','cefr');

create table user_word_tags (
  user_word_id uuid not null references user_words(id) on delete cascade,
  tag_id       uuid not null references tags(id) on delete cascade,
  primary key (user_word_id, tag_id)
);

-- Verb conjugations: attached to a personal word OR a base lexicon entry.
create table conjugations (
  id           uuid primary key default gen_random_uuid(),
  user_word_id uuid references user_words(id) on delete cascade,
  lexicon_ref  uuid references lexicon_entries(id) on delete cascade,
  tense        text not null,               -- 'presente'|'passato_prossimo'|...
  mood         text not null default 'indicativo',
  person       text not null,               -- 'io'|'tu'|'lui_lei'|'noi'|'voi'|'loro'
  form         text not null,
  is_compound  boolean not null default false,
  source       text not null default 'ai',  -- 'ai'|'rule'|'user'
  check (user_word_id is not null or lexicon_ref is not null)
);

-- UNIQUE constraints can't hold expressions; use a unique index instead.
create unique index conjugations_owner_tense_person_uq
  on conjugations (coalesce(user_word_id, lexicon_ref), tense, mood, person);

create table example_sentences (
  id           uuid primary key default gen_random_uuid(),
  user_word_id uuid references user_words(id) on delete cascade,
  lexicon_ref  uuid references lexicon_entries(id) on delete cascade,
  target_text  text not null,
  source_text  text not null,
  tense        text,
  source       text not null default 'ai',
  check (user_word_id is not null or lexicon_ref is not null)
);

-- ── SRS (SM-2) ───────────────────────────────────────────────────────────────
create table srs_cards (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  card_type     text not null,              -- 'word'|'conjugation'
  ref_id        uuid not null,
  ease_factor   real not null default 2.5,
  interval_days int not null default 0,
  repetitions   int not null default 0,
  due_at        timestamptz not null default now(),
  last_reviewed timestamptz,
  unique (user_id, card_type, ref_id)
);

create table srs_reviews (
  id          uuid primary key default gen_random_uuid(),
  card_id     uuid not null references srs_cards(id) on delete cascade,
  rating      int not null,                 -- 0..5 SM-2 quality
  reviewed_at timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
create index lexicon_entries_normalized_trgm
  on lexicon_entries using gin (normalized gin_trgm_ops);
create index lexicon_entries_lang_freq
  on lexicon_entries (target_language, frequency_rank);
create index lexicon_translations_entry on lexicon_translations (entry_id, sense_order);
create index srs_cards_user_due on srs_cards (user_id, due_at);
create index user_words_user on user_words (user_id, created_at desc);

-- ── Autocomplete RPC ─────────────────────────────────────────────────────────
-- unaccent is not immutable, so we wrap normalization here (stable is fine for RPC).
create or replace function search_lexicon(q text, target text, max_results int default 8)
returns table (id uuid, lemma text, pos text, auxiliary text, cefr text, translation text)
language sql stable
set search_path = public
as $$
  select e.id, e.lemma, e.pos, e.auxiliary, e.cefr,
         (select t.translation from lexicon_translations t
           where t.entry_id = e.id order by t.sense_order limit 1) as translation
  from lexicon_entries e
  where e.target_language = target
    and (e.normalized like lower(unaccent(q)) || '%'      -- prefix matches first
         or e.normalized % lower(unaccent(q)))            -- then fuzzy (pg_trgm)
  order by (e.normalized like lower(unaccent(q)) || '%') desc,
           e.frequency_rank nulls last,
           e.lemma
  limit max_results;
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table languages            enable row level security;
alter table lexicon_entries     enable row level security;
alter table lexicon_translations enable row level security;
alter table profiles            enable row level security;
alter table user_words          enable row level security;
alter table tags                enable row level security;
alter table user_word_tags      enable row level security;
alter table conjugations        enable row level security;
alter table example_sentences   enable row level security;
alter table srs_cards           enable row level security;
alter table srs_reviews         enable row level security;

-- Public read-only reference data (writes only via service role)
create policy "public read languages" on languages for select using (true);
create policy "public read lexicon" on lexicon_entries for select using (true);
create policy "public read lexicon translations" on lexicon_translations for select using (true);

-- Profiles: owner only
create policy "own profile" on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- User words: owner only
create policy "own words" on user_words
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Tags: system tags readable by all; custom tags owner-only
create policy "read system or own tags" on tags
  for select using (user_id is null or user_id = auth.uid());
create policy "write own tags" on tags
  for insert with check (user_id = auth.uid());
create policy "update own tags" on tags
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own tags" on tags
  for delete using (user_id = auth.uid());

-- Join table: through word ownership
create policy "own word tags" on user_word_tags
  for all using (
    exists (select 1 from user_words w where w.id = user_word_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from user_words w where w.id = user_word_id and w.user_id = auth.uid())
  );

-- Conjugations / examples: base-linked rows are public-read; user rows owner-only
create policy "read base or own conjugations" on conjugations
  for select using (
    lexicon_ref is not null
    or exists (select 1 from user_words w where w.id = user_word_id and w.user_id = auth.uid())
  );
create policy "write own conjugations" on conjugations
  for insert with check (
    exists (select 1 from user_words w where w.id = user_word_id and w.user_id = auth.uid())
  );
create policy "delete own conjugations" on conjugations
  for delete using (
    exists (select 1 from user_words w where w.id = user_word_id and w.user_id = auth.uid())
  );

create policy "read base or own examples" on example_sentences
  for select using (
    lexicon_ref is not null
    or exists (select 1 from user_words w where w.id = user_word_id and w.user_id = auth.uid())
  );
create policy "write own examples" on example_sentences
  for insert with check (
    exists (select 1 from user_words w where w.id = user_word_id and w.user_id = auth.uid())
  );
create policy "delete own examples" on example_sentences
  for delete using (
    exists (select 1 from user_words w where w.id = user_word_id and w.user_id = auth.uid())
  );

-- SRS: owner only
create policy "own srs cards" on srs_cards
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own srs reviews" on srs_reviews
  for all using (
    exists (select 1 from srs_cards c where c.id = card_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from srs_cards c where c.id = card_id and c.user_id = auth.uid())
  );

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
