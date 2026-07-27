-- The uniqueness of a user's word must be per target language, so the same
-- lemma can exist in Italian and Spanish lists at once.
drop index if exists user_words_user_lemma_pos_uq;

create unique index user_words_user_lang_lemma_pos_uq
  on user_words (user_id, target_language, lower(lemma), pos);
