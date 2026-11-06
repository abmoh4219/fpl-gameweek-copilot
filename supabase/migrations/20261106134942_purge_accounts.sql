-- ADR-0017: Armband has no accounts. This deletes every piece of account data
-- collected before the change, so the privacy page can say we store nothing
-- about visitors.
--
-- Rows only: the tables, functions and policies stay, empty and unused, so
-- nothing that still references them (the switched-off agent route, the
-- tests) breaks. Dropping them is a later, separate migration.
--
-- Irreversible by design.

-- Per-account rows in the app schema. agent_usage and profiles would also go
-- with auth.users through ON DELETE CASCADE; deleting them first is explicit.
delete from app.agent_usage;
delete from app.profiles;

-- Email fingerprints with question counts (ADR-0013). Kept "after deletion"
-- only to protect the AI allowance, which no longer exists.
delete from app.question_ledger;

-- Emails from the earliest waitlist (unused since accounts arrived).
delete from app.waitlist;

-- The logins themselves: emails, names, password hashes. Identities,
-- sessions and refresh tokens cascade from auth.users.
delete from auth.users;
