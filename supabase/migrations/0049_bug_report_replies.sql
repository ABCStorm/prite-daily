-- ============================================================================
-- Admin replies to bug reports. A single free-text response per report,
-- written by an admin from the triage panel and visible to the reporter (the
-- existing bug_read policy already lets reporters select their own rows, and
-- bug_update already restricts writes to admins — no policy changes needed).
-- ============================================================================
alter table bug_reports add column if not exists admin_response text;
alter table bug_reports add column if not exists responded_at timestamptz;
