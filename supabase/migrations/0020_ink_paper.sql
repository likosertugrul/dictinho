-- Paper for handwritten pages: the sheet's colour and its ruling.
--
-- Two plain text columns, like `pos` and `topic`: the allowed keys live in the
-- app (src/lib/paper.ts) and are shared by the DB, the editor and the
-- thumbnails. Null means "whatever the app defaults to", so existing pages
-- keep rendering as cream + ruled without a backfill.
--   paper: cream | white | mint | blush | sky
--   rule:  lines | grid | dots | blank

alter table ink_drawings add column if not exists paper text;
alter table ink_drawings add column if not exists rule  text;
