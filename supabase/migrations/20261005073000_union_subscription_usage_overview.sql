-- Painel consolidado de assinaturas e consumo da Union.
-- Somente leitura/monitoramento; não aplica bloqueios.

create or replace function public.load_union_subscription_usage_overview_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_org record;
  v_usage jsonb;
  v_subscription_id uuid;
  v_addons_amount numeric := 0;
  v_addons_count integer := 0;
  v_database_bytes bigint := 0;
  v_database_measured_at timestamptz;
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('platform.billing.view') then
    raise exception 'Sem permissão para visualizar o painel de consumo.' using errcode='42501';
  end if;

  for v_org in
    select organization.id, organization.name, organization.status, organization.organization_type
    from public.organizations organization
    where organization.id <> public.platform_operator_organization_id()
    order by organization.name
  loop
    v_usage := public.load_organization_plan_usage_v7(v_org.id);
    v_subscription_id := nullif(v_usage -> 'subscription' ->> 'id', '')::uuid;

    if v_subscription_id is null then
      v_addons_amount := 0;
      v_addons_count := 0;
    else
      select
        coalesce(sum(subscription_addon.amount * subscription_addon.quantity)
          filter (where subscription_addon.status='active'), 0),
        count(*) filter (where subscription_addon.status='active')::integer
      into v_addons_amount, v_addons_count
      from public.platform_subscription_addons subscription_addon
      where subscription_addon.subscription_id = v_subscription_id;
    end if;

    select
      coalesce(snapshot.allocated_bytes_estimate, 0),
      snapshot.measured_at
    into v_database_bytes, v_database_measured_at
    from public.organization_database_usage_snapshots snapshot
    where snapshot.organization_id = v_org.id;

    if not found then
      v_database_bytes := 0;
      v_database_measured_at := null;
    end if;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'organization_id', v_org.id,
      'organization_name', v_org.name,
      'organization_status', v_org.status,
      'organization_type', v_org.organization_type,
      'subscription', v_usage -> 'subscription',
      'limits', coalesce(v_usage -> 'limits', '{}'::jsonb),
      'usage', coalesce(v_usage -> 'usage', '{}'::jsonb),
      'usage_sources', coalesce(v_usage -> 'usage_sources', '{}'::jsonb),
      'monitoring', coalesce(v_usage -> 'monitoring', jsonb_build_object(
        'mode','monitor',
        'warning_percent',80,
        'critical_percent',90
      )),
      'addons_count', v_addons_count,
      'addons_amount', v_addons_amount,
      'contracted_monthly_amount',
        coalesce((v_usage -> 'subscription' ->> 'net_amount')::numeric, 0) + v_addons_amount,
      'database_bytes_estimate', v_database_bytes,
      'database_measured_at', v_database_measured_at
    ));
  end loop;

  return jsonb_build_object('rows', v_rows);
end;
$$;

revoke all on function public.load_union_subscription_usage_overview_v1() from public, anon;
grant execute on function public.load_union_subscription_usage_overview_v1() to authenticated;

notify pgrst,'reload schema';
