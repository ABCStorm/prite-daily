-- ============================================================================
-- A 'test' role for throwaway/dev accounts (duplicate sign-ins, demo Googles).
-- Test accounts keep working normally for whoever owns them, but the client
-- filters them out of the season-team roster editor, and they should never be
-- placed on teams or counted in review-poll bookkeeping. Flag accounts from
-- the admin Approvals panel (role dropdown) or by hand.
-- NOTE: ALTER TYPE ... ADD VALUE must not share a transaction with statements
-- that use the new value — keep this migration to just the two steps below.
-- ============================================================================
alter type user_role add value if not exists 'test';

-- The known test accounts as of 2026-07-15 (Andrew's duplicate wright.edu
-- sign-in and two demo accounts). Harmless no-ops on databases without them.
update profiles set role = 'test'
where email = 'andrew.correll@wright.edu'
   or full_name in ('Kay C', 'Matthew Correll');
