begin;
create table if not exists public.artvideo_store_brick_payment_attempts (
  order_id uuid primary key references public.artvideo_store_orders(id) on delete restrict,
  idempotency_key text not null unique,
  payment_id text unique,
  payment_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artvideo_brick_payment_attempts_idem
    check (idempotency_key ~ '^bricks-[0-9a-f-]{36}$')
);
alter table public.artvideo_store_brick_payment_attempts enable row level security;
revoke all on public.artvideo_store_brick_payment_attempts from public,anon,authenticated;
grant select,insert,update on public.artvideo_store_brick_payment_attempts to service_role;
create index if not exists artvideo_store_brick_payments_created_idx
  on public.artvideo_store_brick_payment_attempts(created_at desc);
commit;
