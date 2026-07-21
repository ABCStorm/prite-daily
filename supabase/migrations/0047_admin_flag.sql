-- ============================================================================
-- Decouple admin rights from the role enum so a person can be BOTH a resident
-- and an admin. `is_admin` becomes a standalone boolean flag; the Approvals
-- page now toggles Resident (role) and Admin (this flag) independently.
-- ============================================================================
alter table profiles add column if not exists is_admin boolean not null default false;

-- Everyone who was role='admin' becomes an admin. Flip their role to 'resident'
-- so they also show up on rosters/teams (the current admins are all residents).
update profiles set is_admin = true where role = 'admin';
update profiles set role = 'resident' where role = 'admin';

-- is_admin() now keys off the flag, not the role value.
create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_admin);
$$;

-- Privilege guard: an authenticated non-admin may edit their own row (training
-- level, name, etc.) via the self-update RLS policy, but must NOT be able to
-- change privilege fields — otherwise anyone could self-grant admin. Admins and
-- service-role/dashboard contexts (auth.uid() is null) are unaffected, so the
-- backfill above and future admin actions still work.
create or replace function guard_profile_privilege()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() then
    new.is_admin := old.is_admin;
    new.role     := old.role;
    new.status   := old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_privilege on profiles;
create trigger guard_profile_privilege before update on profiles
  for each row execute function guard_profile_privilege();
