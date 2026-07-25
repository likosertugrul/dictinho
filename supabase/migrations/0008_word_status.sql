-- Let the user file each word as "learning" (to study) or "known" (already got it).
alter table user_words
  add column status text not null default 'learning'
  check (status in ('learning', 'known'));

create index user_words_user_status on user_words (user_id, status);
