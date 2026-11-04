create table if not exists public.pbx_queue_live_status (
 queue_id uuid primary key references public.pbx_queues(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete restrict,
 waiting_count integer not null default 0 check (waiting_count between 0 and 500),
 queue_state text not null default 'unknown' check (queue_state in ('active','missing','unknown')),
 members jsonb not null default '[]'::jsonb
   check (jsonb_typeof(members)='array' and jsonb_array_length(members)<=20),
 sampled_at timestamptz not null default now()
);
create index if not exists pbx_queue_live_org_idx
  on public.pbx_queue_live_status (organization_id,sampled_at desc);
alter table public.pbx_queue_live_status enable row level security;
revoke all on public.pbx_queue_live_status from public,anon,authenticated;
grant select on public.pbx_queue_live_status to authenticated;
grant select,insert,update,delete on public.pbx_queue_live_status to service_role;

drop policy if exists pbx_queue_live_manager_select on public.pbx_queue_live_status;
create policy pbx_queue_live_manager_select on public.pbx_queue_live_status
 for select to authenticated using (
   (select auth.uid()) is not null
   and private.is_platform_organization(organization_id)
   and private.has_organization_permission(organization_id,'pbx.manage')
   and exists(select 1 from public.pbx_queues q
      where q.id=queue_id and q.organization_id=pbx_queue_live_status.organization_id)
);

do $$
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
   and not exists(select 1 from pg_publication_tables
     where pubname='supabase_realtime' and schemaname='public'
       and tablename='pbx_queue_live_status') then
   alter publication supabase_realtime add table public.pbx_queue_live_status;
 end if;
end $$;

comment on table public.pbx_queue_live_status is
  'Snapshot a cada ciclo do agente VPS, somente leitura para gestores Union. Nao altera o roteamento FVX.';

