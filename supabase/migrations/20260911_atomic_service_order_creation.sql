begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:atomic_service_order_creation', 0)
);

-- Permite que o autor de uma OS recém-criada grave os registros filhos durante
-- a mesma transação mesmo quando o perfil possui orders.create sem orders.edit.
create or replace function private.can_create_service_order_child(
  p_service_order_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.service_orders service_order
    where service_order.id = p_service_order_id
      and service_order.organization_id is not null
      and service_order.assigned_to = (select auth.uid())
      and private.is_organization_module_enabled(
        service_order.organization_id,
        'orders'
      )
      and private.can_access_shared_organization_resource(
        service_order.organization_id,
        'orders',
        'manage'
      )
      and private.has_effective_organization_permission(
        service_order.organization_id,
        'orders.create'
      )
  );
$$;

revoke all on function private.can_create_service_order_child(uuid) from public;
grant execute on function private.can_create_service_order_child(uuid) to authenticated;

-- Criação e edição continuam separadas nas permissões do produto, mas os
-- vínculos necessários para terminar uma NOVA OS precisam ser permitidos para
-- quem acabou de criá-la. A transação atômica abaixo garante rollback completo.
do $$
begin
  if to_regclass('public.service_order_technical_values') is not null then
    drop policy if exists service_order_technical_values_tenant_insert on public.service_order_technical_values;
    create policy service_order_technical_values_tenant_insert
    on public.service_order_technical_values
    for insert
    to authenticated
    with check (
      organization_id is not null
      and (
        private.can_access_service_order_child(service_order_id, 'orders.edit', 'manage')
        or private.can_create_service_order_child(service_order_id)
      )
    );
  end if;

  if to_regclass('public.service_order_technicians') is not null then
    drop policy if exists service_order_technicians_tenant_insert on public.service_order_technicians;
    create policy service_order_technicians_tenant_insert
    on public.service_order_technicians
    for insert
    to authenticated
    with check (
      organization_id is not null
      and (
        private.can_access_service_order_child(service_order_id, 'orders.edit', 'manage')
        or private.can_create_service_order_child(service_order_id)
      )
    );
  end if;

  if to_regclass('public.service_order_sellers') is not null then
    drop policy if exists service_order_sellers_tenant_insert on public.service_order_sellers;
    create policy service_order_sellers_tenant_insert
    on public.service_order_sellers
    for insert
    to authenticated
    with check (
      organization_id is not null
      and (
        private.can_access_service_order_child(service_order_id, 'orders.edit', 'manage')
        or private.can_create_service_order_child(service_order_id)
      )
    );
  end if;
end
$$;

create or replace function public.create_service_order_atomic(
  p_order_id uuid,
  p_organization_id uuid,
  p_payload jsonb,
  p_technician_ids uuid[] default '{}'::uuid[],
  p_seller_ids uuid[] default '{}'::uuid[],
  p_technical_values jsonb default '[]'::jsonb,
  p_media_links jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source public.service_orders%rowtype;
  v_order public.service_orders%rowtype;
  v_value jsonb;
  v_employee_id uuid;
  v_media_id uuid;
  v_sort_order integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if p_order_id is null or p_organization_id is null then
    raise exception 'Identificador da OS e empresa são obrigatórios.' using errcode = '22023';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Payload da OS inválido.' using errcode = '22023';
  end if;

  -- Idempotência: se a resposta da primeira requisição se perder depois do
  -- COMMIT, uma repetição com o mesmo UUID devolve a mesma OS em vez de criar
  -- outro número.
  select service_order.*
    into v_order
  from public.service_orders service_order
  where service_order.id = p_order_id
    and service_order.organization_id = p_organization_id;

  if found then
    return jsonb_build_object(
      'id', v_order.id,
      'os_number', v_order.os_number,
      'external_os_number', v_order.external_os_number,
      'idempotent_replay', true
    );
  end if;

  select *
    into v_source
  from jsonb_populate_record(null::public.service_orders, p_payload);

  -- Somente as colunas aceitas pelo formulário de criação entram aqui.
  -- Campos de resolução/conclusão, empresa, número e auditoria não podem ser
  -- injetados pelo cliente.
  insert into public.service_orders (
    id,
    organization_id,
    service_id,
    general_service_id,
    service_type_id,
    seller_id,
    estimated_price,
    status_id,
    situation_id,
    customer_id,
    assigned_to,
    technician_id,
    equipment_type_id,
    equipment_brand_id,
    equipment_model_id,
    brand_id,
    product_id,
    model,
    serial_number,
    external_os_number,
    accessories,
    equipment_condition,
    priority,
    scheduled_at,
    started_at,
    completed_at,
    internal_notes,
    customer_notes,
    order_type,
    service_zip_code,
    service_state,
    service_city,
    service_neighborhood,
    service_street,
    service_number,
    service_complement,
    service_address_source,
    service_customer_address_id
  ) values (
    p_order_id,
    p_organization_id,
    v_source.service_id,
    v_source.general_service_id,
    v_source.service_type_id,
    v_source.seller_id,
    v_source.estimated_price,
    v_source.status_id,
    v_source.situation_id,
    v_source.customer_id,
    (select auth.uid()),
    v_source.technician_id,
    v_source.equipment_type_id,
    v_source.equipment_brand_id,
    v_source.equipment_model_id,
    v_source.brand_id,
    v_source.product_id,
    v_source.model,
    v_source.serial_number,
    v_source.external_os_number,
    v_source.accessories,
    v_source.equipment_condition,
    coalesce(v_source.priority, 'normal'),
    v_source.scheduled_at,
    v_source.started_at,
    v_source.completed_at,
    v_source.internal_notes,
    v_source.customer_notes,
    v_source.order_type,
    v_source.service_zip_code,
    v_source.service_state,
    v_source.service_city,
    v_source.service_neighborhood,
    v_source.service_street,
    v_source.service_number,
    v_source.service_complement,
    v_source.service_address_source,
    v_source.service_customer_address_id
  )
  returning * into v_order;

  if jsonb_typeof(coalesce(p_technical_values, '[]'::jsonb)) <> 'array' then
    raise exception 'Campos técnicos inválidos.' using errcode = '22023';
  end if;

  for v_value in
    select value from jsonb_array_elements(coalesce(p_technical_values, '[]'::jsonb))
  loop
    if nullif(v_value->>'technical_field_id', '') is null then
      raise exception 'Campo técnico sem identificador.' using errcode = '22023';
    end if;

    if not exists (
      select 1
      from public.technical_fields technical_field
      where technical_field.id = (v_value->>'technical_field_id')::uuid
        and technical_field.organization_id = p_organization_id
    ) then
      raise exception 'Campo técnico não pertence à empresa da OS.' using errcode = '42501';
    end if;

    insert into public.service_order_technical_values (
      organization_id,
      service_order_id,
      technical_field_id,
      field_key_snapshot,
      label_snapshot,
      field_type_snapshot,
      value_text,
      value_number
    ) values (
      p_organization_id,
      p_order_id,
      (v_value->>'technical_field_id')::uuid,
      v_value->>'field_key_snapshot',
      v_value->>'label_snapshot',
      v_value->>'field_type_snapshot',
      nullif(v_value->>'value_text', ''),
      case
        when v_value->>'value_number' is null or v_value->>'value_number' = '' then null
        else (v_value->>'value_number')::numeric
      end
    );
  end loop;

  foreach v_employee_id in array coalesce(p_technician_ids, '{}'::uuid[])
  loop
    if not exists (
      select 1 from public.employees employee
      where employee.id = v_employee_id
        and employee.organization_id = p_organization_id
        and coalesce(employee.is_active, true)
    ) then
      raise exception 'Técnico selecionado não pertence à empresa ou está inativo.' using errcode = '42501';
    end if;

    insert into public.service_order_technicians (
      organization_id,
      service_order_id,
      employee_id
    ) values (
      p_organization_id,
      p_order_id,
      v_employee_id
    );
  end loop;

  foreach v_employee_id in array coalesce(p_seller_ids, '{}'::uuid[])
  loop
    if not exists (
      select 1 from public.employees employee
      where employee.id = v_employee_id
        and employee.organization_id = p_organization_id
        and coalesce(employee.is_active, true)
    ) then
      raise exception 'Vendedor selecionado não pertence à empresa ou está inativo.' using errcode = '42501';
    end if;

    insert into public.service_order_sellers (
      organization_id,
      service_order_id,
      employee_id
    ) values (
      p_organization_id,
      p_order_id,
      v_employee_id
    );
  end loop;

  if jsonb_typeof(coalesce(p_media_links, '[]'::jsonb)) <> 'array' then
    raise exception 'Lista de imagens inválida.' using errcode = '22023';
  end if;

  for v_value in
    select value from jsonb_array_elements(coalesce(p_media_links, '[]'::jsonb))
  loop
    if nullif(v_value->>'media_id', '') is null then
      raise exception 'Imagem sem identificador.' using errcode = '22023';
    end if;

    v_media_id := (v_value->>'media_id')::uuid;
    v_sort_order := coalesce((v_value->>'sort_order')::integer, 0);

    if not exists (
      select 1 from public.media media
      where media.id = v_media_id
        and media.organization_id = p_organization_id
    ) then
      raise exception 'Imagem não pertence à empresa da OS.' using errcode = '42501';
    end if;

    insert into public.service_order_media (
      organization_id,
      service_order_id,
      media_id,
      sort_order
    ) values (
      p_organization_id,
      p_order_id,
      v_media_id,
      v_sort_order
    );
  end loop;

  return jsonb_build_object(
    'id', v_order.id,
    'os_number', v_order.os_number,
    'external_os_number', v_order.external_os_number,
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.create_service_order_atomic(uuid, uuid, jsonb, uuid[], uuid[], jsonb, jsonb) from public;
grant execute on function public.create_service_order_atomic(uuid, uuid, jsonb, uuid[], uuid[], jsonb, jsonb) to authenticated;

comment on function public.create_service_order_atomic(uuid, uuid, jsonb, uuid[], uuid[], jsonb, jsonb) is
  'Cria OS, campos técnicos, responsáveis e vínculos de mídia em uma única transação. Qualquer erro faz rollback integral; p_order_id fornece idempotência contra retries.';

commit;
