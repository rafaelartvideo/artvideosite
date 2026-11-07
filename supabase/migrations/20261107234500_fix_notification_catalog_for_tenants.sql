-- Corrige permissões invisíveis em empresas parceiras: 'notifications' nao e um modulo habilitavel.
-- As permissões de notificações seguem o módulo real; pessoais são transversais.
begin;
CREATE OR REPLACE FUNCTION private.permission_required_module_keys(p_key text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
select case
 when p_key in ('notifications.view','notifications.personal.view','notifications.personal.receive') then array[]::text[]
 when p_key like 'notifications.orders.%' or p_key like 'notifications.technician.%' then array['orders']
 when p_key like 'notifications.customers.%' then array['customers']
 when p_key like 'notifications.quotes.%' then array['quotes']
 when p_key like 'notifications.agenda.%' then array['agenda']
 when p_key like 'notifications.work_items.%' then array['work_items']
 when p_key like 'notifications.inventory.%' then array['inventory','products']
 when p_key like 'notifications.pdv.%' then array['pdv']
 when p_key like 'notifications.finance.%' then array['finance']
 when p_key like 'notifications.site.%' then array['site_categories','site_brands','site_services','site_settings']
 when p_key like 'notifications.%' then array[]::text[]
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
$function$;

-- Preenche as permissões pessoais para funções que já podiam usar
-- OS, tarefas ou painel técnico. Notificações gerais permanecem opt-in.
with role_access as (
 select r.id as role_id,r.organization_id,
   lower(btrim(r.name)) in ('gestor','proprietario','proprietário')
     or lower(btrim(r.name)) like 'gestor %' as is_manager,
   exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
          where rp.role_id=r.id and p.key='work_items.view') as has_tasks,
   exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
          where rp.role_id=r.id and p.key='technician_panel.view') as has_technician,
   exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
          where rp.role_id=r.id and p.key='orders.view') as has_orders
 from public.roles r where r.is_active
), eligible as (
 select a.role_id,a.organization_id,p.id as permission_id
 from role_access a cross join public.permissions p
 where (
       ((a.is_manager or a.has_tasks or a.has_technician or a.has_orders)
        and p.key in ('notifications.view','notifications.personal.view','notifications.personal.receive'))
    or (a.has_tasks and p.key in ('notifications.work_items.view','notifications.work_items.receive'))
    or (a.has_technician and p.key in ('notifications.technician.view','notifications.technician.receive'))
    or (a.has_orders and p.key='notifications.orders.view')
    or (a.is_manager and p.key like 'notifications.%.view')
 )
 and private.permission_belongs_to_organization(a.organization_id,p.key)
)
insert into public.role_permissions(role_id,permission_id)
select role_id,permission_id from eligible
on conflict(role_id,permission_id) do nothing;

commit;
