-- ============================================================================
-- Follow-up to 0002: columns the shared schema missed, discovered while porting
-- Wrightleave (LeaveFlow) off its single-document JSON store. Nothing here
-- changes the 0002 contract — it only adds spillover JSONB for legacy nested
-- fields plus a few real columns the app queries on.
-- ============================================================================

-- people: Wrightleave lets a person register a personal notification address
-- (altEmail) + per-address opt-ins, and roster rows carry app-specific extras
-- (services taught, R3/R4 weeklyPattern templates, military flag, the bound
-- Google subject, approvedBy audit fields...). alt_email is queried (login
-- matching + duty-hours lookups); the rest rides in leave_meta.
alter table people add column alt_email text;
alter table people add column leave_meta jsonb not null default '{}'::jsonb;

-- leave_requests: legacy requests carry denormalized requester snapshots
-- (requesterName/Pgy/Email/Phone), coordinator-private notes, docsComplete,
-- assignedBy, verbal-confirm bookkeeping, etc. None are filtered on in SQL —
-- workflow.js owns them — so they spill into `extra`.
alter table leave_requests add column extra jsonb not null default '{}'::jsonb;

-- leave_trades: the trade workflow has grown past the 0002 columns (kind:
-- offer|request, requester fields, swap-return second leg, notified list,
-- schedule-manager pointer, revert audit trail). Spillover jsonb again.
alter table leave_trades add column extra jsonb not null default '{}'::jsonb;

-- leave_pending_logins: the app tracks the OAuth subject of the unrecognized
-- sign-in so approval can bind the account. With Supabase Auth this is the
-- auth.users id when available, but the legacy import + name-match flow also
-- stores raw Google subs, so keep it as text alongside auth_user_id.
alter table leave_pending_logins add column google_id text;
