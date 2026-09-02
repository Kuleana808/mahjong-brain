-- Append-only StoreKit consumable grant ledger. A transaction may grant once.
create table public.consumable_grants (
  transaction_id text primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  product_id text not null check (product_id = 'com.nihi.mahjong.shuffle5'),
  kind text not null check (kind = 'shuffle'),
  quantity integer not null check (quantity > 0),
  purchased_at timestamptz not null,
  environment text not null,
  granted_at timestamptz not null default now()
);

create index consumable_grants_account_id_idx on public.consumable_grants(account_id);
alter table public.consumable_grants enable row level security;
revoke all on public.consumable_grants from anon, authenticated;
grant all on public.consumable_grants to service_role;

comment on table public.consumable_grants is
  'Append-only verified StoreKit consumable grants, idempotent per individual transaction.';
