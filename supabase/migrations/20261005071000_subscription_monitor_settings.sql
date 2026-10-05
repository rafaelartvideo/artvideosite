-- Regras globais de monitoramento de consumo.
-- O modo permanece em "monitor": nenhum limite bloqueia operações.

begin;

create table if not exists public.platform_billing_settings (
  singleton boolean primary key default true check (singleton),
  enforcement_mode text not null default 'monitor'
    check (enforcement_mode in ('monitor','warn','enforce')),
  warning_percent numeric(5,2) not null default 80
    check (warning_percent >= 0 and warning_percent <= 100),
  critical_percent numeric(5,2) not null default 90
    check (critical_percent >= 0 and critical_percent <= 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  check (warning_percent <= critical_percent)
);

alter table public.platform_billing_settings enable row level security;
revoke all on table public.platform_billing_settings from anon, authenticated;

insert into public.platform_billing_settings(singleton,enforcement_mode,warning_percent,critical_percent)
values(true,'monitor',80,90)
on conflict(singleton) do nothing;

create or replace function public.load_union_billing_settings_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_settings public.platform_billing_settings%rowtype;
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('platform.billing.view') then
    raise exception 'Sem permissão para visualizar as regras comerciais.' using errcode='42501';
  end if;

  select * into v_settings
  from public.platform_billing_settings
  where singleton=true;

  return jsonb_build_object(
    'enforcement_mode',coalesce(v_settings.enforcement_mode,'monitor'),
    'warning_percent',coalesce(v_settings.warning_percent,80),
    'critical_percent',coalesce(v_settings.critical_percent,90),
    'updated_at',v_settings.updated_at
  );
end;
$$;

revoke all on function public.load_union_billing_settings_v1() from public,anon;
grant execute on function public.load_union_billing_settings_v1() to authenticated;

create or replace function public.save_union_billing_thresholds_v1(
  p_warning_percent numeric,
  p_critical_percent numeric
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('platform.billing.manage') then
    raise exception 'Sem permissão para alterar as regras comerciais.' using errcode='42501';
  end if;

  if p_warning_percent < 0
     or p_critical_percent > 100
     or p_warning_percent > p_critical_percent then
    raise exception 'Faixas de alerta inválidas.' using errcode='22023';
  end if;

  insert into public.platform_billing_settings(
    singleton,enforcement_mode,warning_percent,critical_percent,updated_at,updated_by
  )
  values(true,'monitor',p_warning_percent,p_critical_percent,now(),(select auth.uid()))
  on conflict(singleton) do update set
    enforcement_mode='monitor',
    warning_percent=excluded.warning_percent,
    critical_percent=excluded.critical_percent,
    updated_at=excluded.updated_at,
    updated_by=excluded.updated_by;
end;
$$;

revoke all on function public.save_union_billing_thresholds_v1(numeric,numeric) from public,anon;
grant execute on function public.save_union_billing_thresholds_v1(numeric,numeric) to authenticated;

notify pgrst,'reload schema';

commit;
