begin;

insert into public.system_modules (key,name,description,category,sort_order,is_active)
values ('sac_digital','SAC Digital','Atendimento omnichannel integrado ao CRM para receber e enviar mensagens pela conta SAC Digital da empresa.','operation',340,true)
on conflict (key) do update set name=excluded.name,description=excluded.description,category=excluded.category,sort_order=excluded.sort_order,is_active=true;

insert into public.organization_modules (organization_id,module_key,is_enabled,enabled_at,updated_at)
select id,'sac_digital',true,now(),now()
from public.organizations
where coalesce((settings->>'is_artvideo_tenant')::boolean,false)
on conflict (organization_id,module_key) do update set
  is_enabled=true,
  enabled_at=coalesce(public.organization_modules.enabled_at,excluded.enabled_at),
  updated_at=excluded.updated_at;

insert into public.permissions (key,label,description,module_name,sort_order) values
('sac_digital.view','Acessar SAC Digital','Acessa o módulo SAC Digital da empresa.','SAC Digital',5020),
('sac_digital.messages.view','Visualizar conversas','Visualiza protocolos, contatos e mensagens do SAC Digital.','SAC Digital',5021),
('sac_digital.messages.send','Enviar mensagens','Envia mensagens aos clientes pela integração SAC Digital.','SAC Digital',5022),
('sac_digital.protocols.manage','Gerenciar atendimentos','Encaminha e finaliza protocolos de atendimento do SAC Digital.','SAC Digital',5023),
('sac_digital.settings.manage','Gerenciar integração','Configura credenciais, webhook e parâmetros da integração SAC Digital.','SAC Digital',5024)
on conflict (key) do update set label=excluded.label,description=excluded.description,module_name=excluded.module_name,sort_order=excluded.sort_order;

insert into public.role_permissions (role_id,permission_id)
select distinct rp.role_id,target.id
from public.role_permissions rp
join public.permissions source on source.id=rp.permission_id and source.key='tools.sac_digital.use'
join public.roles role on role.id=rp.role_id
join public.organizations organization on organization.id=role.organization_id
  and coalesce((organization.settings->>'is_artvideo_tenant')::boolean,false)
cross join public.permissions target
where target.key in ('sac_digital.view','sac_digital.messages.view','sac_digital.messages.send')
on conflict (role_id,permission_id) do nothing;

insert into public.role_permissions (role_id,permission_id)
select distinct rp.role_id,target.id
from public.role_permissions rp
join public.permissions source on source.id=rp.permission_id and source.key='settings.update'
join public.roles role on role.id=rp.role_id
join public.organizations organization on organization.id=role.organization_id
  and coalesce((organization.settings->>'is_artvideo_tenant')::boolean,false)
cross join public.permissions target
where target.key in ('sac_digital.protocols.manage','sac_digital.settings.manage')
and exists (
  select 1
  from public.role_permissions legacy
  join public.permissions p on p.id=legacy.permission_id and p.key='tools.sac_digital.use'
  where legacy.role_id=rp.role_id
)
on conflict (role_id,permission_id) do nothing;

create or replace function private.permission_required_module_keys(p_key text)
returns text[]
language sql immutable set search_path=''
as $$
select case
  when p_key='organizations.audit.view' then array[]::text[]
  when p_key like 'dashboard.%' then array['dashboard']
  when p_key like 'customers.%' or p_key like 'registrations.%' then array['customers']
  when p_key like 'employees.%' or p_key like 'roles.%' or p_key like 'users.%' then array['employees']
  when p_key like 'agenda.%' then array['agenda']
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
  when p_key like 'operation.%' then array['customers','orders','agenda','inventory','products','equipment','checklists','services','service_types','order_situations','order_statuses','documents','quotes','employees','company_settings','finance','pdv']
  else array[split_part(p_key,'.',1)]
end;
$$;

revoke all on function private.permission_required_module_keys(text) from public;

commit;
