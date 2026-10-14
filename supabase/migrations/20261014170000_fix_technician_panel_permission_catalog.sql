-- Corrige a ausência do Painel do Técnico no catálogo de Funções e Permissões.
-- As permissões technician_panel.* pertencem ao módulo orders habilitado na empresa.
-- Não altera roles, RLS, concessões existentes ou contratos de módulos.
begin;

create or replace function private.permission_required_module_keys(p_key text)
returns text[]
language sql
immutable
set search_path to ''
as $$
  select case
    when p_key = 'organizations.audit.view' then array[]::text[]
    when p_key like 'dashboard.%' then array['dashboard']
    when p_key like 'customers.%' or p_key like 'registrations.%' then array['customers']
    when p_key like 'employees.%' or p_key like 'roles.%' or p_key like 'users.%' then array['employees']
    when p_key like 'agenda.%' then array['agenda']
    -- O painel usa o módulo de Ordens de Serviço; não existe um módulo comercial
    -- 'technician_panel' separado para as empresas parceiras.
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
    when p_key = 'tools.view' then array['field_tracking','queue','pbx','marketplace','ai']
    when p_key in ('tools.sac_digital.use','tools.uniq.use') then array[]::text[]
    when p_key like 'queue.%' then array['queue']
    when p_key like 'pbx.%' then array['pbx']
    when p_key like 'marketplace.%' then array['marketplace']
    when p_key like 'ai.%' then array['ai']
    when p_key like 'operation.%' then array[
      'customers','orders','agenda','inventory','products','equipment','checklists',
      'services','service_types','order_situations','order_statuses','documents',
      'quotes','employees','company_settings','finance','pdv'
    ]
    else array[split_part(p_key, '.', 1)]
  end;
$$;

revoke all on function private.permission_required_module_keys(text) from public;

-- Em bancos com a etapa 3 aplicada, deve haver 11 permissões do Painel do Técnico.
-- Evita declarar sucesso se a etapa anterior estiver ausente/incompleta.
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.permissions
  where key like 'technician_panel.%';
  if v_count <> 11 then
    raise exception 'Esperadas 11 permissões do Painel do Técnico; encontradas %. Execute primeiro a etapa 3.', v_count
      using errcode = 'P0001';
  end if;
  if private.permission_required_module_keys('technician_panel.view') is distinct from array['orders']::text[] then
    raise exception 'O vínculo do Painel do Técnico ao módulo orders não foi aplicado.'
      using errcode = 'P0001';
  end if;
end;
$$;

commit;

-- Consulta de conferência: deve retornar 11 registros no catálogo bruto.
select key, label, module_name
from public.permissions
where key like 'technician_panel.%'
order by sort_order;
