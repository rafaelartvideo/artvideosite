begin;

-- Evita executar consultas de vínculo SAC para cada linha avaliada pelo RLS.
-- O mapa é calculado uma vez por statement via InitPlan.
create or replace function private.sac_digital_access_map()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(
      l.organization_id::text,
      jsonb_build_object(
        'mode', l.access_mode,
        'operator_id', l.external_operator_id
      )
    ),
    '{}'::jsonb
  )
  from public.sac_digital_operator_links l
  where l.user_id = (select auth.uid());
$$;

revoke all on function private.sac_digital_access_map() from public, anon;
grant execute on function private.sac_digital_access_map() to authenticated;

alter policy sac_digital_protocols_select
on public.sac_digital_protocols
using (
  organization_id = any ((select private.sac_digital_readable_organizations())::uuid[])
  and (
    jsonb_extract_path_text(
      (select private.sac_digital_access_map()),
      organization_id::text,
      'mode'
    ) = 'manager'
    or (
      jsonb_extract_path_text(
        (select private.sac_digital_access_map()),
        organization_id::text,
        'mode'
      ) = 'operator'
      and (
        operator_id = jsonb_extract_path_text(
          (select private.sac_digital_access_map()),
          organization_id::text,
          'operator_id'
        )
        or (
          operator_id is null
          and closed_at is null
          and status in ('inbox','in_att')
        )
      )
    )
  )
);

alter policy sac_digital_outbound_starts_select
on public.sac_digital_outbound_starts
using (
  organization_id = any ((select private.sac_digital_readable_organizations())::uuid[])
  and (
    jsonb_extract_path_text(
      (select private.sac_digital_access_map()),
      organization_id::text,
      'mode'
    ) = 'manager'
    or (
      jsonb_extract_path_text(
        (select private.sac_digital_access_map()),
        organization_id::text,
        'mode'
      ) = 'operator'
      and sender_id = (select auth.uid())
    )
  )
);

create index if not exists sac_digital_protocols_org_last_idx
  on public.sac_digital_protocols
  (organization_id, last_message_at desc nulls last, updated_at desc);

create index if not exists sac_digital_protocols_org_operator_last_idx
  on public.sac_digital_protocols
  (organization_id, operator_id, last_message_at desc nulls last);

create index if not exists sac_digital_protocol_reads_lookup_idx
  on public.sac_digital_protocol_reads
  (organization_id, user_id, protocol_id, last_read_at);

-- O contador é um hot path. Valida usuário/permissão/perfil SAC uma vez e
-- executa a agregação sem reavaliar RLS de mensagens/protocolos por linha.
create or replace function public.get_sac_digital_unread_counts(p_organization_id uuid)
returns table(protocol_id uuid, unread_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_access_mode text;
  v_operator_id text;
begin
  if v_user_id is null then
    return;
  end if;

  if not private.has_effective_organization_permission(
    p_organization_id,
    'sac_digital.messages.view'
  ) then
    return;
  end if;

  select l.access_mode, l.external_operator_id
    into v_access_mode, v_operator_id
  from public.sac_digital_operator_links l
  where l.organization_id = p_organization_id
    and l.user_id = v_user_id
  limit 1;

  if v_access_mode is null then
    return;
  end if;

  return query
  select
    m.protocol_id,
    count(*)::bigint
  from public.sac_digital_messages m
  join public.sac_digital_protocols p
    on p.id = m.protocol_id
   and p.organization_id = m.organization_id
  left join public.sac_digital_protocol_reads r
    on r.organization_id = m.organization_id
   and r.protocol_id = m.protocol_id
   and r.user_id = v_user_id
  where m.organization_id = p_organization_id
    and m.direction = 'incoming'
    and (
      v_access_mode = 'manager'
      or (
        v_access_mode = 'operator'
        and v_operator_id is not null
        and (
          p.operator_id = v_operator_id
          or (
            p.operator_id is null
            and p.closed_at is null
            and p.status in ('inbox','in_att')
          )
        )
      )
    )
    and m.sent_at > coalesce(
      r.last_read_at,
      greatest(
        coalesce(p.opened_at, p.created_at),
        '2026-10-06 23:45:00+00'::timestamptz
      )
    )
  group by m.protocol_id
  order by max(m.sent_at) desc;
end;
$$;

revoke all on function public.get_sac_digital_unread_counts(uuid) from public, anon;
grant execute on function public.get_sac_digital_unread_counts(uuid) to authenticated;

commit;
