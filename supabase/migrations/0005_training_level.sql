-- Self-reported training level (collected at first sign-in) + cohort-filterable,
-- everyone-visible insights.

alter table profiles add column if not exists training_level text;
-- values: R1 R2 R3 R4 (residents) · F1 F2 (child fellows) · faculty · alumni

-- Replace tag_miss_stats: any APPROVED member may view (not just admins), and
-- an optional cohort filters answers to users at that training level.
drop function if exists tag_miss_stats(text);
drop function if exists tag_miss_stats(text, text);
create function tag_miss_stats(dim text, cohort text default null)
returns table (tag text, label text, attempts bigint, missed bigint, miss_pct int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_approved() then return; end if;
  return query
    select t.tag, max(t.label),
           count(a.*),
           count(a.*) filter (where not a.first_correct),
           coalesce(round(100.0 * count(a.*) filter (where not a.first_correct) / nullif(count(a.*), 0)), 0)::int
    from question_tags t
    join answers a   on a.question_id = t.question_id
    join profiles p  on p.id = a.user_id
    where t.dimension = dim
      and (cohort is null or p.training_level = cohort)
    group by t.tag
    having count(a.*) >= 1
    order by 5 desc, 3 desc;
end $$;

grant execute on function tag_miss_stats(text, text) to authenticated;
