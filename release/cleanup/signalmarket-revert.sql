-- ═══════════════════════════════════════════════════════════════════════════
-- Revert Mahjong Brain migrations from the WRONG Supabase project.
--
--   Target project : qynsncdqxdqiloxnrizj   ("signalmarket" / Operator Markets)
--   NOT             : dxtzbidjtkeekthompqb  ("Mahjong Brain" — the real one)
--
-- DO NOT RUN THIS AGAINST dxtzbidjtkeekthompqb. It would delete the live game
-- backend. Check the project ref in the Supabase dashboard URL before running.
--
-- ── Why this is safe ──────────────────────────────────────────────────────
-- Verified read-only against the live project on 2026-09-02:
--
--   * All 7 Mahjong tables are present and every one has ROWS = 0. Nothing is
--     deleted by this script; there is no data to lose.
--   * There is ZERO name overlap with signalmarket's own 17 tables
--     (strategies, strategy_changelog, vendors, brokers, gates, benchmarks,
--     methodology_versions, validated_agent_coordination, approved_candidates,
--     vendor_claims, vendor_strategies, experience_reports,
--     validated_trader_signals, validation_events, validation_jobs,
--     newsletter_subscribers, validation_job_events).
--     No object dropped below belongs to signalmarket.
--
-- Every statement is IF EXISTS, so a partial prior cleanup is not an error.
-- RESTRICT rather than CASCADE is deliberate: if some signalmarket object has
-- come to depend on one of these since, this fails loudly instead of silently
-- dropping that object too.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- Fail immediately if pointed at the wrong database.
--
-- `public.strategies` is a signalmarket table and does NOT exist on the real
-- Mahjong Brain project, so its presence is the cheapest reliable proof that
-- this is the intended target. Inside a transaction, this exception rolls the
-- whole script back before a single drop lands.
do $$
begin
  if not exists (
    select 1
      from information_schema.tables
     where table_schema = 'public'
       and table_name = 'strategies'
  ) then
    raise exception
      'Refusing to run: public.strategies not found. This is not the signalmarket project.';
  end if;
end $$;

-- ── 1. Views first (they read the tables below) ───────────────────────────
drop view if exists public.retention_summary restrict;
drop view if exists public.device_cohorts restrict;

-- ── 2. Tables. consumable_grants references accounts, so it goes first. ────
drop table if exists public.consumable_grants restrict;
drop table if exists public.daily_rewards restrict;
drop table if exists public.events restrict;
drop table if exists public.session_analytics restrict;
drop table if exists public.unlocks restrict;
drop table if exists public.settings restrict;
drop table if exists public.accounts restrict;

-- Indexes (consumable_grants_account_id_idx, events_device_idx,
-- events_name_server_at_idx, events_session_idx,
-- session_analytics_recorded_at_idx) are dropped with their tables.

-- ── 3. Migration bookkeeping ──────────────────────────────────────────────
-- Without this, Supabase still believes 0001-0004 are applied here and will
-- skip them, so a future legitimate migration numbered 0001-0004 would be
-- silently ignored on this project.
delete from supabase_migrations.schema_migrations
where version in ('0001', '0002', '0003', '0004');

commit;

-- ── 4. Verify (run separately, expect zero rows) ───────────────────────────
-- select table_name from information_schema.tables
--  where table_schema = 'public'
--    and table_name in ('accounts','settings','unlocks','session_analytics',
--                       'events','daily_rewards','consumable_grants',
--                       'device_cohorts','retention_summary');
