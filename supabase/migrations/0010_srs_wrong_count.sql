-- Count how many times each card has been answered wrong, to surface words
-- the user repeatedly struggles with ("tough words").
alter table srs_cards
  add column wrong_count int not null default 0;

-- Backfill from the review log
update srs_cards c
set wrong_count = sub.n
from (
  select card_id, count(*) as n from srs_reviews where rating < 3 group by card_id
) sub
where sub.card_id = c.id;

create index srs_cards_user_wrong_count on srs_cards (user_id, wrong_count);
