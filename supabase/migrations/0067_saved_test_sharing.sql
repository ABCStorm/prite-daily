-- Let a saved test be shared with education chiefs, everyone, or named people.
-- Recipients can read (study / host / export). Only the owner can edit or delete.

alter table saved_tests
  add column if not exists visibility text not null default 'private',
  add column if not exists shared_with uuid[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'saved_tests_visibility_check'
  ) then
    alter table saved_tests
      add constraint saved_tests_visibility_check
      check (visibility in ('private', 'chiefs', 'everyone'));
  end if;
end $$;

create or replace function can_read_saved_test(t saved_tests)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    t.user_id = auth.uid()
    or auth.uid() = any (coalesce(t.shared_with, '{}'))
    or (
      t.visibility = 'everyone'
      and exists (
        select 1 from profiles p
        where p.id = auth.uid() and p.status = 'approved'
      )
    )
    or (
      t.visibility = 'chiefs'
      and exists (
        select 1 from profiles p
        where p.id = auth.uid()
          and p.status = 'approved'
          and (p.is_education_chief or p.is_admin or p.role = 'admin')
      )
    );
$$;

drop policy if exists saved_tests_own on saved_tests;
drop policy if exists saved_tests_select on saved_tests;
drop policy if exists saved_tests_insert on saved_tests;
drop policy if exists saved_tests_update on saved_tests;
drop policy if exists saved_tests_delete on saved_tests;

create policy saved_tests_select on saved_tests
  for select using (can_read_saved_test(saved_tests));

create policy saved_tests_insert on saved_tests
  for insert with check (user_id = auth.uid());

create policy saved_tests_update on saved_tests
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy saved_tests_delete on saved_tests
  for delete using (user_id = auth.uid());

revoke all on function can_read_saved_test(saved_tests) from public;
grant execute on function can_read_saved_test(saved_tests) to authenticated;
