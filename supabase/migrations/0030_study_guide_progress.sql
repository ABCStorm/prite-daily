-- ----------------------------------------------------------------------------
-- study_guides progress tracking: the edge function now writes a placeholder
-- row the moment generation starts (status='generating', stage='writing'),
-- updates stage='narrating' once the text is done and audio synthesis
-- begins, then fills in the real content with status='ready' at the end (or
-- status='error' + error_message on failure). This lets the client poll the
-- row directly for real progress — and notice a guide finished — without
-- needing the original tab that kicked it off to stay open.
-- ----------------------------------------------------------------------------
alter table study_guides
  add column if not exists status text not null default 'ready',
  add column if not exists stage text,
  add column if not exists error_message text;

alter table study_guides drop constraint if exists study_guides_status_check;
alter table study_guides add constraint study_guides_status_check
  check (status in ('generating', 'ready', 'error'));
