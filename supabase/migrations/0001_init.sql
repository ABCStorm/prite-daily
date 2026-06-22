-- ============================================================================
-- PRITE Daily — initial schema
--
-- Questions themselves stay STATIC (public/data/questions.json + /images), so
-- there is no questions table. A question is referenced everywhere by a stable
-- text id: "<year>-<q_index>", e.g. "2014-83". This DB holds only the dynamic
-- data: who may participate, their answers, notes, the shared group thread,
-- canonical flashcards, and per-user settings.
--
-- Access model: Google login → a profile row is auto-created. If the email is
-- on the roster (or matches the configured workspace domain) it is approved
-- immediately; otherwise it lands as 'pending' for an admin to approve.
-- Row-Level Security enforces all of this; cross-user aggregates (per-question
-- stats, leaderboard) are exposed only through SECURITY DEFINER functions.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('resident', 'faculty', 'alumni', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_status as enum ('pending', 'approved', 'blocked');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- app_config — single-row global config (workspace auto-approve domain, etc.)
-- ----------------------------------------------------------------------------
create table if not exists app_config (
  id              boolean primary key default true check (id),  -- enforces one row
  workspace_domain text,                                        -- e.g. 'wright.edu' → auto-approve
  updated_at      timestamptz not null default now()
);
insert into app_config (id) values (true) on conflict do nothing;

-- ----------------------------------------------------------------------------
-- roster — allowlist of emails approved up-front (residents, named faculty…)
-- ----------------------------------------------------------------------------
create table if not exists roster (
  email      text primary key,
  role       user_role not null default 'resident',
  note       text,
  added_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- profiles — one per authenticated user (id = auth.users.id)
-- ----------------------------------------------------------------------------
create table if not exists profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text unique not null,
  full_name   text,
  avatar_url  text,
  role        user_role   not null default 'resident',
  status      user_status not null default 'pending',
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- settings — per-user study config (the 5/10/20 regimen, recycling, exam date)
-- ----------------------------------------------------------------------------
create table if not exists settings (
  user_id            uuid primary key references profiles (id) on delete cascade,
  regimen            int  not null default 10 check (regimen in (5, 10, 20)),
  recycle_missed     bool not null default true,
  recycle_after_days int  not null default 14 check (recycle_after_days >= 0),
  exam_date          date,
  updated_at         timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- answers — one row per (user, question); updated on re-answer
-- ----------------------------------------------------------------------------
create table if not exists answers (
  user_id        uuid not null references profiles (id) on delete cascade,
  question_id    text not null,
  picked         text[] not null,          -- letters chosen, e.g. {'B'} or {'A','C'}
  correct        bool not null,
  first_correct  bool not null,            -- correct on the very first attempt
  attempts       int  not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (user_id, question_id)
);
create index if not exists answers_question_idx on answers (question_id);
create index if not exists answers_user_idx on answers (user_id);

-- ----------------------------------------------------------------------------
-- individual_notes — private, one per (user, question)
-- ----------------------------------------------------------------------------
create table if not exists individual_notes (
  user_id     uuid not null references profiles (id) on delete cascade,
  question_id text not null,
  text        text not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, question_id)
);

-- ----------------------------------------------------------------------------
-- group_notes — shared attributed thread per question
-- ----------------------------------------------------------------------------
create table if not exists group_notes (
  id          uuid primary key default gen_random_uuid(),
  question_id text not null,
  author_id   uuid not null references profiles (id) on delete cascade,
  text        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists group_notes_question_idx on group_notes (question_id, created_at);

-- ----------------------------------------------------------------------------
-- flashcards — one canonical cached cloze card per question (admin-refined)
-- ----------------------------------------------------------------------------
create table if not exists flashcards (
  question_id text primary key,
  cloze_text  text not null,        -- "{{c1::...}} ... {{c2::...}}"
  extra       text not null default '',  -- Q&A + AI explanation
  created_by  uuid references profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- ============================================================================
-- helpers
-- ============================================================================
create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function is_approved()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'approved');
$$;

-- new auth user → profile, auto-approved if on roster or workspace domain
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r_role   user_role;
  domain   text;
  approved boolean := false;
  final_role user_role := 'resident';
begin
  select role into r_role from roster where lower(email) = lower(new.email);
  select workspace_domain into domain from app_config where id;

  if r_role is not null then
    approved := true; final_role := r_role;
  elsif domain is not null and domain <> '' and lower(new.email) like '%@' || lower(domain) then
    approved := true; final_role := 'resident';
  end if;

  insert into profiles (id, email, full_name, avatar_url, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    final_role,
    case when approved then 'approved'::user_status else 'pending'::user_status end
  )
  on conflict (id) do nothing;

  insert into settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================================
-- Row-Level Security
-- ============================================================================
alter table app_config       enable row level security;
alter table roster           enable row level security;
alter table profiles         enable row level security;
alter table settings         enable row level security;
alter table answers          enable row level security;
alter table individual_notes enable row level security;
alter table group_notes      enable row level security;
alter table flashcards       enable row level security;

-- (drop-if-exists before each create so the whole file is safe to re-run)

-- profiles: you can read approved members (for leaderboard names) + yourself;
-- you can update your own profile; admins can update anyone (approvals).
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select
  using (status = 'approved' or id = auth.uid() or is_admin());
drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists profiles_admin_update on profiles;
create policy profiles_admin_update on profiles for update
  using (is_admin());

-- settings: yours only.
drop policy if exists settings_own on settings;
create policy settings_own on settings for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- answers: yours only (aggregates are exposed via SECURITY DEFINER functions).
drop policy if exists answers_own on answers;
create policy answers_own on answers for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- individual notes: yours only.
drop policy if exists notes_own on individual_notes;
create policy notes_own on individual_notes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- group notes: approved members read all; author inserts own; author or admin deletes.
drop policy if exists group_read on group_notes;
create policy group_read on group_notes for select using (is_approved() or is_admin());
drop policy if exists group_insert on group_notes;
create policy group_insert on group_notes for insert with check (author_id = auth.uid() and is_approved());
drop policy if exists group_delete on group_notes;
create policy group_delete on group_notes for delete using (author_id = auth.uid() or is_admin());

-- flashcards: approved members read; admins write.
drop policy if exists flash_read on flashcards;
create policy flash_read on flashcards for select using (is_approved() or is_admin());
drop policy if exists flash_write on flashcards;
create policy flash_write on flashcards for all using (is_admin()) with check (is_admin());

-- roster + app_config: admins only.
drop policy if exists roster_admin on roster;
create policy roster_admin on roster for all using (is_admin()) with check (is_admin());
drop policy if exists config_admin on app_config;
create policy config_admin on app_config for all using (is_admin()) with check (is_admin());

-- ============================================================================
-- aggregate RPCs (run elevated so raw answers stay private)
-- ============================================================================

-- per-question class stats + answer-choice distribution
create or replace function question_stats(q_id text)
returns table (attempts bigint, correct bigint, pct_correct int, distribution jsonb)
language sql stable security definer set search_path = public as $$
  with rows as (select * from answers where question_id = q_id),
  dist as (
    select letter, count(*) c
    from rows, unnest(rows.picked) letter group by letter
  )
  select
    (select count(*) from rows),
    (select count(*) from rows where correct),
    coalesce((select round(100.0 * count(*) filter (where correct) / nullif(count(*),0)) from rows), 0)::int,
    coalesce((select jsonb_object_agg(letter, c) from dist), '{}'::jsonb);
$$;

-- class leaderboard (approved members), ordered by questions answered
create or replace function leaderboard()
returns table (user_id uuid, full_name text, answered bigint, correct bigint, accuracy int)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(p.full_name, p.email),
         count(a.*) ,
         count(a.*) filter (where a.first_correct),
         coalesce(round(100.0 * count(a.*) filter (where a.first_correct) / nullif(count(a.*),0)),0)::int
  from profiles p
  left join answers a on a.user_id = p.id
  where p.status = 'approved'
  group by p.id, p.full_name, p.email
  order by 3 desc, 5 desc;  -- answered, then accuracy (by output column position)
$$;

grant execute on function question_stats(text) to authenticated;
grant execute on function leaderboard() to authenticated;
