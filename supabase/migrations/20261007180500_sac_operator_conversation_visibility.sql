begin;

create or replace function private.sac_digital_linked_operator_id(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select l.external_operator_id
  from public.sac_digital_operator_links l
  where l.organization_id = p_organization_id
    and l.user_id = (select auth.uid())
  limit 1;
$$;

revoke all on function private.sac_digital_linked_operator_id(uuid) from public, anon;
grant execute on function private.sac_digital_linked_operator_id(uuid) to authenticated;

-- Gestores continuam vendo toda a empresa. Demais usuários só enxergam
-- atendimentos do Operador SAC vinculado e a fila ainda sem operador.
alter policy sac_digital_protocols_select
on public.sac_digital_protocols
using (
  organization_id = any ((select private.sac_digital_readable_organizations())::uuid[])
  and (
    private.has_effective_organization_permission(
      organization_id,
      'sac_digital.settings.manage'
    )
    or (
      private.sac_digital_linked_operator_id(organization_id) is not null
      and (
        operator_id = private.sac_digital_linked_operator_id(organization_id)
        or (
          operator_id is null
          and closed_at is null
          and status in ('inbox', 'in_att')
        )
      )
    )
  )
);

-- Mensagens herdam exatamente a visibilidade do protocolo.
alter policy sac_digital_messages_select
on public.sac_digital_messages
using (
  organization_id = any ((select private.sac_digital_readable_organizations())::uuid[])
  and exists (
    select 1
    from public.sac_digital_protocols p
    where p.id = sac_digital_messages.protocol_id
      and p.organization_id = sac_digital_messages.organization_id
  )
);

-- Uma conversa inicial ainda sem protocolo só é visível ao autor, exceto Gestor.
alter policy sac_digital_outbound_starts_select
on public.sac_digital_outbound_starts
using (
  organization_id = any ((select private.sac_digital_readable_organizations())::uuid[])
  and (
    private.has_effective_organization_permission(
      organization_id,
      'sac_digital.settings.manage'
    )
    or sender_id = (select auth.uid())
  )
);

commit;
