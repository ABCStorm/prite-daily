-- Opt-in daily practice reminder. Per-user flag on settings; the send-daily-
-- reminders edge function reads it (joined to profiles for the email) and emails
-- everyone who's opted in and hasn't finished today's set yet.
alter table settings add column if not exists daily_reminder boolean not null default false;

-- Lets the edge function (service role) read who to email. No client policy needed
-- beyond the existing settings RLS; the function uses the service role key.
