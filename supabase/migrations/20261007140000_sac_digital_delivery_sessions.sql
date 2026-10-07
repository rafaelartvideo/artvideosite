-- Additive, server-owned delivery ledger and cross-instance operator mutex.
create table if not exists public.sac_digital_delivery_attempts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 user_id uuid references auth.users(id), intent_key text not null, endpoint_path text not null,
 protocol text, mode text not null check(mode in ('client','operator')),
 state text not null default 'prepared' check(state in ('prepared','accepted','queued','rejected','unknown','sent','delivered','read')),
 message_id text, notification_id text, request_id text, error_type text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,intent_key)
);
create table if not exists public.sac_digital_operator_leases (
 organization_id uuid not null references public.organizations(id), operator_id text not null,
 owner_id uuid not null, expires_at timestamptz not null, primary key(organization_id,operator_id)
);
create table if not exists public.sac_digital_sync_cursors (
 organization_id uuid not null references public.organizations(id), resource text not null,
 next_page integer not null default 1, complete boolean not null default false,
 updated_at timestamptz not null default now(), primary key(organization_id,resource)
);
alter table public.sac_digital_delivery_attempts enable row level security;
alter table public.sac_digital_operator_leases enable row level security;
alter table public.sac_digital_sync_cursors enable row level security;
revoke all on public.sac_digital_delivery_attempts,public.sac_digital_operator_leases,public.sac_digital_sync_cursors from anon,authenticated;
grant all on public.sac_digital_delivery_attempts,public.sac_digital_operator_leases,public.sac_digital_sync_cursors to service_role;
create or replace function public.sac_digital_acquire_operator_lease(p_organization_id uuid,p_operator_id text,p_owner_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare acquired boolean;
begin
 insert into sac_digital_operator_leases values(p_organization_id,p_operator_id,p_owner_id,now()+interval '90 seconds')
 on conflict(organization_id,operator_id) do update set owner_id=excluded.owner_id,expires_at=excluded.expires_at
 where sac_digital_operator_leases.expires_at<now() or sac_digital_operator_leases.owner_id=p_owner_id;
 acquired:=found; return acquired;
end $$;
create or replace function public.sac_digital_release_operator_lease(p_organization_id uuid,p_operator_id text,p_owner_id uuid)
returns void language sql security definer set search_path=public as $$
 delete from sac_digital_operator_leases where organization_id=p_organization_id and operator_id=p_operator_id and owner_id=p_owner_id;
$$;
revoke all on function public.sac_digital_acquire_operator_lease(uuid,text,uuid),public.sac_digital_release_operator_lease(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.sac_digital_acquire_operator_lease(uuid,text,uuid),public.sac_digital_release_operator_lease(uuid,text,uuid) to service_role;
alter table public.sac_digital_outbound_starts add column if not exists notification_id text;
alter table public.sac_digital_outbound_starts add column if not exists delivery_state text not null default 'queued';
alter table public.sac_digital_delivery_attempts add column if not exists checked_at timestamptz;
create index if not exists sac_delivery_reconcile_idx on public.sac_digital_delivery_attempts(organization_id,checked_at) where state in ('accepted','queued','unknown','sent','delivered');
