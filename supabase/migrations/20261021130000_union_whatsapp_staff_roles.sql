begin;

-- Os perfis do atendimento são independentes do cargo geral no CRM.
alter table public.union_whatsapp_operator_bindings
  add column if not exists staff_role text not null default 'operator';
alter table public.union_whatsapp_operator_bindings
  drop constraint if exists union_whatsapp_operator_bindings_staff_role_check;
alter table public.union_whatsapp_operator_bindings
  add constraint union_whatsapp_operator_bindings_staff_role_check
    check (staff_role in ('manager','operator','both'));

-- Preserva a capacidade de atendimento e de supervisão de quem já a possuía.
update public.union_whatsapp_operator_bindings binding
set staff_role = 'both'
from public.organization_members member
where member.organization_id = binding.organization_id
  and member.user_id = binding.user_id
  and member.status = 'active'
  and (
    member.is_owner = true or exists (
      select 1 from public.role_permissions rp
      join public.permissions p on p.id = rp.permission_id
      where rp.role_id = member.role_id and p.key = 'whatsapp.inbox.manage'
    )
  )
  and binding.staff_role = 'operator';

-- Consulta segura do perfil de atendimento autenticado, sem exposição de dados
-- de outros funcionários e sem confiança em metadados editáveis do JWT.
create or replace function private.union_whatsapp_staff_role(p_organization uuid)
returns text language sql stable security definer
set search_path = 'pg_catalog','public','private'
as $role$
  select binding.staff_role
  from public.union_whatsapp_operator_bindings binding
  join public.organization_members member
    on member.organization_id = binding.organization_id and member.user_id = binding.user_id
  join public.profiles profile on profile.id = binding.user_id
  where binding.organization_id = p_organization
    and binding.user_id = (select auth.uid())
    and binding.is_active = true
    and member.status = 'active'
    and profile.is_active = true
  limit 1;
$role$;
revoke all on function private.union_whatsapp_staff_role(uuid) from public, anon;
grant execute on function private.union_whatsapp_staff_role(uuid) to authenticated;

-- Somente gestores explícitos administram vínculos, filas e equipe.
drop policy if exists union_whatsapp_operator_bindings_read on public.union_whatsapp_operator_bindings;
create policy union_whatsapp_operator_bindings_read
on public.union_whatsapp_operator_bindings for select to authenticated
using (
  user_id = (select auth.uid())
  or private.union_whatsapp_staff_role(organization_id) in ('manager','both')
);

drop policy if exists union_whatsapp_department_members_read on public.union_whatsapp_department_members;
create policy union_whatsapp_department_members_read
on public.union_whatsapp_department_members for select to authenticated
using (
  user_id = (select auth.uid())
  or private.union_whatsapp_staff_role(organization_id) in ('manager','both')
);

-- Um Operador só lê fila autorizada + atendimentos próprios.
-- Gestores explícitos supervisionam tudo, mas não recebem permissão de enviar
-- mensagens apenas por serem gestores.
drop policy if exists union_whatsapp_conversations_read on public.union_whatsapp_conversations;
create policy union_whatsapp_conversations_read
on public.union_whatsapp_conversations for select to authenticated
using (
  private.has_effective_organization_permission(organization_id,'whatsapp.inbox.view')
  and (
    private.union_whatsapp_staff_role(organization_id) in ('manager','both')
    or (
      private.union_whatsapp_staff_role(organization_id) in ('operator','both')
      and (
        assigned_to = (select auth.uid())
        or (
          status = 'waiting' and assigned_to is null
          and (
            department_id is null or exists (
              select 1 from public.union_whatsapp_department_members dm
              where dm.organization_id = union_whatsapp_conversations.organization_id
                and dm.department_id = union_whatsapp_conversations.department_id
                and dm.user_id = (select auth.uid())
            )
          )
        )
      )
    )
  )
  and private.union_whatsapp_active_account_visible(
    organization_id,channel_id,account_phone
  )
);

commit;
