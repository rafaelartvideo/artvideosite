begin;

insert into public.platform_billing_limit_definitions(key,label,description,unit,sort_order)
values ('pbx_recording_storage_bytes','Armazenamento de gravações PABX','Espaço previsto para gravações de chamadas do PABX.','bytes',115)
on conflict (key) do update set label=excluded.label, description=excluded.description, unit=excluded.unit, sort_order=excluded.sort_order, is_active=true, updated_at=now();

update public.platform_billing_addons
set limit_deltas = limit_deltas || jsonb_build_object('pbx_recording_storage_bytes',10737418240::numeric)
where code='pbx' and not (limit_deltas ? 'pbx_recording_storage_bytes');

create or replace function public.save_union_external_usage_v1(p_organization_id uuid,p_pbx_extensions numeric default null,p_pbx_recording_bytes numeric default null,p_ai_credits numeric default null,p_ai_requests_30d numeric default null)
returns void language plpgsql security definer set search_path to '' as $$
declare v_key text; v_value numeric;
begin
  if (select auth.uid()) is null or not private.has_platform_permission('platform.billing.manage') then raise exception 'Sem permissão.' using errcode='42501'; end if;
  for v_key,v_value in select * from (values ('pbx_extensions',p_pbx_extensions),('pbx_recording_bytes',p_pbx_recording_bytes),('ai_credits',p_ai_credits),('ai_requests_30d',p_ai_requests_30d)) v(k,n) loop
    if v_value is not null then
      if v_value < 0 then raise exception 'Consumo inválido.' using errcode='22023'; end if;
      insert into public.organization_usage_counters(organization_id,usage_key,usage_value,source,measured_at,updated_by,updated_at)
      values(p_organization_id,v_key,v_value,'manual',now(),(select auth.uid()),now())
      on conflict(organization_id,usage_key) do update set usage_value=excluded.usage_value,source='manual',measured_at=excluded.measured_at,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
    end if;
  end loop;
end; $$;

revoke all on function public.save_union_external_usage_v1(uuid,numeric,numeric,numeric,numeric) from public,anon;
grant execute on function public.save_union_external_usage_v1(uuid,numeric,numeric,numeric,numeric) to authenticated;

create or replace function public.load_organization_plan_usage_v6(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_result jsonb; v_usage jsonb; v_sources jsonb; v_counter record;
begin
  v_result:=public.load_organization_plan_usage_v5(p_organization_id);
  v_usage:=coalesce(v_result->'usage','{}'::jsonb);
  v_sources:=coalesce(v_result->'usage_sources','{}'::jsonb);
  for v_counter in select usage_key,usage_value,source from public.organization_usage_counters where organization_id=p_organization_id and usage_key in ('pbx_extensions','pbx_recording_bytes','ai_credits','ai_requests_30d') loop
    v_usage:=v_usage||jsonb_build_object(v_counter.usage_key,v_counter.usage_value);
    v_sources:=v_sources||jsonb_build_object(v_counter.usage_key,v_counter.source);
  end loop;
  return jsonb_set(jsonb_set(v_result,'{usage}',v_usage,true),'{usage_sources}',v_sources,true);
end; $$;

revoke all on function public.load_organization_plan_usage_v6(uuid) from public,anon;
grant execute on function public.load_organization_plan_usage_v6(uuid) to authenticated;
notify pgrst,'reload schema';
commit;