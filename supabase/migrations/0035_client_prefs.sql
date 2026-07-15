-- ============================================================================
-- Cross-device sync for what used to be per-browser localStorage: streak day
-- lists, exam-mode/timer prefs, one-time-nag stages, seen-guide badges, the
-- web-flashcards note dismissal, and the last self-picked poll team. One jsonb
-- blob on the existing per-user settings row (created for every account by the
-- signup trigger; RLS already scopes it to the owner). The client merges its
-- local copy with this on sign-in (unions for day/seen lists, max for nag
-- stages) and pushes debounced snapshots on change — see src/lib/prefsSync.ts.
-- ============================================================================
alter table settings add column if not exists client_prefs jsonb not null default '{}'::jsonb;
