-- One resumable active-recall session per user and topic. The exact question
-- order is stored so a shuffled review resumes deterministically on any device.
create table if not exists audio_review_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope_key text not null,
  topic text not null,
  question_ids text[] not null,
  current_index integer not null default 0 check (current_index >= 0),
  recall_seconds smallint not null default 4 check (recall_seconds between 1 and 30),
  transition_seconds smallint not null default 1 check (transition_seconds between 0 and 30),
  order_mode text not null default 'shuffle' check (order_mode in ('shuffle', 'bank')),
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, scope_key)
);

alter table audio_review_progress enable row level security;

drop policy if exists audio_review_progress_select on audio_review_progress;
create policy audio_review_progress_select on audio_review_progress for select
  using (auth.uid() = user_id and is_approved());

drop policy if exists audio_review_progress_insert on audio_review_progress;
create policy audio_review_progress_insert on audio_review_progress for insert
  with check (auth.uid() = user_id and is_approved());

drop policy if exists audio_review_progress_update on audio_review_progress;
create policy audio_review_progress_update on audio_review_progress for update
  using (auth.uid() = user_id and is_approved())
  with check (auth.uid() = user_id and is_approved());

drop policy if exists audio_review_progress_delete on audio_review_progress;
create policy audio_review_progress_delete on audio_review_progress for delete
  using (auth.uid() = user_id and is_approved());

create index if not exists audio_review_progress_updated_idx
  on audio_review_progress (user_id, updated_at desc);
