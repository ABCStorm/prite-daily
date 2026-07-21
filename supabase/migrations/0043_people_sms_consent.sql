-- Per-resident SMS consent for WrightRecord's A2P campaign registration.
-- Consent is opt-in (default false) and can only be granted by the resident
-- themself (the /api/me/sms route); STOP replies revoke it via the webhook.
alter table people
  add column sms_consent boolean not null default false,
  add column sms_consent_at timestamptz,
  add column sms_opt_out_at timestamptz;

comment on column people.sms_consent is
  'Resident opted in to SMS. Must never be defaulted true or set by admins.';
comment on column people.sms_consent_at is 'When the resident last granted consent.';
comment on column people.sms_opt_out_at is 'When the resident last revoked consent (settings toggle or STOP reply).';
