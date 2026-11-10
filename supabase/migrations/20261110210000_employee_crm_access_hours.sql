-- Janela semanal de acesso ao CRM, independente do expediente técnico.
-- Quem não tem escala ativa mantém o acesso anterior (retrocompatibilidade).
create table if not exists public.employee_crm_access_hours (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null,
  enabled boolean not null default false,
  timezone text not null default 'America/Sao_Paulo',
  days jsonb not null default '[]'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (organization_id, employee_id),
  constraint employee_crm_access_hours_employee_fkey foreign key (employee_id)
    references public.employees(id) on delete cascade,
  constraint employee_crm_access_hours_timezone_check check (timezone='America/Sao_Paulo')
);
create index if not exists employee_crm_access_hours_employee_idx
  on public.employee_crm_access_hours(employee_id);
alter table public.employee_crm_access_hours enable row level security;
-- Nenhuma leitura/escrita direta à tabela; a administração ocorre exclusivamente pelas RPCs.
revoke all on public.employee_crm_access_hours from public, anon, authenticated;

create or replace function private.validate_employee_crm_access_days(p_days jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare
  v_day jsonb;
  v_interval jsonb;
  v_weekday integer;
  v_seen int[] := '{}';
  v_start int;
  v_end int;
  v_last_end int;
  v_hours text;
  v_minutes text;
  v_start_text text;
  v_end_text text;
begin
  if jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days)>7 then return false; end if;
  for v_day in select value from jsonb_array_elements(p_days) loop
    if jsonb_typeof(v_day)<>'object'
      or jsonb_typeof(v_day->'weekday')<>'number'
      or (v_day->>'weekday') !~ '^[0-6]$'
      or jsonb_typeof(v_day->'intervals') <> 'array'
    then return false; end if;
    v_weekday:=(v_day->>'weekday')::integer;
    if v_weekday=any(v_seen) then return false; end if;
    v_seen:=array_append(v_seen,v_weekday);
    if jsonb_array_length(v_day->'intervals')>12 then return false; end if;
    v_last_end:=-1;
    for v_interval in
      select value from jsonb_array_elements(v_day->'intervals')
      order by value->>'start',value->>'end'
    loop
      if jsonb_typeof(v_interval)<>'object' then return false; end if;
      v_start_text:=v_interval->>'start';
      v_end_text:=v_interval->>'end';
      if coalesce(v_start_text,'') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or coalesce(v_end_text,'') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      then return false; end if;
      v_start:=split_part(v_start_text,':',1)::integer*60+split_part(v_start_text,':',2)::integer;
      v_end:=split_part(v_end_text,':',1)::integer*60+split_part(v_end_text,':',2)::integer;
      if v_start>=v_end or v_start<v_last_end then return false; end if;
      v_last_end:=v_end;
    end loop;
  end loop;
  return true;
exception when others then return false;
end; $$;

alter table public.employee_crm_access_hours
  drop constraint if exists employee_crm_access_hours_days_valid;
alter table public.employee_crm_access_hours
  add constraint employee_crm_access_hours_days_valid
  check (private.validate_employee_crm_access_days(days));

-- Não depende das funções de permissão: evita recursão ao controlar as permissões.
create or replace function private.employee_crm_access_now(
  p_organization_id uuid, p_user_id uuid default auth.uid()
)
returns boolean language sql stable security definer set search_path='' as $$
  select p_user_id is not null and not exists (
    select 1
    from public.employees employee
    join public.employee_crm_access_hours config
      on config.organization_id=employee.organization_id
     and config.employee_id=employee.id and config.enabled
    where employee.organization_id=p_organization_id
      and employee.profile_id=p_user_id
      and not exists (
        select 1 from jsonb_array_elements(config.days) day
        cross join lateral jsonb_array_elements(day->'intervals') range
        where (day->>'weekday')::int =
          extract(dow from (now() at time zone config.timezone))::int
          and (now() at time zone config.timezone)::time
            >= (range->>'start')::time
          and (now() at time zone config.timezone)::time
            < (range->>'end')::time
      )
  );
$$;

-- Aplica a escala nas permissões efetivas, inclusive em RPCs e RLS que as consultam.
create or replace function private.has_organization_permission(p_organization_id uuid,p_permission_key text)
returns boolean language sql stable security definer set search_path='' as $$
  with permission_context as materialized (
    select auth.uid() as user_id, permission.id as permission_id
    from public.permissions permission
    where permission.key=p_permission_key limit 1
  )
  select private.employee_crm_access_now(p_organization_id)
    and exists (
      select 1 from public.organization_members member
      join public.organizations organization on organization.id=member.organization_id
      cross join permission_context context
      where member.organization_id=p_organization_id
        and member.user_id=context.user_id
        and member.status='active'
        and organization.status='active'
        and not exists (
          select 1 from public.user_permission_overrides denied
          where denied.organization_id=member.organization_id
            and denied.user_id=member.user_id
            and denied.permission_id=context.permission_id and denied.is_allowed=false
        )
        and (
          exists (
            select 1 from public.role_permissions role_permission
            where role_permission.role_id=member.role_id
              and role_permission.permission_id=context.permission_id
          )
          or exists (
            select 1 from public.user_permission_overrides override_permission
            where override_permission.organization_id=member.organization_id
              and override_permission.user_id=member.user_id
              and override_permission.permission_id=context.permission_id
              and override_permission.is_allowed=true
          )
        )
    );
$$;

create or replace function private.has_effective_organization_permission(p_organization_id uuid,p_permission_key text)
returns boolean language sql stable security definer set search_path='' as $$
  select private.employee_crm_access_now(p_organization_id)
   and not exists (
     select 1 from public.user_permission_overrides denied
     join public.permissions p on p.id=denied.permission_id
     where denied.organization_id=p_organization_id
       and denied.user_id=auth.uid() and denied.is_allowed=false
       and p.key=p_permission_key
   )
   and (
     private.has_organization_permission(p_organization_id,p_permission_key)
     or (
       exists (
         select 1 from public.organizations target
         where target.id=p_organization_id and target.status='active'
       )
       and private.has_platform_permission(p_permission_key)
     )
   );
$$;

-- Consultar e editar por empresa, com permissão de funcionários.
create or replace function public.get_employee_crm_access_hours_v1(
  p_organization_id uuid, p_employee_id uuid
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_row public.employee_crm_access_hours%rowtype;
begin
  if auth.uid() is null
     or not private.has_effective_organization_permission(p_organization_id,'employees.view')
     or not exists (select 1 from public.employees
                    where id=p_employee_id and organization_id=p_organization_id)
  then raise exception 'Sem permissão para consultar a escala do funcionário.' using errcode='42501'; end if;
  select * into v_row from public.employee_crm_access_hours
    where organization_id=p_organization_id and employee_id=p_employee_id;
  return jsonb_build_object(
    'enabled',coalesce(v_row.enabled,false),
    'timezone','America/Sao_Paulo',
    'days',coalesce(v_row.days,'[]'::jsonb)
  );
end $$;

create or replace function public.save_employee_crm_access_hours_v1(
  p_organization_id uuid,p_employee_id uuid,p_enabled boolean,p_days jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_payload jsonb;
begin
  if auth.uid() is null or not private.has_effective_organization_permission(p_organization_id,'employees.edit') then
    raise exception 'Sem permissão para configurar o horário de acesso.' using errcode='42501';
  end if;
  if not exists (select 1 from public.employees e where e.id=p_employee_id
    and e.organization_id=p_organization_id) then
    raise exception 'Funcionário não pertence à empresa selecionada.' using errcode='23503';
  end if;
  v_payload:=coalesce(p_days,'[]'::jsonb);
  if not private.validate_employee_crm_access_days(v_payload) then
    raise exception 'Os intervalos precisam ser válidos, sem sobreposição no mesmo dia.' using errcode='23514';
  end if;
  insert into public.employee_crm_access_hours (organization_id,employee_id,enabled,days,updated_by,updated_at)
  values(p_organization_id,p_employee_id,coalesce(p_enabled,false),v_payload,auth.uid(),now())
  on conflict(organization_id,employee_id) do update set
    enabled=excluded.enabled,
    days=excluded.days,
    updated_by=excluded.updated_by,
    updated_at=excluded.updated_at;
  return jsonb_build_object('enabled',coalesce(p_enabled,false),'days',v_payload);
end $$;

create or replace function public.list_employee_crm_access_sources_v1(p_organization_id uuid)
returns table(employee_id uuid,full_name text,enabled boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null
    or not private.has_effective_organization_permission(p_organization_id,'employees.view') then
    raise exception 'Sem permissão para consultar os funcionários.' using errcode='42501';
  end if;
  return query select e.id,e.full_name,coalesce(h.enabled,false)
    from public.employees e
    left join public.employee_crm_access_hours h
      on h.organization_id=e.organization_id and h.employee_id=e.id
    where e.organization_id=p_organization_id and e.is_active
    order by e.full_name;
end $$;

create or replace function public.check_my_employee_crm_access_hours_v1(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_restricted boolean;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;
  select exists (
    select 1 from public.employee_crm_access_hours h
    join public.employees e on e.organization_id=h.organization_id and e.id=h.employee_id
    where h.organization_id=p_organization_id and e.profile_id=auth.uid()
      and h.enabled
  ) into v_restricted;
  if not private.is_organization_member(p_organization_id) then
    return jsonb_build_object('allowed',false,'restricted',true,'timezone','America/Sao_Paulo');
  end if;
  return jsonb_build_object(
    'allowed',private.employee_crm_access_now(p_organization_id),
    'restricted',v_restricted,'timezone','America/Sao_Paulo');
end $$;

revoke all on function public.get_employee_crm_access_hours_v1(uuid,uuid) from public,anon;
revoke all on function public.save_employee_crm_access_hours_v1(uuid,uuid,boolean,jsonb) from public,anon;
revoke all on function public.list_employee_crm_access_sources_v1(uuid) from public,anon;
revoke all on function public.check_my_employee_crm_access_hours_v1(uuid) from public,anon;
grant execute on function public.get_employee_crm_access_hours_v1(uuid,uuid) to authenticated;
grant execute on function public.save_employee_crm_access_hours_v1(uuid,uuid,boolean,jsonb) to authenticated;
grant execute on function public.list_employee_crm_access_sources_v1(uuid) to authenticated;
grant execute on function public.check_my_employee_crm_access_hours_v1(uuid) to authenticated;
