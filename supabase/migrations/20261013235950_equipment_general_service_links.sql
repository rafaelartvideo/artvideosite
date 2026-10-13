-- Relacionamentos locais de Serviços Gerais por equipamento.
-- Sem links cadastrados, um equipamento não oferece serviços do catálogo
-- até receber a configuração. OS sem tipo selecionado continua com catálogo completo.
create table if not exists public.equipment_type_general_services (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  equipment_type_id uuid not null references public.equipment_types(id) on delete cascade,
  general_service_id uuid not null references public.general_services(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (equipment_type_id, general_service_id)
);
create index if not exists equipment_type_general_services_by_service_idx
  on public.equipment_type_general_services(organization_id,general_service_id);
alter table public.equipment_type_general_services enable row level security;
revoke all on public.equipment_type_general_services from public, anon, authenticated;

-- A leitura das opções e dos vínculos tem autorização por empresa e módulo.
create or replace function public.load_equipment_service_settings_v1(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
  if auth.uid() is null
    or not exists (
      select 1 from public.organization_members om
      join public.organizations o on o.id=om.organization_id
      where om.organization_id=p_organization_id and om.user_id=auth.uid()
        and om.status='active' and o.status='active'
    )
    or not private.can_manage_own_operation_config(p_organization_id,'equipment','equipment.view')
  then
    raise exception 'Sem permissão para consultar serviços por equipamento.' using errcode='42501';
  end if;
  return jsonb_build_object(
    'services',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'name',s.name,'is_active',s.is_active
      ) order by s.name)
      from public.general_services s
      where s.organization_id=p_organization_id
        and lower(btrim(s.name)) <> lower('Serviço avulso')
    ),'[]'::jsonb),
    'links',coalesce((
      select jsonb_agg(jsonb_build_object(
        'equipment_type_id',link.equipment_type_id,
        'general_service_id',link.general_service_id
      ))
      from public.equipment_type_general_services link
      where link.organization_id=p_organization_id
    ),'[]'::jsonb)
  );
end;
$$;

-- Substitui os vínculos de um equipamento numa única transação.
create or replace function public.save_equipment_service_links_v1(
  p_organization_id uuid,
  p_equipment_type_id uuid,
  p_service_ids uuid[] default '{}'::uuid[]
) returns void language plpgsql security definer set search_path=''
as $$
declare
  v_ids uuid[] := coalesce(p_service_ids,'{}'::uuid[]);
begin
  if auth.uid() is null
    or not exists (
      select 1 from public.organization_members om
      join public.organizations o on o.id=om.organization_id
      where om.organization_id=p_organization_id and om.user_id=auth.uid()
        and om.status='active' and o.status='active'
    )
    or not (
      private.can_manage_own_operation_config(p_organization_id,'equipment','equipment.edit')
      or private.can_manage_own_operation_config(p_organization_id,'equipment','equipment.create')
    )
  then
    raise exception 'Sem permissão para alterar serviços do equipamento.' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.equipment_types t
    where t.id=p_equipment_type_id and t.organization_id=p_organization_id
  ) then
    raise exception 'Equipamento não pertence à empresa ativa.' using errcode='22023';
  end if;
  if cardinality(v_ids) > 1000
    or exists(
      select 1 from unnest(v_ids) item(id)
      left join public.general_services service
        on service.id=item.id and service.organization_id=p_organization_id
      where service.id is null
        or (service.is_active=false and not exists(
          select 1 from public.equipment_type_general_services link
          where link.equipment_type_id=p_equipment_type_id and link.general_service_id=item.id
        ))
    )
  then
    raise exception 'Um ou mais serviços são inválidos ou inativos.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text||':equipment-services:'||p_equipment_type_id::text,0
  ));
  delete from public.equipment_type_general_services link
  where link.organization_id=p_organization_id
    and link.equipment_type_id=p_equipment_type_id
    and not (link.general_service_id=any(v_ids));

  insert into public.equipment_type_general_services(
    organization_id,equipment_type_id,general_service_id
  )
  select p_organization_id,p_equipment_type_id,item.id
  from (select distinct unnest(v_ids) as id) item
  on conflict do nothing;
end;
$$;

-- Busca server-side para garantir que a paginação nunca apresente serviços
-- não relacionados ao equipamento da OS.
create or replace function public.search_service_order_services_v1(
  p_service_order_id uuid,
  p_search text default '',
  p_limit integer default 20
)
returns table(
  id uuid,
  name text,
  description text,
  unit text,
  price numeric,
  stock numeric,
  price_at_completion boolean
)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.service_orders%rowtype;
  v_search text:=lower(btrim(coalesce(p_search,'')));
begin
  select * into v_order from public.service_orders where service_orders.id=p_service_order_id;
  if not found or not private.can_view_service_order(p_service_order_id) then
    raise exception 'OS não encontrada ou sem acesso.' using errcode='42501';
  end if;

  return query
  select
    service.id,
    service.name,
    null::text,
    'serviço'::text,
    service.price,
    null::numeric,
    service.price_at_completion
  from public.general_services service
  where service.organization_id=v_order.organization_id
    and service.is_active=true
    and (
      v_order.equipment_type_id is null
      or exists (
        select 1
        from public.equipment_type_general_services link
        where link.organization_id=v_order.organization_id
          and link.equipment_type_id=v_order.equipment_type_id
          and link.general_service_id=service.id
      )
    )
    and lower(btrim(service.name))<>lower('Serviço avulso')
    and (
      v_search=''
      or lower(service.name) like '%'||v_search||'%'
    )
  order by
    case when v_search<>'' and lower(service.name) like v_search||'%' then 0 else 1 end,
    service.sort_order,
    service.name
  limit greatest(1,least(coalesce(p_limit,20),50));
end;
$$;

-- Proteção adicional: uma inclusão fora da busca também exige vínculo.
-- Atualizações de itens previamente incluídos ficam preservadas.
create or replace function private.require_order_service_equipment_link_v1()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_order public.service_orders%rowtype;
begin
  if new.item_type is distinct from 'service' or new.general_service_id is null then
    return new;
  end if;
  if tg_op='UPDATE'
     and old.item_type='service'
     and old.general_service_id=new.general_service_id
     and old.service_order_id=new.service_order_id then
    return new;
  end if;
  select * into v_order from public.service_orders where id=new.service_order_id;
  if not found or new.organization_id is distinct from v_order.organization_id then
    raise exception 'OS inválida para a empresa.' using errcode='22023';
  end if;
  if v_order.equipment_type_id is not null
     and not exists (
       select 1 from public.equipment_type_general_services link
       where link.organization_id=v_order.organization_id
         and link.equipment_type_id=v_order.equipment_type_id
         and link.general_service_id=new.general_service_id
     ) then
    raise exception 'Este serviço não está vinculado ao equipamento da OS.' using errcode='22023';
  end if;
  return new;
end;
$$;
drop trigger if exists z_order_service_equipment_link_guard on public.service_order_items;
create trigger z_order_service_equipment_link_guard
before insert or update of item_type,general_service_id,service_order_id
on public.service_order_items
for each row execute function private.require_order_service_equipment_link_v1();

revoke all on function public.load_equipment_service_settings_v1(uuid) from public,anon,authenticated;
revoke all on function public.save_equipment_service_links_v1(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.load_equipment_service_settings_v1(uuid) to authenticated;
grant execute on function public.save_equipment_service_links_v1(uuid,uuid,uuid[]) to authenticated;
revoke all on function public.search_service_order_services_v1(uuid,text,integer) from public,anon;
grant execute on function public.search_service_order_services_v1(uuid,text,integer) to authenticated;
