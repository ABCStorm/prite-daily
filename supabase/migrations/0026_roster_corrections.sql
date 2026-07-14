-- Rylee Tucker (class of 2028 / R3) changed her last name to Ramirez after
-- marriage — confirmed accurate and current. Same fix as the Courtney ->
-- Peralta migration: update the roster-name match so her Google account
-- (which now shows the new legal name) auto-approves on sign-in.
update roster_names set last_name = 'Ramirez' where first_name = 'Rylee' and last_name = 'Tucker';

-- Corianne Victor's Google account showed "Corianne Crider" at signup, which
-- didn't match the existing (Corianne, Victor) roster row and required manual
-- approval. Add "Crider" as a second name for the same person (same pattern
-- as storing both "R. Newman" and "Mark Newman" in 0009) rather than renaming
-- the existing row, since it's unclear which name she'll sign in under next.
insert into roster_names (first_name, last_name, class_year) values
  ('Corianne', 'Crider', '2028')
on conflict (first_name, last_name) do nothing;

-- Note: Sierrah Hawkins has NOT changed her name — the "Sierrah Fulmer" signup
-- that also failed to auto-match is a different, unconfirmed situation and is
-- intentionally left alone here.

-- Fellows were never added to roster_names at all (only faculty + the five
-- resident classes), so every incoming fellow has required manual approval
-- regardless of name accuracy. class_year 'fellow' isn't special-cased in
-- handle_new_user()'s role mapping, so it falls through to the default
-- role='resident' — the same role fellows already get today.
-- (Only Blair Hermiller is added here — confirmed as a fellow. Other unmatched
-- names found during the earlier audit (e.g. Daniel Abramson, Sirtaj Singh)
-- weren't re-confirmed and are intentionally left out.)
insert into roster_names (first_name, last_name, class_year) values
  ('Blair', 'Hermiller', 'fellow')
on conflict (first_name, last_name) do nothing;
