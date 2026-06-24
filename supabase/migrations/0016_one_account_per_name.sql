-- ============================================================================
-- Limit roster name-match auto-approval to ONE account per name.
--
-- The name-match path auto-approves any Google account whose display name
-- matches the roster. That means a stranger who finds a resident's name online
-- could sign up with a matching Google name and get auto-approved. This makes
-- only the FIRST account claiming a given name auto-approve; any later account
-- with the same name lands in the pending queue for an admin to approve (the
-- legitimate "two real people share a name" case still works — it just needs a
-- human nod).
--
-- Exception: Andrew Correll may hold multiple same-name accounts (auto-approved).
--
-- Duplicate detection uses the FULL first name (not just the initial) so that
-- distinct residents who share a last name and first initial — e.g. Alexandra
-- vs Alyssa Fowler — are NOT treated as the same person.
--
-- Builds on 0011 (admin/faculty class_year roles). Run AFTER 0011.
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
begin
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
          -- exception: allow multiple same-name accounts
          approved := true;
        else
          -- count existing accounts that already use this exact name
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

-- keep the primary admin account admin regardless of the above
update profiles set role = 'admin', status = 'approved'
where lower(email) = 'andrew.correll@wright.edu';
