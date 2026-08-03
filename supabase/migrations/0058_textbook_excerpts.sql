-- ============================================================================
-- SUPERSEDED 2026-07-28 — DO NOT APPLY.
--
-- Hosting moved to a PRIVATE Cloudflare R2 bucket fronted by the
-- `workers/textbook-images` Worker. Reasons: the shipped screenshot set is
-- 614 MB and would not fit Supabase Storage's 1 GB free tier, and R2 has no
-- egress fees. Access control is equivalent — the Worker validates the same
-- Supabase session before serving any page.
--
-- Kept only as a record of the rejected alternative. See the
-- "Hosting the screenshots" section of
-- .claude/skills/kaplan-sadock-citations/SKILL.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- textbook-excerpts bucket: page screenshots from Kaplan & Sadock's
-- Comprehensive Textbook of Psychiatry (10th ed.) that support a question's
-- answer (questions_all.json[].kaplan_sadock_refs[].image_path points here).
-- Written by the one-off citation-tagging pipeline (service role); read by
-- any approved member when the client shows a question's citation panel.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('textbook-excerpts', 'textbook-excerpts', false)
on conflict (id) do nothing;

drop policy if exists "approved read textbook-excerpts" on storage.objects;
create policy "approved read textbook-excerpts" on storage.objects for select
  using (bucket_id = 'textbook-excerpts' and is_approved());
