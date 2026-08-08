-- The onboarding screen offers Turkish, French, German and Portuguese as source
-- languages, but `languages` only held en/it/es. lexicon_translations.source_language
-- is a FK to that table, so every translation written for one of the missing
-- codes was rejected — and enrich-word ignored the insert error, leaving the
-- entry with no translation at all for those learners.
--
-- Keep this list in sync with LEARNABLE + SOURCE_LANGS in src/lib/lang.ts.

insert into languages (code, name_native, name_en) values
  ('tr', 'Türkçe',     'Turkish'),
  ('fr', 'Français',   'French'),
  ('de', 'Deutsch',    'German'),
  ('pt', 'Português',  'Portuguese')
on conflict (code) do nothing;
