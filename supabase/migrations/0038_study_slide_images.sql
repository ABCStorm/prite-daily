-- ----------------------------------------------------------------------------
-- study-slides bucket: AI-generated illustration images for the teaching
-- slide decks (study_guides.slides[].image_path points here). Written by the
-- generate-study-guide edge function (service role); read by any approved
-- member when the client builds the downloadable .pptx.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('study-slides', 'study-slides', false)
on conflict (id) do nothing;

drop policy if exists "approved read study-slides" on storage.objects;
create policy "approved read study-slides" on storage.objects for select
  using (bucket_id = 'study-slides' and is_approved());
