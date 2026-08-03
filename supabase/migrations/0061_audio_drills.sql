-- Active-recall audio: one concise, reviewed-or-AI-generated teaching point
-- and its rendered MP3 per source question.  The question bank is private,
-- so the recordings must remain private too.
create table if not exists audio_drills (
  question_id text primary key,
  script text not null default '',
  -- Separate files let the player hold a genuine recall pause between the
  -- question and answer, rather than hoping a TTS provider interprets a token.
  prompt_audio_path text,
  answer_audio_path text,
  status text not null default 'pending' check (status in ('pending', 'generating', 'ready', 'error')),
  error_message text,
  generated_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table audio_drills enable row level security;

drop policy if exists audio_drills_read on audio_drills;
create policy audio_drills_read on audio_drills for select using (is_approved());

insert into storage.buckets (id, name, public)
values ('audio-drills', 'audio-drills', false)
on conflict (id) do nothing;

drop policy if exists "approved read audio-drills" on storage.objects;
create policy "approved read audio-drills" on storage.objects for select
  using (bucket_id = 'audio-drills' and is_approved());
