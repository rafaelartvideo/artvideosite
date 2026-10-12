-- Etapa 1 NFS-e: somente cadastros e rascunhos. Emissao real permanece bloqueada.
begin;

insert into public.system_modules (key,name,description,category,sort_order,is_active)
values ('nfse','Notas Fiscais de Serviço','Preparacao e gestao de rascunhos de NFS-e, sem emissao em producao.','operation',345,true)
on conflict (key) do update set name=excluded.name,description=excluded.description,category=excluded.category,sort_order=excluded.sort_order,is_active=true;

-- Disponivel na Union e empresas existentes; a plataforma pode desabilitar por empresa.
insert into public.organization_modules (organization_id,module_key,is_enabled,enabled_at,updated_at)
select id,'nfse',true,now(),now() from public.organizations
on conflict (organization_id,module_key) do nothing;

insert into public.permissions (key,label,description,module_name,sort_order) values
('nfse.view','Visualizar notas de servico','Consulta rascunhos NFS-e e situacao do modulo.','Notas Fiscais de Servico',5200),
('nfse.drafts.manage','Preparar rascunhos','Gera rascunhos a partir de servicos de OS, sem transmitir.','Notas Fiscais de Servico',5201),
('nfse.services.manage','Configurar codigos fiscais','Relaciona servicos da empresa a codigos fiscais para conferência.','Notas Fiscais de Servico',5202),
('nfse.settings.manage','Configurar emissor fiscal','Altera dados e parametros fiscais da empresa, sem habilitar emissao.','Notas Fiscais de Servico',5203)
on conflict (key) do update set label=excluded.label,description=excluded.description,module_name=excluded.module_name,sort_order=excluded.sort_order;

-- Respeita os acessos atuais de cada funcao; nenhuma funcao recebe permissao de emitir.
insert into public.role_permissions (role_id,permission_id)
select distinct rp.role_id, target.id
from public.role_permissions rp
join public.permissions source on source.id=rp.permission_id and source.key in ('orders.view','finance.view','orders.monitor.view')
cross join public.permissions target
where target.key='nfse.view'
on conflict (role_id,permission_id) do nothing;

insert into public.role_permissions (role_id,permission_id)
select distinct rp.role_id, target.id
from public.role_permissions rp
join public.permissions source on source.id=rp.permission_id and source.key='orders.create'
cross join public.permissions target
where target.key in ('nfse.view','nfse.drafts.manage')
on conflict (role_id,permission_id) do nothing;

insert into public.role_permissions (role_id,permission_id)
select distinct rp.role_id, target.id
from public.role_permissions rp
join public.permissions source on source.id=rp.permission_id and source.key='settings.update'
cross join public.permissions target
where target.key in ('nfse.view','nfse.settings.manage','nfse.services.manage')
on conflict (role_id,permission_id) do nothing;

create table if not exists public.fiscal_company_settings (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 tax_regime text not null default 'not_configured'
   check (tax_regime in ('not_configured','simples_nacional','lucro_presumido','lucro_real','mei','other')),
 municipal_registration text,
 municipality_ibge_code text check (municipality_ibge_code is null or municipality_ibge_code ~ '^[0-9]{7}$'),
 default_service_code text,
 fiscal_contact_email text,
 accounting_notes text,
 provider_key text,
 emission_enabled boolean not null default false check (emission_enabled = false),
 automatic_emission_enabled boolean not null default false check (automatic_emission_enabled = false),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references public.profiles(id) on delete set null,
 check (provider_key is null),
 check (char_length(coalesce(accounting_notes,'')) <= 3000)
);

create table if not exists public.fiscal_service_mappings (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 general_service_id uuid not null references public.general_services(id) on delete cascade,
 national_service_code text,
 municipal_service_code text,
 national_taxation_code text,
 suggested_iss_rate numeric(7,4) check (suggested_iss_rate is null or suggested_iss_rate between 0 and 100),
 notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (organization_id,general_service_id),
 check (char_length(coalesce(notes,'')) <= 2000)
);
create index if not exists fiscal_service_mappings_org_idx on public.fiscal_service_mappings(organization_id,general_service_id);

create table if not exists public.fiscal_documents (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 document_type text not null default 'nfse' check (document_type='nfse'),
 status text not null default 'draft' check (status='draft'),
 source_type text not null default 'service_order' check (source_type='service_order'),
 source_order_id uuid references public.service_orders(id) on delete restrict,
 customer_id uuid references public.customers(id) on delete set null,
 customer_name_snapshot text,
 customer_tax_id_snapshot text,
 source_order_number_snapshot text,
 services_gross_total numeric(14,2) not null default 0 check (services_gross_total>=0),
 services_discount_total numeric(14,2) not null default 0 check (services_discount_total>=0),
 services_net_total numeric(14,2) not null default 0 check (services_net_total>=0),
 requires_fiscal_review boolean not null default true check (requires_fiscal_review=true),
 fiscal_payload_snapshot jsonb not null default '{}'::jsonb,
 provider_key text check (provider_key is null),
 external_id text check (external_id is null),
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index if not exists fiscal_documents_order_draft_uidx
  on public.fiscal_documents(organization_id,source_order_id) where source_order_id is not null;
create index if not exists fiscal_documents_org_created_idx on public.fiscal_documents(organization_id,created_at desc,id desc);
create index if not exists fiscal_documents_org_status_idx on public.fiscal_documents(organization_id,status,created_at desc);

create table if not exists public.fiscal_document_items (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 fiscal_document_id uuid not null references public.fiscal_documents(id) on delete cascade,
 source_order_item_id uuid references public.service_order_items(id) on delete set null,
 general_service_id uuid references public.general_services(id) on delete set null,
 description_snapshot text not null,
 detail_snapshot text,
 quantity numeric(14,4) not null check (quantity>0),
 unit_price numeric(14,2) not null check (unit_price>=0),
 amount numeric(14,2) not null check (amount>=0),
 national_service_code_snapshot text,
 municipal_service_code_snapshot text,
 national_taxation_code_snapshot text,
 created_at timestamptz not null default now(),
 unique (fiscal_document_id,source_order_item_id)
);
create index if not exists fiscal_document_items_doc_idx on public.fiscal_document_items(fiscal_document_id);

-- Nenhum acesso anonimo. RLS isola tenants e separa as permissoes de consulta/configuracao.
alter table public.fiscal_company_settings enable row level security;
alter table public.fiscal_service_mappings enable row level security;
alter table public.fiscal_documents enable row level security;
alter table public.fiscal_document_items enable row level security;

revoke all on public.fiscal_company_settings,public.fiscal_service_mappings,public.fiscal_documents,public.fiscal_document_items from public,anon,authenticated;
grant select on public.fiscal_company_settings,public.fiscal_service_mappings,public.fiscal_documents,public.fiscal_document_items to authenticated;
grant insert,update on public.fiscal_company_settings,public.fiscal_service_mappings to authenticated;
grant insert on public.fiscal_documents,public.fiscal_document_items to authenticated;
grant all on public.fiscal_company_settings,public.fiscal_service_mappings,public.fiscal_documents,public.fiscal_document_items to service_role;

create policy fiscal_company_settings_read on public.fiscal_company_settings
for select to authenticated
using (private.has_effective_organization_permission(organization_id,'nfse.view')
  or private.has_effective_organization_permission(organization_id,'nfse.settings.manage'));
create policy fiscal_company_settings_insert on public.fiscal_company_settings
for insert to authenticated
with check (private.has_effective_organization_permission(organization_id,'nfse.settings.manage'));
create policy fiscal_company_settings_update on public.fiscal_company_settings
for update to authenticated
using (private.has_effective_organization_permission(organization_id,'nfse.settings.manage'))
with check (private.has_effective_organization_permission(organization_id,'nfse.settings.manage'));

create policy fiscal_service_mappings_read on public.fiscal_service_mappings
for select to authenticated
using (private.has_effective_organization_permission(organization_id,'nfse.view'));
create policy fiscal_service_mappings_insert on public.fiscal_service_mappings
for insert to authenticated
with check (
 private.has_effective_organization_permission(organization_id,'nfse.services.manage')
 and exists(select 1 from public.general_services s where s.id=general_service_id and s.organization_id=organization_id)
);
create policy fiscal_service_mappings_update on public.fiscal_service_mappings
for update to authenticated
using (private.has_effective_organization_permission(organization_id,'nfse.services.manage'))
with check (
 private.has_effective_organization_permission(organization_id,'nfse.services.manage')
 and exists(select 1 from public.general_services s where s.id=general_service_id and s.organization_id=organization_id)
);

create policy fiscal_documents_read on public.fiscal_documents
for select to authenticated
using (private.has_effective_organization_permission(organization_id,'nfse.view'));
create policy fiscal_documents_insert on public.fiscal_documents
for insert to authenticated
with check (
 private.has_effective_organization_permission(organization_id,'nfse.drafts.manage')
 and (source_order_id is null or exists(
  select 1 from public.service_orders o where o.id=source_order_id and o.organization_id=organization_id
 ))
 and (customer_id is null or exists(
  select 1 from public.customers c where c.id=customer_id and c.organization_id=organization_id
 ))
);
create policy fiscal_document_items_read on public.fiscal_document_items
for select to authenticated
using (private.has_effective_organization_permission(organization_id,'nfse.view')
 and exists(select 1 from public.fiscal_documents d where d.id=fiscal_document_id and d.organization_id=organization_id));
create policy fiscal_document_items_insert on public.fiscal_document_items
for insert to authenticated
with check (
 private.has_effective_organization_permission(organization_id,'nfse.drafts.manage')
 and exists(select 1 from public.fiscal_documents d where d.id=fiscal_document_id and d.organization_id=organization_id)
 and (source_order_item_id is null or exists(
  select 1 from public.service_order_items i where i.id=source_order_item_id and i.organization_id=organization_id
 ))
);

-- Draft criado por RPC: soma exclusivamente service/custom_service. Nenhum POST externo.
create or replace function public.create_nfse_draft_from_order_v1(p_service_order_id uuid)
returns uuid
language plpgsql security invoker set search_path=''
as $$
declare
 v_order public.service_orders%rowtype;
 v_document_id uuid;
 v_customer jsonb;
 v_gross numeric(14,2);
begin
 select * into v_order from public.service_orders where id=p_service_order_id;
 if not found then raise exception 'OS nao encontrada ou sem acesso.' using errcode='42501'; end if;
 if not private.has_effective_organization_permission(v_order.organization_id,'nfse.drafts.manage') then
   raise exception 'Sem permissao para criar rascunhos de NFS-e.' using errcode='42501';
 end if;
 if v_order.cancelled_at is not null then
   raise exception 'Nao e possivel preparar NFS-e de uma OS cancelada.' using errcode='22023';
 end if;
 select coalesce(round(sum(coalesce(i.subtotal,coalesce(i.quantity,1)*coalesce(i.unit_price,0)+coalesce(i.additional_cost,0))),2),0)
 into v_gross from public.service_order_items i
 where i.service_order_id=v_order.id and i.organization_id=v_order.organization_id
 and i.item_type in ('service','custom_service');
 if v_gross<=0 then
   raise exception 'Esta OS nao possui servicos com valor positivo para a NFS-e.' using errcode='22023';
 end if;
 select to_jsonb(c) into v_customer from public.customers c
 where c.id=v_order.customer_id and c.organization_id=v_order.organization_id;
 insert into public.fiscal_documents (
  organization_id,source_order_id,customer_id,customer_name_snapshot,customer_tax_id_snapshot,
  source_order_number_snapshot,services_gross_total,services_net_total,created_by,fiscal_payload_snapshot
 )
 values (
  v_order.organization_id,v_order.id,v_order.customer_id,
  coalesce(nullif(v_customer->>'name',''),nullif(v_customer->>'full_name',''),'Cliente nao informado'),
  coalesce(nullif(v_customer->>'cpf_cnpj',''),nullif(v_customer->>'cpf',''),nullif(v_customer->>'cnpj','')),
  v_order.os_number::text,v_gross,v_gross,auth.uid(),
  jsonb_build_object('source','service_order','order_id',v_order.id,'requires_manual_tax_review',true,
    'products_excluded',true,'discount_requires_review',true)
 )
 on conflict (organization_id,source_order_id) where source_order_id is not null do nothing
 returning id into v_document_id;

 if v_document_id is null then
   select d.id into v_document_id from public.fiscal_documents d
   where d.organization_id=v_order.organization_id and d.source_order_id=v_order.id;
   return v_document_id;
 end if;

 insert into public.fiscal_document_items (
  organization_id,fiscal_document_id,source_order_item_id,general_service_id,
  description_snapshot,detail_snapshot,quantity,unit_price,amount,
  national_service_code_snapshot,municipal_service_code_snapshot,national_taxation_code_snapshot
 )
 select v_order.organization_id,v_document_id,i.id,i.general_service_id,
  i.title_snapshot,i.description_snapshot,i.quantity,coalesce(i.unit_price,0),
  coalesce(i.subtotal,coalesce(i.quantity,1)*coalesce(i.unit_price,0)+coalesce(i.additional_cost,0)),
  map.national_service_code,map.municipal_service_code,map.national_taxation_code
 from public.service_order_items i
 left join public.fiscal_service_mappings map
  on map.organization_id=i.organization_id and map.general_service_id=i.general_service_id
 where i.service_order_id=v_order.id and i.organization_id=v_order.organization_id
 and i.item_type in ('service','custom_service');
 return v_document_id;
end;
$$;

revoke all on function public.create_nfse_draft_from_order_v1(uuid) from public,anon;
grant execute on function public.create_nfse_draft_from_order_v1(uuid) to authenticated;

comment on table public.fiscal_documents is 'Etapa 1: apenas rascunhos nao fiscais; sem numero de NFS-e, transmissao, PDF ou XML autorizado.';
comment on function public.create_nfse_draft_from_order_v1(uuid) is 'Prepara somente itens de servico da OS. Retorna sempre o mesmo rascunho por OS e nunca emite nota.';

commit;
