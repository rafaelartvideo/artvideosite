-- Regras de notificacao por perfil e relevancia do evento.
-- Historico/auditoria permanecem intocados; somente a entrega e a caixa mudam.
begin;

insert into public.permissions(key,label,description,module_name,sort_order) values
('notifications.view','Acessar notificações','Permite abrir a central de notificações, respeitando os módulos autorizados.','Notificações',4100),
('notifications.personal.view','Visualizar notificações pessoais','Ver avisos destinados diretamente ao usuário.','Notificações',4101),
('notifications.personal.receive','Receber notificações pessoais','Ativar entrega e contador de avisos atribuídos à pessoa.','Notificações',4102)
on conflict(key) do update set label=excluded.label,description=excluded.description,module_name=excluded.module_name,sort_order=excluded.sort_order;

with scopes(scope,name) as (
  values
    ('orders', 'Ordens de Serviço'),
    ('technician', 'Painel do Técnico'),
    ('customers', 'Cadastros'),
    ('quotes', 'Orçamentos'),
    ('agenda', 'Agenda'),
    ('work_items', 'Tarefas'),
    ('inventory', 'Estoque'),
    ('pdv', 'PDV'),
    ('finance', 'Financeiro'),
    ('site', 'Site e loja'),
    ('admin', 'Administração')
)
insert into public.permissions(key,label,description,module_name,sort_order)
select 'notifications.'||scope||'.view', 'Visualizar — '||name,
       'Exibir os avisos autorizados desse módulo na central.', 'Notificações', 4120+row_number() over(order by scope)*2
from scopes
union all
select 'notifications.'||scope||'.receive', 'Receber — '||name,
       'Ativar contador e alertas desse módulo.', 'Notificações', 4121+row_number() over(order by scope)*2
from scopes
on conflict(key) do update set label=excluded.label,description=excluded.description,module_name=excluded.module_name,sort_order=excluded.sort_order;

-- Conserva tarefas/serviços pessoais para perfis que já possuem acesso aos recursos.
with eligible as (
 select distinct r.id as role_id,
        lower(btrim(r.name)) in ('gestor','proprietario','proprietário') or lower(btrim(r.name)) like 'gestor %' as manager,
        exists(select 1 from public.role_permissions rp join public.permissions perm on perm.id=rp.permission_id
          where rp.role_id=r.id and perm.key in ('work_items.view','technician_panel.view','orders.view')) as personal,
        exists(select 1 from public.role_permissions rp join public.permissions perm on perm.id=rp.permission_id
          where rp.role_id=r.id and perm.key='work_items.view') as tasks,
        exists(select 1 from public.role_permissions rp join public.permissions perm on perm.id=rp.permission_id
          where rp.role_id=r.id and perm.key='technician_panel.view') as technician,
        exists(select 1 from public.role_permissions rp join public.permissions perm on perm.id=rp.permission_id
          where rp.role_id=r.id and perm.key='orders.view') as orders
 from public.roles r where r.is_active
), grants as (
 select e.role_id, p.id as permission_id
 from eligible e join public.roles r on r.id=e.role_id
 cross join public.permissions p
 where (
      ((e.manager or e.personal) and p.key='notifications.view')
   or ((e.manager or e.personal) and p.key in ('notifications.personal.view','notifications.personal.receive'))
   or (e.tasks and p.key in ('notifications.work_items.view','notifications.work_items.receive'))
   or (e.technician and p.key in ('notifications.technician.view','notifications.technician.receive'))
   or (e.orders and p.key='notifications.orders.view')
   or (e.manager and p.key like 'notifications.%.view')
   or (e.manager and p.key in ('notifications.finance.receive','notifications.quotes.receive','notifications.pdv.receive'))
 )
 and private.permission_belongs_to_organization(r.organization_id,p.key)
)
insert into public.role_permissions(role_id,permission_id)
select role_id,permission_id from grants
on conflict(role_id,permission_id) do nothing;

create or replace function private.notification_scope_v1(p_module text)
returns text language sql immutable set search_path='' as $$
 select case p_module
 when 'orders' then 'orders'
 when 'technicianPanel' then 'technician'
 when 'customers' then 'customers'
 when 'quotes' then 'quotes'
 when 'agenda' then 'agenda'
 when 'workItems' then 'work_items'
 when 'inventory' then 'inventory'
 when 'pdv' then 'pdv'
 when 'finance' then 'finance'
 when 'services' then 'site'
 when 'brands' then 'site'
 when 'categories' then 'site'
 when 'siteSettings' then 'site'
 else 'admin' end;
$$;

-- Aviso individual explícito é relevante. Auditoria genérica só vira aviso
-- para eventos escolhidos; mudanças rotineiras (incluindo OS/cliente) não.
create or replace function private.notification_is_relevant_v1(
  p_audit_id bigint,p_recipient uuid,p_entity text,p_event text
) returns boolean language sql immutable set search_path='' as $$
  select p_recipient is not null
      or p_audit_id is null
      or (p_event='created' and p_entity in
         ('service_orders','financial_settlements','pdv_sales','quote_requests','document_signatures'));
$$;

create or replace function private.notification_can_receive_v1(
  p_org uuid,p_module text,p_recipient uuid
) returns boolean language sql stable set search_path='' as $$
 select private.has_organization_permission(p_org,
           'notifications.'||private.notification_scope_v1(p_module)||'.receive')
   and (p_recipient is null or private.has_organization_permission(p_org,'notifications.personal.receive'));
$$;

revoke all on function private.notification_scope_v1(text) from public,anon,authenticated;
revoke all on function private.notification_is_relevant_v1(bigint,uuid,text,text) from public,anon,authenticated;
revoke all on function private.notification_can_receive_v1(uuid,text,uuid) from public,anon,authenticated;
grant execute on function private.notification_scope_v1(text) to authenticated;
grant execute on function private.notification_is_relevant_v1(bigint,uuid,text,text) to authenticated;
grant execute on function private.notification_can_receive_v1(uuid,text,uuid) to authenticated;

create or replace function private.notification_relevance_guard_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not private.notification_is_relevant_v1(new.audit_log_id,new.recipient_user_id,new.entity_type,new.event_type) then
   return null;
 end if;
 return new;
end;
$$;
revoke all on function private.notification_relevance_guard_v1() from public,anon,authenticated;
drop trigger if exists zz_notification_relevance_guard_v1 on public.organization_notifications;
create trigger zz_notification_relevance_guard_v1 before insert on public.organization_notifications
for each row execute function private.notification_relevance_guard_v1();

drop policy if exists organization_notifications_select on public.organization_notifications;
create policy organization_notifications_select on public.organization_notifications
for select to authenticated using (
  private.is_organization_member(organization_id)
  and (recipient_user_id is null or recipient_user_id=(select auth.uid()))
  and private.notification_is_relevant_v1(audit_log_id,recipient_user_id,entity_type,event_type)
  and private.has_organization_permission(organization_id,'notifications.view')
  and private.has_organization_permission(
    organization_id,'notifications.'||private.notification_scope_v1(module_key)||'.view')
  and (recipient_user_id is null or private.has_organization_permission(organization_id,'notifications.personal.view'))
  and (
    cardinality(visibility_permissions)=0
    or exists (select 1 from unnest(visibility_permissions) as permission_key
       where private.has_organization_permission(organization_id,permission_key))
  )
);

-- RPC unica para caixa e contador, com o mesmo criterio de entrega.
-- A coluna delivery_allowed separa "visualizar" de "receber".
create or replace function public.load_admin_notifications_v1(
  p_organization_id uuid,p_limit integer default 50
) returns jsonb language sql stable security invoker
set search_path='public','pg_temp' as $$
 with current_reads as materialized (
   select notification_id,read_at,dismissed_at from public.organization_notification_reads
   where user_id=(select auth.uid())
 ), visible_notifications as materialized (
   select n.*,
     private.notification_can_receive_v1(n.organization_id,n.module_key,n.recipient_user_id) as delivery_allowed
   from public.organization_notifications n
   where n.organization_id=p_organization_id
     and n.actor_user_id is distinct from (select auth.uid())
     and not exists (select 1 from current_reads x where x.notification_id=n.id and x.dismissed_at is not null)
 ), recent as (
   select * from visible_notifications
   order by created_at desc,id desc
   limit greatest(1,least(coalesce(p_limit,50),100))
 )
 select jsonb_build_object(
   'items',coalesce((
     select jsonb_agg(jsonb_build_object(
       'id',n.id,'organization_id',n.organization_id,
       'recipient_user_id',n.recipient_user_id,
       'audit_log_id',n.audit_log_id,'actor_user_id',n.actor_user_id,
       'actor_name_snapshot',n.actor_name_snapshot,'module_key',n.module_key,
       'event_type',n.event_type,'entity_type',n.entity_type,
       'entity_id',n.entity_id,'title',n.title,'message',n.message,
       'route',n.route,'metadata',n.metadata,'created_at',n.created_at,
       'read_at',r.read_at,'delivery_allowed',n.delivery_allowed)
       order by n.created_at desc,n.id desc)
     from recent n left join current_reads r on r.notification_id=n.id
   ),'[]'::jsonb),
   'unreadCount',(
     select count(*)::bigint from visible_notifications n
     where n.delivery_allowed and not exists(
       select 1 from current_reads r where r.notification_id=n.id and r.read_at is not null)
   )
 );
$$;

create or replace function public.count_unread_organization_notifications_v1(p_organization_id uuid)
returns bigint language sql stable security invoker set search_path='' as $$
 select count(*)::bigint from public.organization_notifications n
 where n.organization_id=p_organization_id
   and n.actor_user_id is distinct from (select auth.uid())
   and private.notification_can_receive_v1(n.organization_id,n.module_key,n.recipient_user_id)
   and not exists(select 1 from public.organization_notification_reads r
                  where r.notification_id=n.id and r.user_id=(select auth.uid())
                  and (r.dismissed_at is not null or r.read_at is not null));
$$;

revoke all on function public.load_admin_notifications_v1(uuid,integer) from public,anon;
grant execute on function public.load_admin_notifications_v1(uuid,integer) to authenticated;
revoke all on function public.count_unread_organization_notifications_v1(uuid) from public,anon;
grant execute on function public.count_unread_organization_notifications_v1(uuid) to authenticated;
commit;
