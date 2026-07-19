-- ============================================================================
-- Make placeholder seats self-claiming: when one of the residents represented
-- by a 0054 placeholder account signs in for the first time, their real
-- account should immediately be approved, get the placeholder's PGY level, and
-- take over its weekly_teams / stable_teams seats — so they can participate
-- live on Tuesday with zero admin intervention. The placeholder is then
-- deleted (cascades to its profile/settings/seats).
--
-- Without this, migration 0016's one-account-per-name rule would see the
-- placeholder as the "first claim" on the name and send the REAL resident to
-- the pending queue with no team.
--
-- Also: stop the daily-reminder emailer from mailing the placeholders' fake
-- @quizapine.local addresses (8 hard bounces/day would hurt Resend sender
-- reputation). The merge path gives the real account a FRESH settings row, so
-- reminders behave like any normal signup once they claim the seat.
--
-- Builds on 0016 (one-account-per-name) + 0054 (placeholders). Run AFTER both.
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
  matched_cy text;
  taken      int := 0;
  is_andrew  boolean := false;
  ph         record;
begin
  -- ---- placeholder merge (checked first, before every other rule) ----------
  -- A placeholder (0054) is a seat being held for a known resident. If this
  -- new sign-in's display name matches one (same rule as the roster match:
  -- last name equal + first name or initial equal), the person has arrived:
  -- approve them, hand over the level and team seats, drop the placeholder.
  if new.email not like 'placeholder+%' then
    nm := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '');
    nm := regexp_replace(nm, ',?\s*(m\.?d\.?|d\.?o\.?|ph\.?d\.?)\.?\s*$', '', 'i');
    nm := btrim(nm);
    if nm <> '' then
      toks := regexp_split_to_array(nm, '\s+');
      in_first := lower(toks[1]);
      in_last  := lower(toks[array_length(toks, 1)]);

      select p.id, p.training_level, p.role into ph
      from profiles p
      cross join lateral (select regexp_split_to_array(btrim(coalesce(p.full_name, '')), '\s+') as pt) w
      where p.email like 'placeholder+%@quizapine.local'
        and lower(w.pt[array_length(w.pt, 1)]) = in_last
        and (lower(w.pt[1]) = in_first or left(lower(w.pt[1]), 1) = left(in_first, 1))
      limit 1;

      if ph.id is not null then
        insert into profiles (id, email, full_name, avatar_url, role, status, training_level)
        values (
          new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
          new.raw_user_meta_data->>'avatar_url',
          coalesce(ph.role, 'resident'), 'approved'::user_status, ph.training_level
        )
        on conflict (id) do nothing;

        -- fresh settings row: reminders behave like any normal new account
        insert into settings (user_id) values (new.id) on conflict do nothing;

        -- hand over the team seats
        update weekly_teams set profile_id = new.id where profile_id = ph.id;
        update stable_teams set profile_id = new.id where profile_id = ph.id;

        -- retire the placeholder (cascades to its profile + settings)
        delete from auth.users where id = ph.id;
        return new;
      end if;
    end if;
  end if;

  -- ---- everything below is unchanged from 0016 -----------------------------
  select role into r_role from roster where lower(email) = lower(new.email);
  select workspace_domain into domain from app_config where id;

  if r_role is not null then
    approved := true; final_role := r_role;
  elsif domain is not null and domain <> '' and lower(new.email) like '%@' || lower(domain) then
    approved := true; final_role := 'resident';
  else
    nm := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '');
    nm := regexp_replace(nm, ',?\s*(m\.?d\.?|d\.?o\.?|ph\.?d\.?)\.?\s*$', '', 'i');
    nm := btrim(nm);
    if nm <> '' then
      toks := regexp_split_to_array(nm, '\s+');
      in_first := lower(toks[1]);
      in_last  := lower(toks[array_length(toks, 1)]);
      is_andrew := (in_first = 'andrew' and in_last = 'correll');

      select class_year into matched_cy from roster_names
        where lower(last_name) = in_last
          and (lower(first_name) = in_first or left(lower(first_name), 1) = left(in_first, 1))
        limit 1;

      if matched_cy is not null then
        if is_andrew then
          approved := true;
        else
          select count(*) into taken
          from profiles p
          cross join lateral (
            select btrim(regexp_replace(coalesce(p.full_name, ''),
              ',?\s*(m\.?d\.?|d\.?o\.?|ph\.?d\.?)\.?\s*$', '', 'i')) as pn
          ) z
          cross join lateral (select regexp_split_to_array(z.pn, '\s+') as pt) w
          where z.pn <> ''
            and lower(w.pt[1]) = in_first
            and lower(w.pt[array_length(w.pt, 1)]) = in_last;

          if taken = 0 then approved := true; end if;  -- first claim only
        end if;

        if approved then
          final_role := case matched_cy
            when 'admin'   then 'admin'::user_role
            when 'faculty' then 'faculty'::user_role
            else                'resident'::user_role
          end;
        end if;
      end if;
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

-- ---- silence reminder emails to the fake placeholder addresses -------------
-- (their settings rows were auto-created by the 0054 inserts; the real
-- account's fresh settings row above restores normal reminder behaviour)
update settings set daily_reminder = false
where user_id in (
  select id from profiles where email like 'placeholder+%@quizapine.local'
);

-- ---- Sierrah Fulmer is not a residency member ------------------------------
-- Remove her from the auto-approve name list so no future same-name account
-- can auto-approve (her existing account stays, held at status='pending').
delete from roster_names
where lower(first_name) = 'sierrah' and lower(last_name) = 'fulmer';
