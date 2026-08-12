-- Grant the API's role access to its own tables.
--
-- APPEND-ONLY. 0001 and 0002 have run; this fixes them forward.
--
-- THE BUG THIS FIXES: 0001 and 0002 enabled RLS and revoked everything from
-- `anon` and `authenticated`, which was right — but never granted anything to
-- `service_role`, which is the role the API actually uses. Tables created by a
-- migration do not pick up Supabase's default grants, so every write came back
--
--   42501  permission denied for table events
--
-- Caught by running the instrumentation smoke test against real Postgres rather
-- than the in-process dev store. It would have failed identically on a hosted
-- project — the dev store could never have surfaced it.
--
-- `service_role` bypasses RLS, so the deny-by-default posture for anon and
-- authenticated is unchanged: the API is still the only thing that can reach
-- these tables, and it still enforces ownership by only ever querying an
-- accountId that came out of a verified session token.

grant select, insert, update, delete on
  public.accounts,
  public.settings,
  public.unlocks,
  public.session_analytics,
  public.events,
  public.daily_rewards
to service_role;

-- bigserial primary keys need their sequences too.
grant usage, select on all sequences in schema public to service_role;

-- Read-only for the cohort views.
grant select on public.device_cohorts, public.retention_summary to service_role;

-- Anything added later gets the same treatment without a fourth migration.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;
