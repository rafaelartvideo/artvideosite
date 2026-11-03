begin;

insert into public.permissions(key,label,description,module_name,sort_order)
values ('platform.providers.check','Consultar antecedentes de prestadores','Autoriza verificações pontuais de certidões de antecedentes de prestadores da Union World.','Prestadores de Serviços',989)
on conflict (key) do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key='platform.providers.check'
where r.organization_id=public.platform_operator_organization_id()
  and lower(r.name)='gestor'
on conflict do nothing;

create table if not exists public.platform_provider_background_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.platform_operator_organization_id(),
  provider_id uuid not null,
  source text not null check (source in ('policia_federal','justica_estadual')),
  uf text not null default '' check (uf='' or uf ~ '^[A-Z]{2}$'),
  result text not null default 'processing' check (result in ('processing','negative','review','inconclusive','error')),
  source_status text,
  certificate_number text,
  validation_code text,
  issue_date date,
  valid_until date,
  provider_request_id text,
  requested_by uuid not null,
  purpose text not null check (char_length(btrim(purpose)) between 10 and 300),
  informed_declaration boolean not null check (informed_declaration=true),
  request_date timestamptz not null default now(),
  completed_at timestamptz,
  error_reason text,
  foreign key(provider_id,organization_id)
    references public.platform_service_providers(id,organization_id) on delete cascade,
  foreign key(requested_by) references auth.users(id)
);

create index if not exists platform_provider_checks_history_idx
  on public.platform_provider_background_checks(provider_id,request_date desc);

create unique index if not exists platform_provider_checks_processing_unique
  on public.platform_provider_background_checks(provider_id,source,uf)
  where result='processing';

alter table public.platform_provider_background_checks enable row level security;
revoke all on public.platform_provider_background_checks from public,anon,authenticated;
grant select on public.platform_provider_background_checks to authenticated;

create policy platform_provider_checks_read on public.platform_provider_background_checks
for select to authenticated
using (organization_id=(select public.platform_operator_organization_id())
  and (select private.has_organization_permission(public.platform_operator_organization_id(),'platform.providers.check')));

commit;