-- Fix: PL/pgSQL variable `d` collided with CTE alias `daily d` →
-- "column reference d is ambiguous" when building the daily JSON array.

create or replace function admin_usage_dashboard(days_back int default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  window_days int := greatest(7, least(coalesce(days_back, 90), 365));
  since timestamptz := (current_date - window_days)::timestamptz;
  tz text := 'America/New_York';
  result jsonb;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  with
  members as (
    select p.*
    from profiles p
    where p.status = 'approved'
      and coalesce(p.role::text, '') <> 'test'
      and lower(coalesce(p.email, '')) not like 'placeholder%'
      and lower(coalesce(p.full_name, '')) not like 'placeholder%'
  ),
  practice as (
    select
      a.user_id,
      a.question_id,
      a.correct,
      a.first_correct,
      a.attempts,
      a.updated_at,
      (a.updated_at at time zone tz)::date as day
    from answers a
    join members m on m.id = a.user_id
    where a.updated_at >= since
  ),
  polls as (
    select
      pa.user_id,
      pa.question_id,
      pa.poll_code,
      pa.correct,
      pa.created_at,
      (pa.created_at at time zone tz)::date as day
    from poll_answers pa
    join members m on m.id = pa.user_id
    where pa.created_at >= since
  ),
  day_spine as (
    select generate_series(
      (current_date - window_days),
      current_date,
      '1 day'::interval
    )::date as day
  ),
  practice_by_day as (
    select day,
           count(*)::int as practice_answers,
           count(distinct user_id)::int as practice_users,
           count(*) filter (where first_correct)::int as first_ok
    from practice
    group by day
  ),
  poll_by_day as (
    select day,
           count(*)::int as poll_answers,
           count(distinct user_id)::int as poll_users,
           count(distinct poll_code)::int as poll_sessions
    from polls
    group by day
  ),
  daily as (
    select
      ds.day::text as day,
      coalesce(pbd.practice_answers, 0) as practice_answers,
      coalesce(obd.poll_answers, 0) as poll_answers,
      coalesce(pbd.practice_answers, 0) + coalesce(obd.poll_answers, 0) as total_answers,
      (
        select count(distinct uid)::int from (
          select user_id as uid from practice where practice.day = ds.day
          union
          select user_id as uid from polls where polls.day = ds.day
        ) u
      ) as active_users,
      case when coalesce(pbd.practice_answers, 0) > 0
        then round(100.0 * pbd.first_ok / pbd.practice_answers)
        else null
      end as first_try_pct
    from day_spine ds
    left join practice_by_day pbd on pbd.day = ds.day
    left join poll_by_day obd on obd.day = ds.day
    order by ds.day
  ),
  roster as (
    select
      count(*)::int as approved,
      count(*) filter (where role::text = 'resident' or training_level ~ '^R[1-4]$')::int as residents,
      count(*) filter (where training_level = 'R1')::int as r1,
      count(*) filter (where training_level = 'R2')::int as r2,
      count(*) filter (where training_level = 'R3')::int as r3,
      count(*) filter (where training_level = 'R4')::int as r4,
      count(*) filter (where training_level in ('F1','F2') or role::text like '%fellow%')::int as fellows,
      count(*) filter (where role::text = 'faculty' or training_level = 'faculty')::int as faculty,
      count(*) filter (where role::text = 'alumni' or training_level = 'alumni')::int as alumni,
      (select count(*)::int from profiles where status = 'pending') as pending,
      (select count(*)::int from profiles where status = 'blocked') as blocked
    from members
  ),
  top_users as (
    select
      m.id as user_id,
      coalesce(nullif(m.full_name, ''), m.email) as name,
      coalesce(m.training_level, m.role::text) as level,
      count(*)::int as answers,
      count(*) filter (where pr.first_correct)::int as first_ok,
      max(pr.updated_at) as last_active
    from practice pr
    join members m on m.id = pr.user_id
    group by m.id, m.full_name, m.email, m.training_level, m.role
    order by count(*) desc
    limit 12
  ),
  user_activity as (
    select
      m.id,
      coalesce(nullif(m.full_name, ''), m.email) as name,
      coalesce(m.training_level, m.role::text) as level,
      m.role::text as role,
      coalesce(pa.n, 0)::int as practice_answers,
      coalesce(po.n, 0)::int as poll_answers,
      greatest(pa.last_at, po.last_at) as last_active,
      pa.first_ok,
      pa.n as practice_n
    from members m
    left join (
      select user_id, count(*)::int as n,
             count(*) filter (where first_correct)::int as first_ok,
             max(updated_at) as last_at
      from practice group by user_id
    ) pa on pa.user_id = m.id
    left join (
      select user_id, count(*)::int as n, max(created_at) as last_at
      from polls group by user_id
    ) po on po.user_id = m.id
  ),
  quiet as (
    select name, level, role,
           practice_answers, poll_answers,
           last_active
    from user_activity
    where (practice_answers + poll_answers) = 0
       or last_active is null
       or last_active < now() - interval '14 days'
    order by last_active nulls first, name
    limit 40
  ),
  poll_sum as (
    select
      count(*)::int as votes,
      count(distinct user_id)::int as voters,
      count(distinct poll_code)::int as sessions
    from polls
  ),
  totals as (
    select
      (select count(*)::int from practice) as practice_in_window,
      (select count(*)::int from polls) as poll_in_window,
      (select count(distinct user_id)::int from practice) as practice_users_in_window,
      (select count(distinct user_id)::int from (
          select user_id from practice union select user_id from polls
        ) u) as active_users_in_window,
      (select count(*)::int from answers a join members m on m.id = a.user_id
        where a.updated_at >= now() - interval '7 days') as practice_7d,
      (select count(distinct a.user_id)::int from answers a join members m on m.id = a.user_id
        where a.updated_at >= now() - interval '7 days') as users_7d,
      (select count(*)::int from answers a join members m on m.id = a.user_id
        where a.updated_at >= now() - interval '30 days') as practice_30d,
      (select count(distinct a.user_id)::int from answers a join members m on m.id = a.user_id
        where a.updated_at >= now() - interval '30 days') as users_30d,
      (select count(*)::int from answers a join members m on m.id = a.user_id) as practice_all_time,
      (select count(*)::int from answers a join members m on m.id = a.user_id
        where (a.updated_at at time zone tz)::date = current_date) as practice_today,
      (select count(distinct a.user_id)::int from answers a join members m on m.id = a.user_id
        where (a.updated_at at time zone tz)::date = current_date) as users_today,
      (select case when count(*) > 0
              then round(100.0 * count(*) filter (where first_correct) / count(*))
              else null end
       from practice) as first_try_pct_window
  ),
  signups as (
    select (created_at at time zone tz)::date::text as day, count(*)::int as n
    from profiles
    where created_at >= since
      and coalesce(role::text, '') <> 'test'
    group by 1
    order by 1
  )
  select jsonb_build_object(
    'generated_at', now(),
    'days_back', window_days,
    'timezone', tz,
    'roster', (select to_jsonb(r) from roster r),
    'totals', (select to_jsonb(t) from totals t),
    'polls', (select to_jsonb(ps) from poll_sum ps),
    'daily', coalesce((
      select jsonb_agg(to_jsonb(day_row) order by day_row.day)
      from daily day_row
    ), '[]'::jsonb),
    'by_level', coalesce((
      select jsonb_agg(jsonb_build_object(
        'level', level,
        'roster', roster,
        'active_in_window', active_in_window,
        'practice_answers', practice_answers,
        'first_try_pct', first_try_pct,
        'active_7d', active_7d
      ) order by
        case level
          when 'R1' then 1 when 'R2' then 2 when 'R3' then 3 when 'R4' then 4
          when 'F1' then 5 when 'F2' then 6 when 'faculty' then 7 when 'alumni' then 8
          else 9 end
      )
      from (
        select
          coalesce(nullif(m.training_level, ''),
            case when m.role::text = 'faculty' then 'faculty'
                 when m.role::text = 'alumni' then 'alumni'
                 else 'unspecified' end) as level,
          count(*)::int as roster,
          count(distinct pr.user_id)::int as active_in_window,
          coalesce(sum(pr.n), 0)::int as practice_answers,
          case when coalesce(sum(pr.n), 0) > 0
            then round(100.0 * sum(pr.first_ok) / sum(pr.n))
            else null end as first_try_pct,
          count(distinct case when pr.last_at >= now() - interval '7 days' then pr.user_id end)::int as active_7d
        from members m
        left join (
          select user_id, count(*)::int as n,
                 count(*) filter (where first_correct)::int as first_ok,
                 max(updated_at) as last_at
          from practice group by user_id
        ) pr on pr.user_id = m.id
        group by 1
      ) x
    ), '[]'::jsonb),
    'top_users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', name,
        'level', level,
        'answers', answers,
        'first_try_pct', case when answers > 0 then round(100.0 * first_ok / answers) else null end,
        'last_active', last_active
      ) order by answers desc)
      from top_users
    ), '[]'::jsonb),
    'quiet_users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', name,
        'level', level,
        'role', role,
        'practice_answers', practice_answers,
        'poll_answers', poll_answers,
        'last_active', last_active
      ))
      from quiet
    ), '[]'::jsonb),
    'signups', coalesce((select jsonb_agg(to_jsonb(s) order by s.day) from signups s), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function admin_usage_dashboard(int) from public;
grant execute on function admin_usage_dashboard(int) to authenticated;
