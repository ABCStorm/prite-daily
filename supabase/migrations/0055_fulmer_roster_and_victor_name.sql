-- ============================================================================
-- Two roster corrections found during the post-0054 audit:
--
-- 1) Sierrah Fulmer (R1, class of 2030) already has an approved account and is
--    in the randomizer, but she was missing from roster_names (the name-match
--    auto-approve list). Add her for record completeness.
--
-- 2) Corianne goes by "Victor" everywhere on the site (program direction), but
--    her profile was still displaying the name "Corianne Crider". Her email
--    stays as-is; only the display name changes.
-- Both statements are idempotent.
-- ============================================================================

insert into roster_names (first_name, last_name, class_year)
select 'Sierrah', 'Fulmer', '2030'
where not exists (
  select 1 from roster_names
  where lower(first_name) = 'sierrah' and lower(last_name) = 'fulmer'
);

update profiles set full_name = 'Corianne Victor'
where email = 'coriannecrider@gmail.com' and full_name <> 'Corianne Victor';
