-- Daniel Abramson and Sirtaj Singh, confirmed as F2 fellows — same gap as
-- Blair Hermiller in 0026 (fellows were never added to roster_names, only
-- faculty + the five resident classes). class_year 'fellow' isn't
-- special-cased in handle_new_user()'s role mapping, so it falls through to
-- the default role='resident', same as other fellows already get today.
insert into roster_names (first_name, last_name, class_year) values
  ('Daniel', 'Abramson', 'fellow'),
  ('Sirtaj', 'Singh', 'fellow')
on conflict (first_name, last_name) do nothing;
