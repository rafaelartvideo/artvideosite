begin;

-- Separa criar/editar contato e nova conversa pelo botão Novo do
-- início de atendimento pela OS/Cadastros. Sem consultar logs ou mídias.
insert into public.union_whatsapp_permission_definitions
  (key,label,category,manager_default,operator_default,sort_order)
values
  ('create_contacts','Criar contatos','Administração',true,true,19),
  ('start_new_conversation','Iniciar conversa pelo botão Novo','Conversas',false,true,20)
on conflict (key) do update set
  label=excluded.label,
  category=excluded.category,
  manager_default=excluded.manager_default,
  operator_default=excluded.operator_default,
  sort_order=excluded.sort_order;

update public.union_whatsapp_permission_definitions
set label='Editar contatos'
where key='manage_contacts';

update public.union_whatsapp_permission_definitions
set label='Iniciar atendimentos pela OS e Cadastros'
where key='start';

-- Preserva decisões anteriores: perfis que não podiam gerenciar contatos
-- também não ganham criar contatos; bloqueio anterior de iniciar conversas
-- continua valendo inicialmente para o botão Novo, mas agora é independente.
insert into public.union_whatsapp_role_permissions
  (organization_id,staff_role,capability,enabled,updated_at,updated_by)
select organization_id,staff_role,'create_contacts',enabled,updated_at,updated_by
from public.union_whatsapp_role_permissions
where capability='manage_contacts'
on conflict (organization_id,staff_role,capability) do nothing;

insert into public.union_whatsapp_role_permissions
  (organization_id,staff_role,capability,enabled,updated_at,updated_by)
select organization_id,staff_role,'start_new_conversation',enabled,updated_at,updated_by
from public.union_whatsapp_role_permissions
where capability='start'
on conflict (organization_id,staff_role,capability) do nothing;

-- O motor privado segue exigindo whatsapp.inbox.send para criar uma
-- conversa pelo botão Novo. Não libera operações por falta de CRM send.
create or replace function private.union_whatsapp_allowed(
  p_organization uuid,p_capability text
) returns boolean language sql stable security definer
set search_path to 'pg_catalog','public','private'
as $allow$
 select
 private.has_effective_organization_permission(p_organization,'whatsapp.inbox.view')
 and (p_capability not in ('assume','start','start_new_conversation','send')
      or private.has_effective_organization_permission(p_organization,'whatsapp.inbox.send'))
 and exists (
   select 1
   from public.union_whatsapp_operator_bindings b
   join public.organization_members m
     on m.organization_id=b.organization_id and m.user_id=b.user_id and m.status='active'
   join public.profiles prof on prof.id=b.user_id and prof.is_active=true
   join public.union_whatsapp_permission_definitions def on def.key=p_capability
   left join public.union_whatsapp_role_permissions mgr
     on mgr.organization_id=b.organization_id
       and mgr.staff_role='manager' and mgr.capability=def.key
   left join public.union_whatsapp_role_permissions opr
     on opr.organization_id=b.organization_id
       and opr.staff_role='operator' and opr.capability=def.key
   where b.organization_id=p_organization
     and b.user_id=(select auth.uid()) and b.is_active=true
     and (
        (b.staff_role in ('manager','both') and coalesce(mgr.enabled,def.manager_default))
        or
        (b.staff_role in ('operator','both') and coalesce(opr.enabled,def.operator_default))
     )
 );
$allow$;

commit;
