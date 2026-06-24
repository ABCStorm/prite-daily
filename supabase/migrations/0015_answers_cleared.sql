-- "Clear learning opportunities" keeps the answer history but hides those misses
-- from the review list. A per-answer `cleared` flag does that: the row (and all
-- its stats) stays; it just no longer counts as an outstanding learning
-- opportunity. Defaults false so existing answers are unaffected.
alter table answers add column if not exists cleared boolean not null default false;
