-- Equipamentos físicos pertencentes aos clientes.
--
-- Regras:
-- 1) cada equipamento pertence a uma empresa e a um cliente;
-- 2) número de série é único dentro da empresa, ignorando maiúsculas/minúsculas
--    e espaços nas extremidades;
-- 3) a mesma série pode existir em empresas diferentes;
-- 4) ao criar uma OS, o equipamento é criado/vinculado atomicamente;
-- 5) uma série já pertencente a outro cliente bloqueia a criação da OS e
--    informa o proprietário;
-- 6) a OS mantém seus campos como snapshot histórico, enquanto
--    customer_equipments mantém os dados atuais do equipamento do cliente.

begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:customer_equipments_serial_scope', 0)
);

create table if not exists public.customer_equipments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  equipment_type_id uuid references public.equipment_types(id) on delete set null,
  equipment_brand_id uuid references public.equipment_brands(id) on delete set null,
  equipment_model_id uuid references public.equipment_models(id) on delete set null,
  equipment_type_name text,
  equipment_brand_name text,
  equipment_model_name text,
  serial_number text,
  technical_values jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.service_orders
  add column if not exists customer_equipment_id uuid
  references public.customer_equipments(id) on delete restrict;

create index if not exists customer_equipments_customer_idx
  on public.customer_equipments (organization_id, customer_id, updated_at desc);

create index if not exists service_orders_customer_equipment_idx
  on public.service_orders (organization_id, customer_equipment_id)
  where customer_equipment_id is not null;

-- Abortamos antes do backfill se o histórico já possuir a mesma série
-- atribuída a clientes diferentes dentro da mesma empresa. Não escolhemos um
-- proprietário silenciosamente.
do $$
declare
  v_conflict record;
begin
  select
    service_order.organization_id,
    upper(btrim(service_order.serial_number)) as normalized_serial,
    count(distinct service_order.customer_id) as customer_count
  into v_conflict
  from public.service_orders service_order
  where service_order.organization_id is not null
    and service_order.customer_id is not null
    and nullif(btrim(service_order.serial_number), '') is not null
  group by
    service_order.organization_id,
    upper(btrim(service_order.serial_number))
  having count(distinct service_order.customer_id) > 1
  limit 1;

  if found then
    raise exception 'A série "%" já aparece em OS antigas de % clientes diferentes na mesma empresa. Corrija esse conflito antes de aplicar a migration.',
      v_conflict.normalized_serial,
      v_conflict.customer_count
      using errcode = '23505';
  end if;
end
$$;

create unique index if not exists customer_equipments_serial_unique_per_org
  on public.customer_equipments (
    organization_id,
    upper(btrim(serial_number))
  )
  where nullif(btrim(serial_number), '') is not null;

create or replace function private.ensure_customer_equipment_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.customers customer
    where customer.id = new.customer_id
      and customer.organization_id = new.organization_id
  ) then
    raise exception 'O equipamento e o cliente devem pertencer à mesma empresa.'
      using errcode = '42501';
  end if;

  if new.equipment_type_id is not null and not exists (
    select 1
    from public.equipment_types equipment_type
    where equipment_type.id = new.equipment_type_id
      and equipment_type.organization_id = new.organization_id
  ) then
    raise exception 'O tipo do equipamento não pertence à empresa do cliente.'
      using errcode = '42501';
  end if;

  if new.equipment_brand_id is not null and not exists (
    select 1
    from public.equipment_brands equipment_brand
    where equipment_brand.id = new.equipment_brand_id
      and equipment_brand.organization_id = new.organization_id
  ) then
    raise exception 'A marca do equipamento não pertence à empresa do cliente.'
      using errcode = '42501';
  end if;

  if new.equipment_model_id is not null and not exists (
    select 1
    from public.equipment_models equipment_model
    where equipment_model.id = new.equipment_model_id
      and equipment_model.organization_id = new.organization_id
  ) then
    raise exception 'O modelo do equipamento não pertence à empresa do cliente.'
      using errcode = '42501';
  end if;

  new.serial_number := nullif(btrim(new.serial_number), '');
  return new;
end;
$$;

revoke all on function private.ensure_customer_equipment_organization() from public;

drop trigger if exists customer_equipments_prevent_organization_change
  on public.customer_equipments;
create trigger customer_equipments_prevent_organization_change
before update of organization_id
on public.customer_equipments
for each row
execute function private.prevent_organization_id_change();

drop trigger if exists customer_equipments_validate_organization
  on public.customer_equipments;
create trigger customer_equipments_validate_organization
before insert or update of
  organization_id,
  customer_id,
  equipment_type_id,
  equipment_brand_id,
  equipment_model_id,
  serial_number
on public.customer_equipments
for each row
execute function private.ensure_customer_equipment_organization();

-- Migra os números de série já existentes. A OS mais recente fornece os dados
-- canônicos iniciais; as próprias OS permanecem intactas como histórico.
insert into public.customer_equipments (
  organization_id,
  customer_id,
  equipment_type_id,
  equipment_brand_id,
  equipment_model_id,
  equipment_type_name,
  equipment_brand_name,
  equipment_model_name,
  serial_number,
  created_at,
  updated_at
)
select distinct on (
  service_order.organization_id,
  upper(btrim(service_order.serial_number))
)
  service_order.organization_id,
  service_order.customer_id,
  service_order.equipment_type_id,
  service_order.equipment_brand_id,
  service_order.equipment_model_id,
  equipment_type.name,
  equipment_brand.name,
  equipment_model.name,
  btrim(service_order.serial_number),
  coalesce(service_order.created_at, now()),
  coalesce(service_order.updated_at, service_order.created_at, now())
from public.service_orders service_order
left join public.equipment_types equipment_type
  on equipment_type.id = service_order.equipment_type_id
 and equipment_type.organization_id = service_order.organization_id
left join public.equipment_brands equipment_brand
  on equipment_brand.id = service_order.equipment_brand_id
 and equipment_brand.organization_id = service_order.organization_id
left join public.equipment_models equipment_model
  on equipment_model.id = service_order.equipment_model_id
 and equipment_model.organization_id = service_order.organization_id
where service_order.organization_id is not null
  and service_order.customer_id is not null
  and nullif(btrim(service_order.serial_number), '') is not null
on conflict do nothing;

update public.service_orders service_order
set customer_equipment_id = customer_equipment.id
from public.customer_equipments customer_equipment
where service_order.organization_id = customer_equipment.organization_id
  and nullif(btrim(service_order.serial_number), '') is not null
  and upper(btrim(service_order.serial_number)) = upper(btrim(customer_equipment.serial_number))
  and service_order.customer_id = customer_equipment.customer_id
  and service_order.customer_equipment_id is distinct from customer_equipment.id;

-- Texto utilizado na mensagem de conflito de número de série.
create or replace function private.customer_equipment_owner_identity(
  p_customer_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_customer_type text;
  v_document text;
  v_digits text;
  v_label text;
begin
  select
    customer.full_name,
    customer.customer_type,
    case
      when customer.customer_type = 'PJ' then customer.cnpj
      else customer.document
    end
  into v_name, v_customer_type, v_document
  from public.customers customer
  where customer.id = p_customer_id;

  v_name := coalesce(nullif(btrim(v_name), ''), 'Cliente');
  v_digits := regexp_replace(coalesce(v_document, ''), '[^0-9]', '', 'g');

  if v_customer_type = 'PJ' then
    v_label := 'CNPJ';
    if length(v_digits) = 14 then
      v_document := substr(v_digits, 1, 2) || '.' ||
        substr(v_digits, 3, 3) || '.' ||
        substr(v_digits, 6, 3) || '/' ||
        substr(v_digits, 9, 4) || '-' ||
        substr(v_digits, 13, 2);
    else
      v_document := nullif(v_digits, '');
    end if;
  else
    v_label := 'CPF';
    if length(v_digits) = 11 then
      v_document := substr(v_digits, 1, 3) || '.' ||
        substr(v_digits, 4, 3) || '.' ||
        substr(v_digits, 7, 3) || '-' ||
        substr(v_digits, 10, 2);
    else
      v_document := nullif(v_digits, '');
    end if;
  end if;

  if v_document is null then
    return v_name;
  end if;

  return format('%s (%s: %s)', v_name, v_label, v_document);
end;
$$;

revoke all on function private.customer_equipment_owner_identity(uuid) from public;

-- Resolve o equipamento físico antes da gravação da OS. Como é BEFORE INSERT,
-- qualquer conflito cancela a própria criação da OS na mesma transação.
create or replace function private.assign_service_order_customer_equipment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_serial text;
  v_equipment public.customer_equipments%rowtype;
  v_equipment_id uuid;
  v_type_name text;
  v_brand_name text;
  v_model_name text;
  v_has_equipment_data boolean;
begin
  v_serial := nullif(btrim(new.serial_number), '');
  new.serial_number := v_serial;

  if tg_op = 'UPDATE'
     and new.serial_number is distinct from old.serial_number then
    raise exception 'O número de série do equipamento não pode ser alterado após o cadastro da OS.'
      using errcode = '42501';
  end if;

  v_has_equipment_data :=
    new.equipment_type_id is not null
    or new.equipment_brand_id is not null
    or new.equipment_model_id is not null
    or v_serial is not null;

  if not v_has_equipment_data then
    if tg_op = 'UPDATE' and old.customer_equipment_id is not null then
      if new.customer_id is distinct from old.customer_id then
        raise exception 'O cliente da OS não pode ser alterado porque há um equipamento vinculado.'
          using errcode = '42501';
      end if;
      new.customer_equipment_id := old.customer_equipment_id;
    else
      new.customer_equipment_id := null;
    end if;
    return new;
  end if;

  if new.organization_id is null or new.customer_id is null then
    raise exception 'Informe a empresa e o cliente antes de vincular o equipamento.'
      using errcode = '23503';
  end if;

  if not exists (
    select 1
    from public.customers customer
    where customer.id = new.customer_id
      and customer.organization_id = new.organization_id
  ) then
    raise exception 'O cliente selecionado não pertence à empresa da OS.'
      using errcode = '42501';
  end if;

  if new.equipment_type_id is not null then
    select equipment_type.name into v_type_name
    from public.equipment_types equipment_type
    where equipment_type.id = new.equipment_type_id
      and equipment_type.organization_id = new.organization_id;
  end if;

  if new.equipment_brand_id is not null then
    select equipment_brand.name into v_brand_name
    from public.equipment_brands equipment_brand
    where equipment_brand.id = new.equipment_brand_id
      and equipment_brand.organization_id = new.organization_id;
  end if;

  if new.equipment_model_id is not null then
    select equipment_model.name into v_model_name
    from public.equipment_models equipment_model
    where equipment_model.id = new.equipment_model_id
      and equipment_model.organization_id = new.organization_id;
  end if;

  if v_serial is not null then
    select *
    into v_equipment
    from public.customer_equipments customer_equipment
    where customer_equipment.organization_id = new.organization_id
      and upper(btrim(customer_equipment.serial_number)) = upper(v_serial)
    for update;

    if found then
      if v_equipment.customer_id is distinct from new.customer_id then
        raise exception 'O número de série "%" pertence ao equipamento do cliente %.',
          v_serial,
          private.customer_equipment_owner_identity(v_equipment.customer_id)
          using errcode = '23505';
      end if;
      v_equipment_id := v_equipment.id;
    else
      begin
        insert into public.customer_equipments (
          organization_id,
          customer_id,
          equipment_type_id,
          equipment_brand_id,
          equipment_model_id,
          equipment_type_name,
          equipment_brand_name,
          equipment_model_name,
          serial_number
        ) values (
          new.organization_id,
          new.customer_id,
          new.equipment_type_id,
          new.equipment_brand_id,
          new.equipment_model_id,
          v_type_name,
          v_brand_name,
          v_model_name,
          v_serial
        )
        returning id into v_equipment_id;
      exception
        when unique_violation then
          select *
          into v_equipment
          from public.customer_equipments customer_equipment
          where customer_equipment.organization_id = new.organization_id
            and upper(btrim(customer_equipment.serial_number)) = upper(v_serial)
          for update;

          if not found then
            raise;
          end if;

          if v_equipment.customer_id is distinct from new.customer_id then
            raise exception 'O número de série "%" pertence ao equipamento do cliente %.',
              v_serial,
              private.customer_equipment_owner_identity(v_equipment.customer_id)
              using errcode = '23505';
          end if;

          v_equipment_id := v_equipment.id;
      end;
    end if;
  elsif tg_op = 'UPDATE' and old.customer_equipment_id is not null then
    select *
    into v_equipment
    from public.customer_equipments customer_equipment
    where customer_equipment.id = old.customer_equipment_id
      and customer_equipment.organization_id = new.organization_id
    for update;

    if found and v_equipment.customer_id is distinct from new.customer_id then
      raise exception 'O equipamento desta OS pertence a outro cliente e não pode ser transferido.'
        using errcode = '42501';
    end if;

    v_equipment_id := old.customer_equipment_id;
  else
    insert into public.customer_equipments (
      organization_id,
      customer_id,
      equipment_type_id,
      equipment_brand_id,
      equipment_model_id,
      equipment_type_name,
      equipment_brand_name,
      equipment_model_name,
      serial_number
    ) values (
      new.organization_id,
      new.customer_id,
      new.equipment_type_id,
      new.equipment_brand_id,
      new.equipment_model_id,
      v_type_name,
      v_brand_name,
      v_model_name,
      null
    )
    returning id into v_equipment_id;
  end if;

  update public.customer_equipments customer_equipment
  set
    equipment_type_id = coalesce(new.equipment_type_id, customer_equipment.equipment_type_id),
    equipment_brand_id = coalesce(new.equipment_brand_id, customer_equipment.equipment_brand_id),
    equipment_model_id = coalesce(new.equipment_model_id, customer_equipment.equipment_model_id),
    equipment_type_name = coalesce(v_type_name, customer_equipment.equipment_type_name),
    equipment_brand_name = coalesce(v_brand_name, customer_equipment.equipment_brand_name),
    equipment_model_name = coalesce(v_model_name, customer_equipment.equipment_model_name),
    updated_at = now()
  where customer_equipment.id = v_equipment_id
    and customer_equipment.organization_id = new.organization_id
    and customer_equipment.customer_id = new.customer_id;

  new.customer_equipment_id := v_equipment_id;
  return new;
end;
$$;

revoke all on function private.assign_service_order_customer_equipment() from public;

drop trigger if exists service_orders_assign_customer_equipment
  on public.service_orders;
create trigger service_orders_assign_customer_equipment
before insert or update of
  organization_id,
  customer_id,
  equipment_type_id,
  equipment_brand_id,
  equipment_model_id,
  serial_number,
  customer_equipment_id
on public.service_orders
for each row
execute function private.assign_service_order_customer_equipment();

-- Os campos técnicos da OS mais recente passam a representar os dados técnicos
-- atuais do equipamento do cliente. As OS antigas continuam com seus próprios
-- snapshots em service_order_technical_values.
create or replace function private.refresh_customer_equipment_technical_values(
  p_service_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_equipment_id uuid;
  v_values jsonb;
begin
  select service_order.customer_equipment_id
  into v_customer_equipment_id
  from public.service_orders service_order
  where service_order.id = p_service_order_id;

  if v_customer_equipment_id is null then
    return;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'technical_field_id', technical_value.technical_field_id,
        'field_key_snapshot', technical_value.field_key_snapshot,
        'label_snapshot', technical_value.label_snapshot,
        'field_type_snapshot', technical_value.field_type_snapshot,
        'value_text', technical_value.value_text,
        'value_number', technical_value.value_number
      )
      order by technical_value.label_snapshot, technical_value.technical_field_id
    ),
    '[]'::jsonb
  )
  into v_values
  from public.service_order_technical_values technical_value
  where technical_value.service_order_id = p_service_order_id;

  update public.customer_equipments
  set
    technical_values = v_values,
    updated_at = now()
  where id = v_customer_equipment_id;
end;
$$;

revoke all on function private.refresh_customer_equipment_technical_values(uuid) from public;

create or replace function private.sync_customer_equipment_technical_values()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_customer_equipment_technical_values(old.service_order_id);
    return old;
  end if;

  if tg_op = 'UPDATE'
     and old.service_order_id is distinct from new.service_order_id then
    perform private.refresh_customer_equipment_technical_values(old.service_order_id);
  end if;

  perform private.refresh_customer_equipment_technical_values(new.service_order_id);
  return new;
end;
$$;

revoke all on function private.sync_customer_equipment_technical_values() from public;

drop trigger if exists service_order_technical_values_sync_customer_equipment
  on public.service_order_technical_values;
create trigger service_order_technical_values_sync_customer_equipment
after insert or update or delete
on public.service_order_technical_values
for each row
execute function private.sync_customer_equipment_technical_values();

-- Inicializa os campos técnicos dos equipamentos migrados usando a OS mais
-- recente já vinculada a cada equipamento.
do $$
declare
  v_equipment record;
  v_service_order_id uuid;
begin
  for v_equipment in
    select customer_equipment.id
    from public.customer_equipments customer_equipment
  loop
    select service_order.id
    into v_service_order_id
    from public.service_orders service_order
    where service_order.customer_equipment_id = v_equipment.id
    order by service_order.created_at desc nulls last, service_order.id desc
    limit 1;

    if v_service_order_id is not null then
      perform private.refresh_customer_equipment_technical_values(v_service_order_id);
    end if;
  end loop;
end
$$;

alter table public.customer_equipments enable row level security;

drop policy if exists customer_equipments_select on public.customer_equipments;
create policy customer_equipments_select
on public.customer_equipments
for select
to authenticated
using (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'customers')
  and private.can_access_shared_organization_resource(
    organization_id,
    'customers',
    'read'
  )
  and private.has_effective_organization_permission(
    organization_id,
    'customers.view'
  )
);

-- O cadastro canônico é mantido pelo fluxo da OS. Não há edição direta de
-- equipamento do cliente nesta etapa.
revoke insert, update, delete on public.customer_equipments from authenticated, anon;
grant select on public.customer_equipments to authenticated;
revoke all on public.customer_equipments from anon;

comment on table public.customer_equipments is
  'Equipamentos físicos pertencentes aos clientes, isolados por empresa. O número de série é único dentro de cada organization_id.';
comment on column public.service_orders.customer_equipment_id is
  'Equipamento físico do cliente utilizado nesta OS. Os demais campos de equipamento da OS permanecem como snapshot histórico.';

commit;
