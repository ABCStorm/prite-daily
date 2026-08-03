-- Keep narration speed with the resumable queue so switching devices does not
-- silently return an in-progress review to 1x.
alter table audio_review_progress
  add column if not exists playback_rate numeric(3,2) not null default 1.00
  check (playback_rate between 0.50 and 2.00);
