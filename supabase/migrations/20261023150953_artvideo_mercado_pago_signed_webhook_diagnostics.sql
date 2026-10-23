begin;
create table if not exists public.artvideo_store_webhook_checks (
 id bigint generated always as identity primary key,
 environment text not null check (environment in ('sandbox','production')),
 provider_key text not null default 'mercado_pago' check (provider_key='mercado_pago'),
 event_type text not null default 'payment' check (event_type='payment'),
 resource_id text not null check (resource_id ~ '^[0-9]{5,25}$'),
 simulated boolean not null default false,
 received_at timestamptz not null default now()
);
create index if not exists artvideo_store_webhook_checks_recent_idx
 on public.artvideo_store_webhook_checks(environment,received_at desc);
alter table public.artvideo_store_webhook_checks enable row level security;
revoke all on table public.artvideo_store_webhook_checks from public,anon,authenticated;
grant select,insert on table public.artvideo_store_webhook_checks to service_role;
revoke all on sequence public.artvideo_store_webhook_checks_id_seq from public,anon,authenticated;
grant usage,select on sequence public.artvideo_store_webhook_checks_id_seq to service_role;
commit;