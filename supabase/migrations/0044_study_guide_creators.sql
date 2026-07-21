-- Study-guide generation costs real money (Claude + gpt-image-1 + TTS), so
-- it's restricted to admins plus an explicit allowlist of education chiefs.
-- Admins (role = 'admin') always qualify; this table adds the chiefs whose
-- accounts are plain residents. Everyone approved can still READ all guides
-- (study_guides_read is untouched) — only generation is gated.

create table if not exists study_guide_creators (
  profile_id uuid primary key references profiles (id) on delete cascade,
  added_at   timestamptz not null default now()
);

alter table study_guide_creators enable row level security;

-- anyone signed in may check their own membership (the client uses this to
-- show/hide the generate buttons); admins see the whole list and manage it.
drop policy if exists sgc_read on study_guide_creators;
create policy sgc_read on study_guide_creators for select
  using (profile_id = auth.uid() or is_admin());
drop policy if exists sgc_admin_write on study_guide_creators;
create policy sgc_admin_write on study_guide_creators for all
  using (is_admin()) with check (is_admin());

-- seed: the education chiefs who aren't role='admin'
insert into study_guide_creators (profile_id)
select id from profiles where email in (
  'sncourtney95@gmail.com',   -- Samantha Courtney
  'achauers1@gmail.com'       -- Samantha Achauer
)
on conflict (profile_id) do nothing;

-- single source of truth for "may this user generate study guides" — used by
-- the generate-study-guide edge function and available to future policies.
create or replace function can_generate_study_guides()
returns boolean language sql stable security definer set search_path = public as $$
  select is_admin() or exists (
    select 1 from study_guide_creators where profile_id = auth.uid()
  );
$$;
