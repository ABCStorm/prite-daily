-- daily_reminder becomes tri-state: null = auto-managed (on during the 90 days
-- before the user's exam date — or a guessed Oct 15 if unset — off otherwise),
-- true/false = the user explicitly overrode it via the toggle or unsubscribe
-- link. New signups default to null (auto). Existing rows still holding the
-- old "false" default (i.e. nobody has ever actually opted in) are reset to
-- null too, since that value never represented a deliberate choice — the
-- opt-in toggle only became reachable/functional very recently.
alter table settings alter column daily_reminder drop not null;
alter table settings alter column daily_reminder set default null;
update settings set daily_reminder = null where daily_reminder = false;

-- How often (in days) to send the reminder once it's active. 1 = daily.
alter table settings add column if not exists reminder_every_days int not null default 1 check (reminder_every_days >= 1);
