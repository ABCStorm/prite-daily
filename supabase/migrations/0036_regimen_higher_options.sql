-- Allow higher daily-question regimens (30, 40, 50) in addition to 5/10/20.
-- The original CHECK constraint (0001_init.sql) rejected anything else, so the
-- app-side type widening has to be matched here or writes of 30/40/50 fail.
alter table settings drop constraint if exists settings_regimen_check;
alter table settings add constraint settings_regimen_check
  check (regimen in (5, 10, 20, 30, 40, 50));
