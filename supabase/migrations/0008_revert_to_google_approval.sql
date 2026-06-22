-- ============================================================================
-- Revert auth back to GOOGLE sign-in.
--
-- We tried email + password with a wright.edu allowlist (migration 0007), but
-- Wright State's Microsoft 365 filtering blocks the confirmation/reset emails
-- (even from a verified domain via Resend), so that path is a dead end. Google
-- sign-in needs no email delivery at all, so we're going back to it.
--
-- This restores the name-matching auto-approval trigger from 0002 and UNDOES the
-- allowlist-only "raise if not on roster" behaviour 0007 installed (which would
-- otherwise reject every Google account whose email isn't in the roster table).
--
-- Run this AFTER 0007. No data is dropped.
--
-- Dashboard side (see SUPABASE_SETUP.md): re-enable the Google provider, and you
-- can turn Custom SMTP back off — Google auth sends no email.
-- ============================================================================

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r_role     user_role;
  domain     text;
  approved   boolean := false;
  final_role user_role := 'resident';
  nm         text;
  toks       text[];
  in_first   text;
  in_last    text;
  hit        int;
begin
  select role into r_role from roster where lower(email) = lower(new.email);
  select workspace_domain into domain from app_config where id;

  if r_role is not null then
    approved := true; final_role := r_role;
  elsif domain is not null and domain <> '' and lower(new.email) like '%@' || lower(domain) then
    approved := true; final_role := 'resident';
  else
    -- name match against the resident roster (Google display name)
    nm := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '');
    nm := regexp_replace(nm, ',?\s*(m\.?d\.?|d\.?o\.?|ph\.?d\.?)\.?\s*$', '', 'i');
    nm := btrim(nm);
    if nm <> '' then
      toks := regexp_split_to_array(nm, '\s+');
      in_first := lower(toks[1]);
      in_last  := lower(toks[array_length(toks, 1)]);
      select 1 into hit from roster_names
        where lower(last_name) = in_last
          and (lower(first_name) = in_first or left(lower(first_name), 1) = left(in_first, 1))
        limit 1;
      if hit is not null then approved := true; final_role := 'resident'; end if;
    end if;
  end if;

  insert into profiles (id, email, full_name, avatar_url, role, status)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    final_role,
    case when approved then 'approved'::user_status else 'pending'::user_status end
  )
  on conflict (id) do nothing;

  insert into settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

-- keep yourself an admin regardless of how the trigger classified you
update profiles set role = 'admin', status = 'approved'
where lower(email) = 'andrew.correll@wright.edu';
