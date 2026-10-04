-- Origem dos contadores e sincronização segura do uso da Fila.
-- Continua sem enforcement.

begin;

alter table public.organization_usage_counters
  add column if not exists source text not null default 'manual'
  check (source in ('manual','integration','measured','configured'));

create or replace function public.sync_union_queue_usage_v1(
  p_organization_id uuid,
  p_usage jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_key text;
  v_value numeric;
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('platform.billing.manage') then
    raise exception 'Sem permissão para sincronizar consumo da fila.' using errcode = '42501';
  end if;

  if p_organization_id is null
     or not exists (
       select 1 from public.queue_integration_settings settings
       where settings.organization_id = p_organization_id
         and settings.enabled
     ) then
    raise exception 'Integração da fila não está ativa para esta empresa.' using errcode = '22023';
  end if;

  for v_key, v_value in
    select *
    from (
      values
        ('queue_units', greatest(coalesce((p_usage ->> 'queue_units')::numeric, 0), 0)),
        ('queue_attendants', greatest(coalesce((p_usage ->> 'active_attendants')::numeric, 0), 0)),
        ('queue_ticket_types', greatest(coalesce((p_usage ->> 'active_ticket_types')::numeric, 0), 0)),
        ('queue_active_media', greatest(coalesce((p_usage ->> 'active_media')::numeric, 0), 0)),
        ('queue_tickets_total', greatest(coalesce((p_usage ->> 'tickets_total')::numeric, 0), 0)),
        ('queue_tickets_today', greatest(coalesce((p_usage ->> 'tickets_today')::numeric, 0), 0)),
        ('queue_tickets_30d', greatest(coalesce((p_usage ->> 'tickets_30d')::numeric, 0), 0)),
        ('queue_calls_30d', greatest(coalesce((p_usage ->> 'calls_30d')::numeric, 0), 0)),
        ('queue_database_bytes', greatest(coalesce((p_usage ->> 'database_bytes')::numeric, 0), 0)),
        ('queue_storage_bytes', greatest(coalesce((p_usage ->> 'storage_bytes')::numeric, 0), 0)),
        ('queue_storage_objects', greatest(coalesce((p_usage ->> 'storage_objects')::numeric, 0), 0))
    ) usage_values(usage_key, usage_value)
  loop
    insert into public.organization_usage_counters (
      organization_id, usage_key, usage_value, source, measured_at, updated_by, updated_at
    )
    values (
      p_organization_id, v_key, v_value, 'integration', now(), (select auth.uid()), now()
    )
    on conflict (organization_id, usage_key) do update set
      usage_value = excluded.usage_value,
      source = 'integration',
      measured_at = excluded.measured_at,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;
  end loop;

  insert into public.organization_audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  values (
    p_organization_id,
    (select auth.uid()),
    'platform_billing.queue_usage.synced',
    'organization',
    p_organization_id::text,
    jsonb_build_object(
      'queue_units', coalesce((p_usage ->> 'queue_units')::numeric, 0),
      'active_attendants', coalesce((p_usage ->> 'active_attendants')::numeric, 0),
      'tickets_30d', coalesce((p_usage ->> 'tickets_30d')::numeric, 0),
      'database_bytes', coalesce((p_usage ->> 'database_bytes')::numeric, 0)
    )
  );
end;
$$;

revoke all on function public.sync_union_queue_usage_v1(uuid, jsonb) from public, anon;
grant execute on function public.sync_union_queue_usage_v1(uuid, jsonb) to authenticated;

create or replace function public.load_organization_plan_usage_v4(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_result jsonb;
  v_usage jsonb;
  v_sources jsonb;
  v_counter record;
begin
  v_result := public.load_organization_plan_usage_v3(p_organization_id);
  v_usage := coalesce(v_result -> 'usage', '{}'::jsonb);
  v_sources := coalesce(v_result -> 'usage_sources', '{}'::jsonb);

  for v_counter in
    select usage_key, usage_value, source
    from public.organization_usage_counters
    where organization_id = p_organization_id
      and usage_key in (
        'pdv_terminals',
        'queue_units','queue_attendants','queue_ticket_types','queue_active_media',
        'queue_tickets_total','queue_tickets_today','queue_tickets_30d','queue_calls_30d',
        'queue_database_bytes','queue_storage_bytes','queue_storage_objects',
        'pbx_extensions','ai_credits'
      )
  loop
    v_usage := v_usage || jsonb_build_object(v_counter.usage_key, v_counter.usage_value);
    v_sources := v_sources || jsonb_build_object(v_counter.usage_key, v_counter.source);
  end loop;

  return jsonb_set(
    jsonb_set(v_result, '{usage}', v_usage, true),
    '{usage_sources}', v_sources,
    true
  );
end;
$$;

revoke all on function public.load_organization_plan_usage_v4(uuid) from public, anon;
grant execute on function public.load_organization_plan_usage_v4(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
