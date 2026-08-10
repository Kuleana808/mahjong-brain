-- Parity doctrine additions (D-014): instrumentation and the daily reward loop.
--
-- APPEND-ONLY. 0001 has run; do not edit it.

-- ------------------------------------------------------------------ events --
-- Product analytics. Mandatory before launch — nothing ships without a metric.
--
-- NO account_id COLUMN, ON PURPOSE. Adding one later would silently turn an
-- anonymous count into a behavioural profile joined to an Apple ID. The column
-- does not exist so it cannot be added by accident, and any PR that adds it is
-- making a privacy decision that needs to be argued explicitly.
--
-- `anonymous_device_id` is rotating, device-local and resettable by the player.
-- It is not an IDFA, not Apple's `sub`, and does not survive a reinstall.
--
-- `properties` is jsonb but not free-form: the API writes an allow-listed set of
-- keys and drops everything else before the insert.

create table if not exists public.events (
  id                   bigserial primary key,
  schema_version       integer not null,
  anonymous_device_id  text not null,
  session_id           text not null,
  app_version          text not null,
  platform             text not null check (platform in ('ios', 'android', 'web')),
  name                 text not null,
  client_at            timestamptz not null,
  server_at            timestamptz not null default now(),
  sequence             integer not null,
  properties           jsonb not null default '{}'::jsonb
);

-- Cohort queries all filter by name and time, in that order.
create index if not exists events_name_server_at_idx on public.events (name, server_at desc);
create index if not exists events_device_idx on public.events (anonymous_device_id, server_at desc);
create index if not exists events_session_idx on public.events (session_id, sequence);

-- ----------------------------------------------------------- daily_rewards --
-- One row per account. `last_claimed_on` is a DATE, not a timestamp, because a
-- daily reward is a local-midnight concept — see handlers/retention.ts.

create table if not exists public.daily_rewards (
  account_id       uuid primary key references public.accounts(id) on delete cascade,
  last_claimed_on  date,
  streak_days      integer not null default 0,
  updated_at       timestamptz not null default now()
);

-- --------------------------------------------------------------- retention --
-- D1/D7/D30 return rates, per install cohort.
--
-- A view rather than a job: the numbers are always current, there is nothing to
-- schedule, and nothing can silently stop running. Re-derived on read, which is
-- fine at the scale this launches at (50-100 users) and can become a materialised
-- view later without the query changing.

create or replace view public.device_cohorts as
select
  anonymous_device_id,
  min(server_at)::date as cohort_date,
  max(server_at)::date as last_seen_date,
  count(*) filter (where name = 'session_start') as sessions,
  count(*) filter (where name = 'board_won') as boards_won,
  count(*) filter (where name = 'holder_full') as holder_fulls,
  count(*) filter (where name = 'revive_ad_completed') as revives_watched,
  count(*) filter (where name = 'iap_purchase_completed') as purchases
from public.events
group by anonymous_device_id;

create or replace view public.retention_summary as
with activity as (
  select
    e.anonymous_device_id,
    c.cohort_date,
    (e.server_at::date - c.cohort_date) as day_offset
  from public.events e
  join public.device_cohorts c using (anonymous_device_id)
)
select
  cohort_date,
  count(distinct anonymous_device_id) as installs,
  count(distinct anonymous_device_id) filter (where day_offset = 1)  as d1,
  count(distinct anonymous_device_id) filter (where day_offset = 7)  as d7,
  count(distinct anonymous_device_id) filter (where day_offset = 30) as d30
from activity
group by cohort_date
order by cohort_date desc;

-- --------------------------------------------------------------------- RLS --
-- Same posture as 0001: on, with no permissive policies. The API holds the
-- service-role key; nothing else gets to read these.

alter table public.events        enable row level security;
alter table public.daily_rewards enable row level security;

revoke all on public.events            from anon, authenticated;
revoke all on public.daily_rewards     from anon, authenticated;
revoke all on public.device_cohorts    from anon, authenticated;
revoke all on public.retention_summary from anon, authenticated;
