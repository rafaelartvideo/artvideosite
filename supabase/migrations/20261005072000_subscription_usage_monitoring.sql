-- Expõe as faixas globais de monitoramento junto ao consumo da empresa.
-- Continua sem qualquer enforcement.

begin;

create or replace function public.load_organization_plan_usage_v7(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_result jsonb;
  v_settings public.platform_billing_settings%rowtype;
begin
  v_result:=public.load_organization_plan_usage_v6(p_organization_id);

  select * into v_settings
  from public.platform_billing_settings
  where singleton=true;

  return v_result || jsonb_build_object(
    'monitoring',jsonb_build_object(
      'mode',coalesce(v_settings.enforcement_mode,'monitor'),
      'warning_percent',coalesce(v_settings.warning_percent,80),
      'critical_percent',coalesce(v_settings.critical_percent,90)
    )
  );
end;
$$;

revoke all on function public.load_organization_plan_usage_v7(uuid) from public,anon;
grant execute on function public.load_organization_plan_usage_v7(uuid) to authenticated;

notify pgrst,'reload schema';

commit;
