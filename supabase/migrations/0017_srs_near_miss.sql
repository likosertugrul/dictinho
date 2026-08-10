-- A typo ("formagio" for "formaggio") landed in the same Mistakes bucket as
-- genuinely not knowing the word, which made that list useless for spotting
-- what you actually don't know. Record whether the last wrong answer was only
-- a slip, so the two can be listed — and drilled — separately.
--
-- It describes the LAST answer, like last_rating: answering correctly clears it.

alter table srs_cards add column if not exists last_near_miss boolean not null default false;
