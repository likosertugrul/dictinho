-- essere/avere is an Italian tense-formation detail, but enrich-word stamped
-- "avere" on every verb it created, whatever the target language — so English
-- and Spanish verbs were showing an "avere" badge on their cards.
-- The function no longer does that; clear the rows it already wrote.

update lexicon_entries set auxiliary = null
where target_language <> 'it' and auxiliary is not null;

update user_words set auxiliary = null
where target_language <> 'it' and auxiliary is not null;
