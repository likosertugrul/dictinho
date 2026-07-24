-- A word re-added from the search flow created a second user_words row.
-- Deduplicate (keep the row with the most conjugations, then the newest) and
-- enforce uniqueness per user + lemma (case-insensitive) + pos going forward.
-- The app now upserts: re-adding merges tenses into the existing word.

with ranked as (
  select w.id,
         row_number() over (
           partition by w.user_id, lower(w.lemma), w.pos
           order by (select count(*) from conjugations c where c.user_word_id = w.id) desc,
                    w.created_at desc
         ) as rn
  from user_words w
)
delete from user_words
where id in (select id from ranked where rn > 1);

create unique index user_words_user_lemma_pos_uq
  on user_words (user_id, lower(lemma), pos);
