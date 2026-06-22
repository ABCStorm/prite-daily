-- ============================================================================
-- Auto-approve by NAME match.
--
-- Wright State is on Microsoft SSO, so residents sign in with personal Google
-- accounts (no wright.edu email to match on). Instead we match the Google
-- account's display name against the known resident roster: if first + last
-- name line up, the new user is auto-approved as a resident. Everyone else
-- (faculty, alumni, name mismatches / nicknames) lands in the admin queue.
--
-- This runs inside handle_new_user() (SECURITY DEFINER), so approval can't be
-- self-granted from the client.
-- ============================================================================

create table if not exists roster_names (
  first_name text not null,
  last_name  text not null,
  class_year text,
  primary key (first_name, last_name)
);

insert into roster_names (first_name, last_name, class_year) values
  ('Sara','Barlow','2026'),('Monica','Chi','2026'),('Aaron','Cotney','2026'),
  ('Andrew','Dobry','2026'),('Aubrey','Lippert','2026'),('Ben','Onnink','2026'),
  ('Hunter','Smothers','2026'),('Benjamin','Wise','2026'),('David','Zealley','2026'),
  ('Samantha','Achauer','2027'),('Ryan','Bernal','2027'),('Katie','Clark','2027'),
  ('Samantha','Courtney','2027'),('Sarah','Craft','2027'),('Smiti','Gupta','2027'),
  ('Saagar','Kulkarni','2027'),('Sondos','Mishal','2027'),('Robert','Rodgers','2027'),
  ('Samantha','Ruffe','2027'),('Prasun','Shah','2027'),('Jacob','Weber','2027'),
  ('Tyler','Yorgason','2027'),('Logan','Yusuf','2027'),
  ('Shane','Berger','2028'),('Samuel','Cain','2028'),('Andrew','Correll','2028'),
  ('Corianne','Victor','2028'),('Cheyenne','Dryer','2028'),('Sierrah','Hawkins','2028'),
  ('Noor','Haq','2028'),('Geoffrey','McLatchey','2028'),('Sana','Shameem','2028'),
  ('Needa','Toofanny','2028'),('Rylee','Tucker','2028'),('Aidan','Vatalaro','2028'),
  ('Bridget','Daughton','2029'),('Alyssa','Fowler','2029'),('Alexandria','Fowler','2029'),
  ('Joseph','Griffin','2029'),('Logan','Heckart','2029'),('Seth','Holmquist','2029'),
  ('Caleb','Hudson','2029'),('Annika','Kisha','2029'),('Maleka','Nozile','2029'),
  ('Adam','Quinn','2029'),('Michael','Raischel','2029'),('Alessa','Rosas','2029'),
  ('Holland','Arnold','2030'),('Jonathan','Clement','2030'),('Emma','Coyne','2030'),
  ('Nicholas','Coyne','2030'),('Elisabeth','Day','2030'),('Parviz','Kanga','2030'),
  ('David','Klopfer','2030'),('John','McCaskey','2030'),('Elizabeth','Monger','2030'),
  ('Emily','Murphy','2030'),('James','Pike','2030'),('Lara','Shoukair','2030')
on conflict (first_name, last_name) do nothing;

alter table roster_names enable row level security;
drop policy if exists roster_names_admin on roster_names;
create policy roster_names_admin on roster_names for all using (is_admin()) with check (is_admin());

-- new auth user → profile, auto-approved if: on the email roster, on the
-- workspace domain, OR the display name matches the resident roster.
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
    -- name match against the resident roster
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
