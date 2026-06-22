-- How many missed/review questions to fold into each day's set (the rest of
-- the daily regimen is filled with new questions). Default 3.
alter table settings
  add column if not exists review_per_day int not null default 3
  check (review_per_day >= 0);
