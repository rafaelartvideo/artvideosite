-- O cadastro de funcionários é unificado em entities.
-- Escalas ficam vinculadas à entidade (inclusive cadastros sem employee legado).
alter table public.employee_crm_access_hours
  drop constraint if exists employee_crm_access_hours_pkey;
alter table public.employee_crm_access_hours
  add column if not exists entity_id uuid;
update public.employee_crm_access_hours h
set entity_id=e.id
from public.entities e
where e.organization_id=h.organization_id and e.legacy_employee_id=h.employee_id
  and h.entity_id is null;
alter table public.employee_crm_access_hours
  alter column employee_id drop not null;
alter table public.employee_crm_access_hours
  alter column entity_id set not null;
alter table public.employee_crm_access_hours
  add constraint employee_crm_access_hours_pkey primary key (organization_id,entity_id);
alter table public.employee_crm_access_hours
  add constraint employee_crm_access_hours_entity_fkey foreign key (entity_id)
  references public.entities(id) on delete cascade;
create index if not exists employee_crm_access_hours_org_entity_idx
  on public.employee_crm_access_hours(organization_id,entity_id);

create or replace function private.employee_crm_access_now(
  p_organization_id uuid, p_user_id uuid default auth.uid()
)
returns boolean language sql stable security definer set search_path='' as $$
  select p_user_id is not null and not exists (
    select 1
    from public.employee_crm_access_hours config
    join public.entities entity
      on entity.organization_id=config.organization_id and entity.id=config.entity_id
    join public.entity_roles er
      on er.entity_id=entity.id and er.role='employee' and er.is_active
    left join public.entity_employee_details detail on detail.entity_id=entity.id
    left join public.employees legacy
      on legacy.id=entity.legacy_employee_id and legacy.organization_id=entity.organization_id
    where config.organization_id=p_organization_id
      and config.enabled
      and (detail.profile_id=p_user_id or legacy.profile_id=p_user_id)
      and not exists (
        select 1 from jsonb_array_elements(config.days) day
        cross join lateral jsonb_array_elements(day->'intervals') range
        where (day->>'weekday')::int =
          extract(dow from (now() at time zone config.timezone))::int
          and (now() at time zone config.timezone)::time >= (range->>'start')::time
          and (now() at time zone config.timezone)::time < (range->>'end')::time
      )
  );
$$;

create or replace function public.get_employee_crm_access_hours_v2(
  p_organization_id uuid, p_entity_id uuid
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_row public.employee_crm_access_hours%rowtype;
begin
  if auth.uid() is null
     or not private.has_effective_organization_permission(p_organization_id,'employees.view')
     or not exists (
       select 1 from public.entities e
       join public.entity_roles er on er.entity_id=e.id and er.role='employee' and er.is_active
       where e.id=p_entity_id and e.organization_id=p_organization_id
     )
  then raise exception 'Sem permissão para consultar a escala do funcionário.' using errcode='42501'; end if;
  select * into v_row from public.employee_crm_access_hours
    where organization_id=p_organization_id and entity_id=p_entity_id;
  return jsonb_build_object('enabled',coalesce(v_row.enabled,false),
    'timezone','America/Sao_Paulo','days',coalesce(v_row.days,'[]'::jsonb));
end $$;

create or replace function public.save_employee_crm_access_hours_v2(
  p_organization_id uuid,p_entity_id uuid,p_enabled boolean,p_days jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_payload jsonb;
begin
  if auth.uid() is null
     or not private.has_effective_organization_permission(p_organization_id,'employees.edit') then
    raise exception 'Sem permissão para configurar os horários de acesso.' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.entities e
    join public.entity_roles er on er.entity_id=e.id and er.role='employee' and er.is_active
    where e.id=p_entity_id and e.organization_id=p_organization_id
  ) then raise exception 'Funcionário não pertence à empresa.' using errcode='23503'; end if;

  v_payload:=coalesce(p_days,'[]'::jsonb);
  if not private.validate_employee_crm_access_days(v_payload) then
    raise exception 'Intervalos inválidos ou sobrepostos no mesmo dia.' using errcode='23514';
  end if;
  insert into public.employee_crm_access_hours
    (organization_id,entity_id,employee_id,enabled,days,updated_by,updated_at)
  values (p_organization_id,p_entity_id,null,coalesce(p_enabled,false),v_payload,auth.uid(),now())
  on conflict(organization_id,entity_id) do update set
    enabled=excluded.enabled,days=excluded.days,
    updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  return jsonb_build_object('enabled',coalesce(p_enabled,false),'days',v_payload);
end $$;

create or replace function public.list_employee_crm_access_sources_v2(p_organization_id uuid)
returns table(entity_id uuid,full_name text,enabled boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null
    or not private.has_effective_organization_permission(p_organization_id,'employees.view')
  then raise exception 'Sem permissão para consultar funcionários.' using errcode='42501'; end if;
  return query
    select e.id,e.name,coalesce(h.enabled,false)
    from public.entities e
    join public.entity_roles er
      on er.entity_id=e.id and er.role='employee' and er.is_active
    left join public.employee_crm_access_hours h
      on h.organization_id=e.organization_id and h.entity_id=e.id
    where e.organization_id=p_organization_id and e.is_active
    order by e.name;
end $$;

create or replace function public.check_my_employee_crm_access_hours_v2(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_restricted boolean;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;
  select exists (
    select 1
    from public.employee_crm_access_hours h
    join public.entities e
      on e.id=h.entity_id and e.organization_id=h.organization_id
    join public.entity_roles er
      on er.entity_id=e.id and er.role='employee' and er.is_active
    left join public.entity_employee_details details on details.entity_id=e.id
    left join public.employees legacy
      on legacy.id=e.legacy_employee_id and legacy.organization_id=e.organization_id
    where h.organization_id=p_organization_id
      and (details.profile_id=auth.uid() or legacy.profile_id=auth.uid())
      and h.enabled
  ) into v_restricted;

  if not private.is_organization_member(p_organization_id) then
    return jsonb_build_object('allowed',false,'restricted',true,'timezone','America/Sao_Paulo');
  end if;
  return jsonb_build_object(
    'allowed',private.employee_crm_access_now(p_organization_id),
    'restricted',v_restricted,'timezone','America/Sao_Paulo');
end $$;

revoke all on function public.get_employee_crm_access_hours_v2(uuid,uuid) from public,anon;
revoke all on function public.save_employee_crm_access_hours_v2(uuid,uuid,boolean,jsonb) from public,anon;
revoke all on function public.list_employee_crm_access_sources_v2(uuid) from public,anon;
revoke all on function public.check_my_employee_crm_access_hours_v2(uuid) from public,anon;
grant execute on function public.get_employee_crm_access_hours_v2(uuid,uuid) to authenticated;
grant execute on function public.save_employee_crm_access_hours_v2(uuid,uuid,boolean,jsonb) to authenticated;
grant execute on function public.list_employee_crm_access_sources_v2(uuid) to authenticated;
grant execute on function public.check_my_employee_crm_access_hours_v2(uuid) to authenticated;
