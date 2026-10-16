-- Account deletion (Apple App Store Guideline 5.1.1(v)) needs
-- `auth.admin.deleteUser()` to succeed, and it could not: profiles referenced
-- auth.users with no ON DELETE action, so Postgres refused to remove the auth
-- row while a profile pointed at it.
--
-- With the cascade in place, deleting the auth user removes everything in one
-- step: profiles → user_words → (conjugations, example_sentences,
-- user_word_tags), srs_cards → srs_reviews, tags, and ink_drawings (which
-- already referenced auth.users directly).

alter table profiles drop constraint if exists profiles_id_fkey;

alter table profiles
  add constraint profiles_id_fkey
  foreign key (id) references auth.users (id) on delete cascade;
