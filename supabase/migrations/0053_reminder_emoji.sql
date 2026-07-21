-- Per-reminder emoji label (WrightRecord Clinical Reminders): auto-assigned
-- from the title at creation, customizable by the resident afterwards.
alter table rec_reminders add column if not exists emoji text;
