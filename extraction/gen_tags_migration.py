#!/usr/bin/env python3
"""
Generate supabase/migrations/0004_tags.sql from the classified questions:
  - a `question_tags(question_id, dimension, tag, label)` table,
  - all tag rows (PRITE category + stem/answer entity tags), and
  - `tag_miss_stats(dimension)` — an admin-only RPC ranking tags by class
    miss-rate (difficulty), joining answers -> question_tags.

Entity tags for analytics come from the STEM + ANSWER (what the question is
*about*), not the answer options, so "most-missed lithium questions" means
questions really about lithium — not ones that merely list it as a distractor.

Usage:
  python gen_tags_migration.py output/questions_all.json ../supabase/migrations/0004_tags.sql
"""
import sys
import json
import classify as C

DIMS = [
    ("diagnosis", C.DIAGNOSES), ("medication", C.MEDICATIONS),
    ("psychotherapy", C.PSYCHOTHERAPY), ("neuro", C.NEURO), ("historical", C.HISTORICAL),
]


def label_of(dim, tag):
    if dim == "prite":
        return C.PRITE_LABEL.get(tag, tag)
    if dim == "historical":
        return tag  # already a proper name
    return tag.replace("-", " ").replace("_", " ").strip().capitalize()


def sql_str(s):
    return "'" + s.replace("'", "''") + "'"


def main():
    src, out = sys.argv[1], sys.argv[2]
    qs = json.load(open(src))
    rows = []  # (question_id, dimension, tag, label)
    for q in qs:
        qid = f"{q['year']}-{q['q_index']}"
        rows.append((qid, "prite", q["prite_category"], label_of("prite", q["prite_category"])))
        stem = (q.get("stem", "") + " " + q.get("answer_text", ""))
        for dim, table in DIMS:
            for tag in C.extract(stem, table):
                rows.append((qid, dim, tag, label_of(dim, tag)))
        setting = C.extract(stem, C.SETTING, multi=False)
        if setting:
            rows.append((qid, "setting", setting, setting.capitalize()))

    # de-dupe (a tag could be hit twice)
    rows = sorted(set(rows))

    parts = []
    parts.append("""-- ============================================================================
-- Question topic tags + admin miss-rate analytics.
-- question_tags: one row per (question, dimension, tag). Difficulty is NOT
-- stored -- it's the live class miss-rate computed by tag_miss_stats().
-- ============================================================================
drop table if exists question_tags cascade;
create table question_tags (
  question_id text not null,
  dimension   text not null,   -- prite | diagnosis | medication | psychotherapy | neuro | historical | setting
  tag         text not null,
  label       text not null,
  primary key (question_id, dimension, tag)
);
create index question_tags_dim_idx on question_tags (dimension, tag);

alter table question_tags enable row level security;
drop policy if exists qtags_read on question_tags;
create policy qtags_read on question_tags for select using (is_approved() or is_admin());
drop policy if exists qtags_admin on question_tags;
create policy qtags_admin on question_tags for all using (is_admin()) with check (is_admin());
""")

    # batched inserts
    B = 500
    for i in range(0, len(rows), B):
        chunk = rows[i:i + B]
        values = ",\n".join(
            f"({sql_str(qid)},{sql_str(dim)},{sql_str(tag)},{sql_str(lab)})"
            for qid, dim, tag, lab in chunk
        )
        parts.append(f"insert into question_tags (question_id, dimension, tag, label) values\n{values}\non conflict do nothing;")

    parts.append("""
-- admin-only: rank a dimension's tags by class miss-rate (hardest first)
create or replace function tag_miss_stats(dim text)
returns table (tag text, label text, attempts bigint, missed bigint, miss_pct int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then return; end if;
  return query
    select t.tag, max(t.label),
           count(a.*),
           count(a.*) filter (where not a.first_correct),
           coalesce(round(100.0 * count(a.*) filter (where not a.first_correct) / nullif(count(a.*), 0)), 0)::int
    from question_tags t
    join answers a on a.question_id = t.question_id
    where t.dimension = dim
    group by t.tag
    having count(a.*) >= 1
    order by 5 desc, 3 desc;
end $$;

grant execute on function tag_miss_stats(text) to authenticated;
""")

    open(out, "w").write("\n".join(parts) + "\n")
    print(f"Wrote {out}: {len(rows)} tag rows across {len(qs)} questions.")
    import collections
    dimc = collections.Counter(r[1] for r in rows)
    for d, n in dimc.most_common():
        print(f"  {n:>5}  {d}")


if __name__ == "__main__":
    main()
