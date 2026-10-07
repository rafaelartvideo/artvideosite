begin;

alter table public.sac_digital_operator_links
  add column if not exists access_mode text not null default 'operator';

alter table public.sac_digital_operator_links
  drop constraint if exists sac_digital_operator_links_access_mode_check;

alter table public.sac_digital_operator_links
  add constraint sac_digital_operator_links_access_mode_check
  check (access_mode in ('manager','operator'));

alter table public.sac_digital_operator_links
  alter column external_operator_id drop not null,
  alter column operator_name drop not null;

update public.sac_digital_operator_links
set access_mode='operator'
where access_mode is null or access_mode not in ('manager','operator');

create or replace function private.sac_digital_access_mode(p_organization_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select l.access_mode
  from public.sac_digital_operator_links l
  where l.organization_id = p_organization_id
    and l.user_id = (select auth.uid())
  limit 1;
$$;
revoke all on function private.sac_digital_access_mode(uuid) from public, anon;
grant execute on function private.sac_digital_access_mode(uuid) to authenticated;

create or replace function private.sac_digital_linked_operator_id(p_organization_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select l.external_operator_id
  from public.sac_digital_operator_links l
  where l.organization_id = p_organization_id
    and l.user_id = (select auth.uid())
    and l.access_mode = 'operator'
  limit 1;
$$;
revoke all on function private.sac_digital_linked_operator_id(uuid) from public, anon;
grant execute on function private.sac_digital_linked_operator_id(uuid) to authenticated;

alter policy sac_digital_protocols_select on public.sac_digital_protocols
using (
  organization_id = any ((select private.sac_digital_readable_organizations())::uuid[])
  and (
    private.sac_digital_access_mode(organization_id) = 'manager'
    or (
      private.sac_digital_access_mode(organization_id) = 'operator'
      and private.sac_digital_linked_operator_id(organization_id) is not null
      and (
        operator_id = private.sac_digital_linked_operator_id(organization_id)
        or (operator_id is null and closed_at is null and status in ('inbox','in_att'))
      )
    )
  )
);

alter policy sac_digital_messages_select on public.sac_digital_messages
using (
  organization_id = any ((select private.sac_digital_readable_organizations())::uuid[])
  and exists (
    select 1 from public.sac_digital_protocols p
    where p.id = sac_digital_messages.protocol_id
      and p.organization_id = sac_digital_messages.organization_id
  )
);

alter policy sac_digital_outbound_starts_select on public.sac_digital_outbound_starts
using (
  organization_id = any ((select private.sac_digital_readable_organizations())::uuid[])
  and (
    private.sac_digital_access_mode(organization_id) = 'manager'
    or (
      private.sac_digital_access_mode(organization_id) = 'operator'
      and sender_id = (select auth.uid())
    )
  )
);

comment on column public.sac_digital_operator_links.access_mode is
'Perfil SAC do usuário da Union: manager usa a sessão Gestor /client e vê todas as conversas; operator usa /operator e vê fila + próprios atendimentos.';

commit;
