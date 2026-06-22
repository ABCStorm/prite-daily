-- ============================================================================
-- Switch to email + password auth with an EMAIL ALLOWLIST.
--
-- Wright State is on Microsoft SSO, and getting IT to bless an OAuth app is a
-- hassle. Instead: residents register with their wright.edu email + a password
-- and confirm a link we email them. Confirming the link proves they own that
-- inbox — so no university OAuth is needed.
--
-- Access is restricted to a hand-maintained allowlist (the `roster` table):
--   * email on the roster  -> account is created, auto-approved, given that role
--   * email NOT on roster   -> sign-up is REJECTED (no account, no email sent)
--
-- This replaces the Google-name-matching behaviour from 0002. Run this AFTER
-- 0001–0006. It only changes the signup trigger + seeds the allowlist; no data
-- is dropped.
--
-- !! Dashboard steps that go with this migration (see SUPABASE_SETUP.md) !!
--   1. Authentication -> Providers: enable "Email", disable Google.
--   2. Authentication -> Providers -> Email: turn ON "Confirm email".
--   3. Authentication -> SMTP: add a real SMTP sender (Resend/Brevo/...) so the
--      ~60 confirmation emails actually deliver (the built-in sender is capped).
-- ============================================================================

-- This deployment is allowlist-only: no whole-domain auto-approve.
update app_config set workspace_domain = null;

-- ----------------------------------------------------------------------------
-- New signup handler: roster-gated, auto-approve, copy the name from metadata.
-- Raising here aborts the auth.users insert, so a non-allowlisted email can't
-- create an account at all (GoTrue returns a generic "Database error", which the
-- client maps to a friendly "ask an admin to add you" message).
-- ----------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r_role user_role;
begin
  select role into r_role from roster where lower(email) = lower(new.email);

  if r_role is null then
    raise exception 'EMAIL_NOT_ALLOWLISTED: % is not on the approved list', new.email
      using errcode = 'check_violation';
  end if;

  insert into profiles (id, email, full_name, avatar_url, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    r_role,
    'approved'::user_status
  )
  on conflict (id) do nothing;

  insert into settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

-- (trigger on_auth_user_created from 0001 already points at this function)

-- ----------------------------------------------------------------------------
-- Seed the allowlist.
--   * The admin (you) is seeded below.
--   * Add the rest of the approved wright.edu emails in the second block.
-- Roles: 'resident' | 'faculty' | 'alumni' | 'admin'.
-- ----------------------------------------------------------------------------
insert into roster (email, role) values
  ('andrew.correll@wright.edu', 'admin')
on conflict (email) do update set role = excluded.role;

-- >>> Paste the approved emails here, then re-run this block (or the whole file).
-- insert into roster (email, role) values
--   ('first.last@wright.edu',   'resident'),
--   ('another.name@wright.edu', 'resident'),
--   ('attending@wright.edu',    'faculty')
-- on conflict (email) do nothing;
