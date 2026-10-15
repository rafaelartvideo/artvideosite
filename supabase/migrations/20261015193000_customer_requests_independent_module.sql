-- Pedidos Avulsos passa a ser um modulo contratavel e controlado individualmente pela Union.
-- Nao ativa empresas parceiras automaticamente e nao depende do modulo Cadastros.
begin;

insert into public.system_modules(key,name,description,category,sort_order,is_active)
values (
 'customer_requests','Pedidos Avulsos',
 'Lista de desejos de produtos e servicos solicitados por clientes, independente de OS e Cadastros.',
 'operation',25,true
)
on conflict(key) do update set
 name=excluded.name,description=excluded.description,category=excluded.category,
 sort_order=excluded.sort_order,is_active=true;

-- Somente as organizacoes da Union e da Artvideo recebem ativacao inicial.
-- Nao altera escolhas preexistentes da administracao sobre a habilitacao.
insert into public.organization_modules(organization_id,module_key,is_enabled,enabled_at,updated_at)
select o.id,'customer_requests',true,now(),now()
from public.organizations o
where o.status='active'
 and (
   coalesce(o.settings->>'is_artvideo_tenant','false')='true'
   or coalesce(o.settings->>'is_platform_operator','false')='true'
 )
on conflict(organization_id,module_key) do nothing;

insert into public.permissions(key,label,description,module_name,sort_order) values
 ('customer_requests.view','Visualizar pedidos avulsos','Acessar a lista de pedidos avulsos da empresa.','Pedidos Avulsos',3250),
 ('customer_requests.create','Criar pedidos avulsos','Registrar produtos e servicos procurados pelos clientes.','Pedidos Avulsos',3251),
 ('customer_requests.update','Alterar pedidos avulsos','Marcar pedidos pendentes, atendidos ou cancelados.','Pedidos Avulsos',3252)
on conflict(key) do update set
 label=excluded.label,description=excluded.description,module_name=excluded.module_name,sort_order=excluded.sort_order;

-- Mapeia tambem as chaves legadas (customers.requests.*) ao novo modulo,
-- sem alterar o escopo das demais permissoes do sistema.
create or replace function private.permission_required_module_keys(p_key text)
returns text[]
language sql immutable set search_path=''
as $$
select case
 when p_key='organizations.audit.view' then array[]::text[]
 when p_key like 'dashboard.%' then array['dashboard']
 when p_key like 'customer_requests.%' or p_key like 'customers.requests.%' then array['customer_requests']
 when p_key like 'customers.%' or p_key like 'registrations.%' then array['customers']
 when p_key like 'employees.%' or p_key like 'roles.%' or p_key like 'users.%' then array['employees']
 when p_key like 'agenda.%' then array['agenda']
 when p_key like 'technician_panel.%' then array['orders']
 when p_key like 'field_tracking.%' then array['field_tracking']
 when p_key like 'inventory.%' or p_key like 'products.%' then array['inventory','products']
 when p_key like 'pdv.%' then array['pdv']
 when p_key like 'finance.%' then array['finance']
 when p_key like 'equipment.%' then array['equipment']
 when p_key like 'checklists.%' then array['checklists']
 when p_key like 'general_services.%' then array['services']
 when p_key like 'service_types.%' then array['service_types']
 when p_key like 'situations.%' then array['order_situations']
 when p_key like 'order_statuses.%' then array['order_statuses']
 when p_key like 'documents.%' then array['documents']
 when p_key like 'quotes.%' then array['quotes']
 when p_key like 'settings.%' or p_key like 'terms.%' then array['company_settings']
 when p_key like 'categories.%' then array['site_categories']
 when p_key like 'brands.%' then array['site_brands']
 when p_key like 'services.%' or p_key like 'filters.%' then array['site_services']
 when p_key like 'site_settings.%' or p_key like 'contact.%' then array['site_settings']
 when p_key like 'site.%' then array['site_categories','site_brands','site_services','site_settings']
 when p_key='tools.view' then array['field_tracking','queue','pbx','marketplace','ai','sac_digital']
 when p_key in ('tools.sac_digital.use','tools.uniq.use') then array[]::text[]
 when p_key like 'queue.%' then array['queue']
 when p_key like 'pbx.%' then array['pbx']
 when p_key like 'marketplace.%' then array['marketplace']
 when p_key like 'ai.%' then array['ai']
 when p_key like 'sac_digital.%' then array['sac_digital']
 when p_key like 'operation.%' then array[
   'customers','customer_requests','orders','agenda','inventory','products','equipment',
   'checklists','services','service_types','order_situations','order_statuses',
   'documents','quotes','employees','company_settings','finance','pdv'
 ]
 else array[split_part(p_key,'.',1)]
end;
$$;
revoke all on function private.permission_required_module_keys(text) from public;

-- Copia concessoes legadas apenas a organizacoes que possuem o novo modulo.
with permission_map(source_key,target_key) as (
 values
 ('customers.requests.view','customer_requests.view'),
 ('customers.requests.create','customer_requests.create'),
 ('customers.requests.update','customer_requests.update')
)
insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,target.id
from public.role_permissions rp
join public.permissions source on source.id=rp.permission_id
join permission_map mapping on mapping.source_key=source.key
join public.permissions target on target.key=mapping.target_key
join public.roles role_row on role_row.id=rp.role_id
where private.permission_belongs_to_organization(role_row.organization_id,target.key)
on conflict(role_id,permission_id) do nothing;

with permission_map(source_key,target_key) as (
 values
 ('customers.requests.view','customer_requests.view'),
 ('customers.requests.create','customer_requests.create'),
 ('customers.requests.update','customer_requests.update')
)
insert into public.user_permission_overrides(organization_id,user_id,permission_id,created_by)
select distinct override_permission.organization_id,override_permission.user_id,
 target.id,override_permission.created_by
from public.user_permission_overrides override_permission
join public.permissions source on source.id=override_permission.permission_id
join permission_map mapping on mapping.source_key=source.key
join public.permissions target on target.key=mapping.target_key
where private.permission_belongs_to_organization(override_permission.organization_id,target.key)
on conflict(organization_id,user_id,permission_id) do nothing;

-- Union e Artvideo ja usam o modulo: libera inicialmente Gestores/Proprietarios.
-- Parceiros so recebem acesso apos a Union ativar o modulo na empresa.
insert into public.role_permissions(role_id,permission_id)
select role_row.id,permission_row.id
from public.roles role_row
join public.organization_modules module_row
 on module_row.organization_id=role_row.organization_id
 and module_row.module_key='customer_requests' and module_row.is_enabled
join public.organizations organization
 on organization.id=role_row.organization_id
cross join public.permissions permission_row
where role_row.is_active
 and lower(btrim(role_row.name)) in ('gestor','proprietario','proprietário')
 and permission_row.key in ('customer_requests.view','customer_requests.create','customer_requests.update')
 and private.permission_belongs_to_organization(role_row.organization_id,permission_row.key)
on conflict(role_id,permission_id) do nothing;

-- Tabelas existentes continuam a armazenar os mesmos registros.
-- Somente usuarios membros do proprio tenant e com modulo + permissao leem/escrevem.
drop policy if exists customer_requests_select on public.customer_requests;
create policy customer_requests_select on public.customer_requests
for select to authenticated
using (private.has_tenant_module_permission(organization_id,'customer_requests','customer_requests.view'));

drop policy if exists customer_requests_insert on public.customer_requests;
create policy customer_requests_insert on public.customer_requests
for insert to authenticated
with check (
  created_by=(select auth.uid())
  and private.has_tenant_module_permission(organization_id,'customer_requests','customer_requests.create')
  and exists (
   select 1 from public.customers c
   where c.id=customer_id and c.organization_id=organization_id
  )
);

drop policy if exists customer_requests_update on public.customer_requests;
create policy customer_requests_update on public.customer_requests
for update to authenticated
using (private.has_tenant_module_permission(organization_id,'customer_requests','customer_requests.update'))
with check (private.has_tenant_module_permission(organization_id,'customer_requests','customer_requests.update'));

-- Busca de clientes e cadastro rapido exclusivos do fluxo de Pedidos Avulsos:
-- nao concedem acesso ao modulo Cadastros nem a edicao/exclusao de clientes.
drop policy if exists customers_customer_requests_read on public.customers;
create policy customers_customer_requests_read on public.customers
for select to authenticated
using (private.has_tenant_module_permission(organization_id,'customer_requests','customer_requests.view'));

drop policy if exists customers_customer_requests_create on public.customers;
create policy customers_customer_requests_create on public.customers
for insert to authenticated
with check (private.has_tenant_module_permission(organization_id,'customer_requests','customer_requests.create'));

drop policy if exists customer_addresses_customer_requests_read on public.customer_addresses;
create policy customer_addresses_customer_requests_read on public.customer_addresses
for select to authenticated
using (private.has_tenant_module_permission(organization_id,'customer_requests','customer_requests.view'));

drop policy if exists customer_addresses_customer_requests_create on public.customer_addresses;
create policy customer_addresses_customer_requests_create on public.customer_addresses
for insert to authenticated
with check (
 private.has_tenant_module_permission(organization_id,'customer_requests','customer_requests.create')
 and exists(
   select 1 from public.customers c
   where c.id=customer_id and c.organization_id=organization_id
 )
);

commit;

-- Conferencia no banco correto:
-- select key,name,is_active from public.system_modules where key='customer_requests';
-- select o.name,m.is_enabled from public.organization_modules m
-- join public.organizations o on o.id=m.organization_id where m.module_key='customer_requests';
-- select private.permission_required_module_keys('customer_requests.view');
