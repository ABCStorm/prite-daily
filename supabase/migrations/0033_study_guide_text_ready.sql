-- ----------------------------------------------------------------------------
-- study_guides: progressive availability + session labelling.
--
--   text_ready   — the written guide (title/intro/sections) is populated and
--                  viewable, even while the audio is still rendering (or if
--                  audio ends up failing). The edge function now writes the
--                  text the moment Claude finishes, before TTS, and flips this.
--                  Lets the page show the material immediately and lets the
--                  library list a guide as soon as its text exists.
--   session_date — the date of the upcoming review session this guide is prep
--                  for, chosen by the creator (a plain calendar date).
-- ----------------------------------------------------------------------------
alter table study_guides
  add column if not exists text_ready boolean not null default false,
  add column if not exists session_date date;

-- existing finished guides predate text_ready; they clearly have their text,
-- so mark them so they keep showing in the library (which now gates on this).
update study_guides set text_ready = true where status = 'ready';
