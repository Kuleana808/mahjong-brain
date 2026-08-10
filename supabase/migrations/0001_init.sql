-- Nihi Mahjong — initial schema.
--
-- APPEND-ONLY MIGRATIONS. Never edit a file that has run anywhere; add a new
-- one. This file is 0001 and should stay exactly as it is once applied.
--
-- Four tables, and deliberately no more. There is no player profile, no
-- leaderboard, no event stream, and no table that could grow into one. The App
-- Store privacy label says "no data collected" and the schema is what makes
-- that true rather than aspirational.

-- ---------------------------------------------------------------- accounts --
-- One row per Apple ID that has signed in. Exists only so settings and the
-- unlock can follow a player to a second device.
--
-- `apple_subject` is Apple's opaque `sub`. It is not an email, not a name, and
-- not reversible to a person by us. We never store the email Apple offers,
-- because we never send email.

create table if not exists public.accounts (
  id             uuid primary key default gen_random_uuid(),
  apple_subject  text not null unique,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------- settings --
-- Font size, contrast, and the rest. `revision` is the conflict resolver:
-- clients send the revision they last saw, and a stale write is refused rather
-- than silently winning. See contract 4.

create table if not exists public.settings (
  account_id  uuid primary key references public.accounts(id) on delete cascade,
  settings    jsonb not null default '{}'::jsonb,
  revision    integer not null default 0,
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------- unlocks --
-- One verified purchase per account. Written only after a StoreKit signature
-- has been verified server-side, or by an App Store server notification.
--
-- `original_transaction_id` is unique across the table: the same purchase must
-- not be able to unlock two different accounts. That is the receipt-sharing
-- defence, and it belongs in the database rather than in application code.
--
-- `revoked` is not a deletion. A refunded purchase stays on the row so the
-- history is legible and so a later re-purchase is distinguishable from a first
-- one.

create table if not exists public.unlocks (
  account_id               uuid primary key references public.accounts(id) on delete cascade,
  product_id               text not null,
  original_transaction_id  text not null unique,
  purchased_at             timestamptz not null,
  environment              text not null,
  revoked                  boolean not null default false,
  source                   text not null check (source in ('verified_transaction', 'app_store_notification')),
  verified_at              timestamptz not null default now()
);

-- -------------------------------------------------------- session_analytics --
-- Opt-in only; the API discards anything without explicit consent before it
-- reaches this table, and writes an allow-list of fields rather than whatever
-- the client sent.
--
-- There is no account_id column, on purpose. Analytics must not be joinable to
-- an identity — adding that column later would turn an anonymous count into a
-- behavioural profile, so the column does not exist to be added by accident.

create table if not exists public.session_analytics (
  id                    bigserial primary key,
  anonymous_session_id  text not null,
  boards_started        integer not null default 0,
  boards_completed      integer not null default 0,
  hints_used            integer not null default 0,
  total_seconds         integer not null default 0,
  app_version           text not null,
  recorded_at           timestamptz not null default now()
);

create index if not exists session_analytics_recorded_at_idx
  on public.session_analytics (recorded_at desc);

-- --------------------------------------------------------------------- RLS --
-- The API talks to Postgres with the service-role key and enforces ownership
-- itself, by only ever querying an account_id that came out of a verified
-- session token. RLS is enabled anyway, with no permissive policies, so that
-- anything reaching these tables with an anon key gets nothing at all.
--
-- Deny-by-default is the point. Do not add a policy here without a specific
-- reason and a note saying what it is for.

alter table public.accounts           enable row level security;
alter table public.settings           enable row level security;
alter table public.unlocks            enable row level security;
alter table public.session_analytics  enable row level security;

revoke all on public.accounts          from anon, authenticated;
revoke all on public.settings          from anon, authenticated;
revoke all on public.unlocks           from anon, authenticated;
revoke all on public.session_analytics from anon, authenticated;
