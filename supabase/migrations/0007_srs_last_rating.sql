-- Track the most recent review rating on each card so we can surface a
-- "mistakes" list (words whose last answer was wrong: rating < 3).
alter table srs_cards
  add column last_rating int;

create index srs_cards_user_last_rating on srs_cards (user_id, last_rating);
