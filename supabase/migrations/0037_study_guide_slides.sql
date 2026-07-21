-- Teaching-slide outlines for study guides: the generate-study-guide edge
-- function now also writes a pre-reading slide deck (array of
-- {title, bullets[], notes}) that the client renders to a downloadable .pptx
-- as an alternative to the audio overview. Guides generated before this
-- migration simply have an empty array (no slides button) until regenerated.
alter table public.study_guides
  add column if not exists slides jsonb not null default '[]'::jsonb;
