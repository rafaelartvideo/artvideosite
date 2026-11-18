begin;

-- Gestor + Operador becomes an independent and editable role; previously it
-- inherited manager OR operator. Preserve the effective configuration for
-- existing companies before switching the authorization engine.
alter table public.union_whatsapp_role_permissions
  drop constraint if exists union_whatsapp_role_permissions_staff_role_check;
alter table public.union_whatsapp_role_permissions
  add constraint union_whatsapp_role_permissions_staff_role_check
  check (staff_role in ('manager','operator','both'));

insert into public.union_whatsapp_role_permissions
  (organization_id,staff_role,capability,enabled,updated_at,updated_by)
select organizations.organization_id,'both',definitions.key,
       (coalesce(manager_permissions.enabled,definitions.manager_default)
        or coalesce(operator_permissions.enabled,definitions.operator_default)),
       now(),null
from (
  select distinct organization_id from public.union_whatsapp_operator_bindings
  union
  select distinct organization_id from public.union_whatsapp_role_permissions
) organizations
cross join public.union_whatsapp_permission_definitions definitions
left join public.union_whatsapp_role_permissions manager_permissions
  on manager_permissions.organization_id=organizations.organization_id
  and manager_permissions.staff_role='manager'
  and manager_permissions.capability=definitions.key
left join public.union_whatsapp_role_permissions operator_permissions
  on operator_permissions.organization_id=organizations.organization_id
  and operator_permissions.staff_role='operator'
  and operator_permissions.capability=definitions.key
on conflict (organization_id,staff_role,capability) do nothing;

-- This helper is used by RLS policies throughout the WhatsApp module.
-- Keep the same company, user, profile and CRM permission checks. Change only
-- the role lookup to exact match, never manager OR operator for "both".
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
   left join public.union_whatsapp_role_permissions combo
     on combo.organization_id=b.organization_id
       and combo.staff_role='both' and combo.capability=def.key
   where b.organization_id=p_organization
     and b.user_id=(select auth.uid()) and b.is_active=true
     and (
       (b.staff_role='manager' and coalesce(mgr.enabled,def.manager_default))
       or (b.staff_role='operator' and coalesce(opr.enabled,def.operator_default))
       or (b.staff_role='both' and coalesce(combo.enabled,def.manager_default or def.operator_default))
     )
 );
$allow$;

commit;
