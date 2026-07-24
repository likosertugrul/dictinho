# Dictinho — Veritabanı Şeması (Postgres / Supabase)

i18n-ready: her içerik tablosu `source_language` / `target_language` taşır (ISO-639-1).
Base lexicon (herkese açık sözlük) ile kişisel kelimeler ayrı tablolardadır;
kişisel kayıt opsiyonel `lexicon_ref` ile base'e bağlanır.

## Extension'lar

```sql
create extension if not exists pg_trgm;
create extension if not exists unaccent;  -- search_lexicon normalizasyonu için
```

## Tablolar

```sql
create table languages (
  code        text primary key,          -- 'en','it'
  name_native text not null,
  name_en     text not null,
  is_rtl      boolean not null default false
);

-- Herkese açık base sözlük (autocomplete kaynağı; seed + AI ile zenginleşir)
create table lexicon_entries (
  id              uuid primary key default gen_random_uuid(),
  target_language text not null references languages(code),   -- öğrenilen dil
  lemma           text not null,                               -- 'avere'
  normalized      text not null,             -- lower+unaccent; trigram index bunun üstünde
  pos             text not null,             -- 'verb'|'noun'|'adj'|'adv'|'prep'|...
  gender          text,                      -- 'm'|'f' (isimler)
  auxiliary       text,                      -- 'essere'|'avere' (fiiller)
  is_irregular    boolean not null default false,
  cefr            text,                      -- 'A1'..'C2'
  frequency_rank  int,                       -- autocomplete sıralaması
  source          text not null default 'seed',  -- 'seed'|'ai'|'user'
  created_at      timestamptz not null default now(),
  unique (target_language, lemma, pos)
);

-- lemma'nın kaynak dildeki anlamları (çoklu anlam)
create table lexicon_translations (
  id              uuid primary key default gen_random_uuid(),
  entry_id        uuid not null references lexicon_entries(id) on delete cascade,
  source_language text not null references languages(code),
  translation     text not null,             -- 'to have'
  sense_order     int not null default 0,
  notes           text
);

-- Kullanıcı profili (auth.users ile 1-1)
create table profiles (
  id            uuid primary key references auth.users(id),
  display_name  text,
  avatar_url    text,
  learning_pair jsonb not null default '{"source":"en","target":"it"}',
  streak_count  int not null default 0,
  gems          int not null default 0,
  created_at    timestamptz not null default now()
);

-- Kişisel kelime hazinesi
create table user_words (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  lexicon_ref     uuid references lexicon_entries(id),
  target_language text not null references languages(code),
  source_language text not null references languages(code),
  lemma           text not null,
  translation     text not null,             -- kullanıcının kendi karşılığı
  pos             text not null,
  gender          text,
  auxiliary       text,
  cefr            text,
  notes           text,
  created_at      timestamptz not null default now()
);

-- Etiketler (tema + CEFR + kullanıcı-özel)
create table tags (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,  -- null => sistem etiketi (CEFR)
  name    text not null,                    -- 'Travel','Food','A1'
  kind    text not null,                    -- 'theme'|'cefr'|'custom'
  color   text,                             -- pastel kart rengi (token adı)
  icon    text
);

create table user_word_tags (
  user_word_id uuid not null references user_words(id) on delete cascade,
  tag_id       uuid not null references tags(id) on delete cascade,
  primary key (user_word_id, tag_id)
);

-- Fiil çekimleri (zaman + şahıs bazlı; kişisel fiile VEYA base fiile bağlı)
create table conjugations (
  id           uuid primary key default gen_random_uuid(),
  user_word_id uuid references user_words(id) on delete cascade,
  lexicon_ref  uuid references lexicon_entries(id) on delete cascade,
  tense        text not null,  -- 'presente'|'passato_prossimo'|'imperfetto'|'futuro_semplice'|...
  mood         text not null default 'indicativo',
  person       text not null,  -- 'io'|'tu'|'lui_lei'|'noi'|'voi'|'loro'
  form         text not null,  -- 'ho','hai','ha'...
  is_compound  boolean not null default false,  -- passato prossimo (aux + participio)
  source       text not null default 'ai',      -- 'ai'|'rule'|'user'
  check (user_word_id is not null or lexicon_ref is not null)
);

-- NOT: UNIQUE constraint ifade kabul etmez; expression için unique INDEX gerekir:
create unique index conjugations_owner_tense_person_uq
  on conjugations (coalesce(user_word_id, lexicon_ref), tense, mood, person);

-- Bağlamsal örnek cümleler
create table example_sentences (
  id           uuid primary key default gen_random_uuid(),
  user_word_id uuid references user_words(id) on delete cascade,
  lexicon_ref  uuid references lexicon_entries(id) on delete cascade,
  target_text  text not null,               -- İtalyanca cümle
  source_text  text not null,               -- İngilizce çeviri
  tense        text,                        -- hangi zamana örnek
  source       text not null default 'ai',  -- 'ai'|'user'
  check (user_word_id is not null or lexicon_ref is not null)
);

-- SRS durumu (kelime VEYA çekim kartı; SM-2)
create table srs_cards (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  card_type     text not null,              -- 'word'|'conjugation'
  ref_id        uuid not null,              -- user_words.id veya conjugations.id
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
  rating      int not null,                 -- 0..5 (SM-2 quality)
  reviewed_at timestamptz not null default now()
);
```

## İndeksler

```sql
create index lexicon_entries_normalized_trgm
  on lexicon_entries using gin (normalized gin_trgm_ops);
create index lexicon_entries_lang_freq
  on lexicon_entries (target_language, frequency_rank);
create index srs_cards_user_due on srs_cards (user_id, due_at);
create index user_words_user on user_words (user_id, created_at desc);
```

## RLS

- `user_words`, `user_word_tags`, `srs_cards`, `srs_reviews`, `profiles`,
  kullanıcıya bağlı `tags` ve `conjugations`/`example_sentences` (user_word_id
  üzerinden) → `user_id = auth.uid()`
- `languages`, `lexicon_entries`, `lexicon_translations` → herkese `select`;
  yazma yalnızca service role (seed/AI enrichment Edge Function'ları)

## Autocomplete RPC

```sql
create or replace function search_lexicon(q text, target text, max_results int default 8)
returns table (id uuid, lemma text, pos text, auxiliary text, cefr text, translation text)
language sql stable as $$
  select e.id, e.lemma, e.pos, e.auxiliary, e.cefr,
         (select t.translation from lexicon_translations t
           where t.entry_id = e.id order by t.sense_order limit 1)
  from lexicon_entries e
  where e.target_language = target
    and (e.normalized like lower(unaccent(q)) || '%'   -- prefix önce
         or e.normalized % lower(unaccent(q)))          -- sonra fuzzy (pg_trgm)
  order by (e.normalized like lower(unaccent(q)) || '%') desc,
           e.frequency_rank nulls last
  limit max_results;
$$;
```

## SQLite taşınabilirlik notu

`uuid`→`text`, `jsonb`→`text`, `timestamptz`→ISO `text`; trigram yerine
`LIKE 'q%'` + FTS5. Tablo/kolon yapısı birebir korunur.
