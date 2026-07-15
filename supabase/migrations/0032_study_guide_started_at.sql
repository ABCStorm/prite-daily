-- ----------------------------------------------------------------------------
-- study_guides.generation_started_at — the wall-clock time THIS generation run
-- began (set fresh on every kickoff, including regenerations). The progress
-- bar / ETA anchor to this instead of a browser-memory timer, so they survive
-- a page refresh and read the same on any device. (created_at can't serve this
-- role: it stays at the row's first-ever creation and doesn't move when a guide
-- is regenerated.)
-- ----------------------------------------------------------------------------
alter table study_guides add column if not exists generation_started_at timestamptz;
