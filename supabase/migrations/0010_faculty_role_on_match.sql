-- ============================================================================
-- Update handle_new_user() so that roster_names rows with class_year='faculty'
-- auto-approve the user with role='faculty' instead of role='resident'.
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
      select class_year into matched_cy from roster_names
        where lower(last_name) = in_last
          and (lower(first_name) = in_first or left(lower(first_name), 1) = left(in_first, 1))
        limit 1;
      if matched_cy is not null then
        approved := true;
        final_role := case when matched_cy = 'faculty' then 'faculty'::user_role else 'resident'::user_role end;
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
