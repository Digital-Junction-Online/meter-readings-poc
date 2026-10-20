-- Fixes the column grant from 006, which was too tight to use.
-- Run this in the SQL editor after 006.
--
-- 006 revoked UPDATE and granted back only (status, requested_at,
-- requested_by). Two things broke:
--
--   1. Requesting an add-on. PostgREST compiles upsert into
--      INSERT ... ON CONFLICT DO UPDATE SET <every column>, and Postgres
--      checks UPDATE rights on all of them when planning — so price_cents
--      denied the statement even on a first request with no conflict. The
--      app no longer upserts, but the grant still needs widening for (2).
--
--   2. Switching an add-on on. Admins authenticate as the `authenticated`
--      role too — is_admin() is a row-level test, not a role — so the same
--      grant blocked Wayne from writing activated_at/activated_by. No
--      feature could ever be activated.
--
-- price_cents, client_id and feature_key stay un-grantable: those are what
-- actually must not move. A client still cannot self-activate, because the
-- WITH CHECK on their update policy pins the status they may write to
-- 'requested' regardless of which columns they can reach.

revoke update on client_features from authenticated;
grant update (status, requested_at, requested_by, activated_at, activated_by, note)
  on client_features to authenticated;
