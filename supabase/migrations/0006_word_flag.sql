-- Let the user flag words that need extra attention / review.
alter table user_words
  add column flagged boolean not null default false;

create index user_words_user_flagged on user_words (user_id, flagged);
