-- ----------------------------------------------------------------------------
-- study_guides audio: switch the "listen instead" overview from browser TTS
-- to a real generated audio file (ElevenLabs), stored in a private bucket and
-- streamed back to whoever the speaker sent the ?study=<id> link to.
-- ----------------------------------------------------------------------------
alter table study_guides add column if not exists audio_path text;

insert into storage.buckets (id, name, public)
values ('study-audio', 'study-audio', false)
on conflict (id) do nothing;

-- readable by any approved member, same as the "bank" bucket's read policy;
-- writes go through the generate-study-guide edge function (service role),
-- which bypasses RLS, so no insert/update/delete policy is needed here.
drop policy if exists "approved read study-audio" on storage.objects;
create policy "approved read study-audio" on storage.objects for select
  using (bucket_id = 'study-audio' and is_approved());
