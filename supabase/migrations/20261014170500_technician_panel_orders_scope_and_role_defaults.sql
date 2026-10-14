-- Painel do Tecnico e uma area do modulo de OS, nao um modulo de assinatura.
-- Antes, todas as chaves technician_panel.* exigiam um modulo inexistente
-- ("technician_panel"), ocultando os 11 checkboxes nas empresas parceiras.
begin;

create or replace function private.permission_required_module_keys(p_key text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case
    when p_key = 'organizations.audit.view' then array[]::text[]
    when p_key like 'dashboard.%' then array['dashboard']
    when p_key like 'customers.%' or p_key like 'registrations.%' then array['customers']
    when p_key like 'employees.%' or p_key like 'roles.%' or p_key like 'users.%' then array['employees']
    when p_key like 'agenda.%' then array['agenda']
    -- O acesso permanece limitado ao modulo OS contratado/habilitado.
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
    when p_key = 'tools.view' then array['field_tracking','queue','pbx','marketplace','ai','sac_digital']
    when p_key in ('tools.sac_digital.use','tools.uniq.use') then array[]::text[]
    when p_key like 'queue.%' then array['queue']
    when p_key like 'pbx.%' then array['pbx']
    when p_key like 'marketplace.%' then array['marketplace']
    when p_key like 'ai.%' then array['ai']
    when p_key like 'sac_digital.%' then array['sac_digital']
    when p_key like 'operation.%' then array[
      'customers','orders','agenda','inventory','products','equipment','checklists',
      'services','service_types','order_situations','order_statuses','documents',
      'quotes','employees','company_settings','finance','pdv'
    ]
    else array[split_part(p_key, '.', 1)]
  end;
$$;

-- Perfil tecnico do sistema recebe acesso ao proprio painel e as
-- operacoes de execucao basicas. Detalhes sensiveis (contato,
-- cliente, fotos, localizacao, etc.) continuam opt-in, por checkbox.
-- Nao afeta outras funcoes e nao libera acesso a OSs alheias.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.organizations o on o.id = r.organization_id
join public.organization_modules m
  on m.organization_id = r.organization_id and m.module_key = 'orders' and m.is_enabled
join public.permissions p on p.key in (
  'technician_panel.view',
  'technician_panel.data.equipment',
  'technician_panel.data.diagnosis',
  'technician_panel.actions.start',
  'technician_panel.actions.complete'
)
where lower(btrim(r.name)) = 'técnico'
  and r.is_system
  and r.is_active
  and o.status = 'active'
  and private.permission_belongs_to_organization(r.organization_id, p.key)
on conflict (role_id, permission_id) do nothing;

commit;
