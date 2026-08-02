-- AI-corrected inflected forms override for a user's word.
-- Nouns store {"singular","plural"}; adjectives store {"m_sg","f_sg","m_pl","f_pl"}.
-- When present, the UI shows these instead of the rule-based inflection (which is
-- wrong for irregular/invariable words, e.g. "la radio" → "le radio", not "le radii").
alter table user_words
  add column if not exists forms jsonb;
