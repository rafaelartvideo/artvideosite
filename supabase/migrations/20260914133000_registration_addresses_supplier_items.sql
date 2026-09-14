begin;

alter table public.entities
  add column if not exists municipal_registration text;

alter table public.customers
  add column if not exists municipal_registration text;

-- Remove policies legadas sem organization_id para manter isolamento multiempresa.
drop policy if exists "Authorized users can view customers" on public.customers;
drop policy if exists "Authorized users can update customers" on public.customers;
drop policy if exists "Authorized users can view customer addresses" on public.customer_addresses;
drop policy if exists "Authorized users can update customer addresses" on public.customer_addresses;

-- Chaves compostas permitem FKs que garantem o mesmo tenant nas relações.
create unique index if not exists entities_id_organization_uidx
  on public.entities (id, organization_id);

create unique index if not exists inventory_items_id_organization_uidx
  on public.inventory_items (id, organization_id);

-- Garante que entity_addresses.organization_id sempre corresponda ao cadastro.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'entity_addresses_entity_organization_fkey'
      and conrelid = 'public.entity_addresses'::regclass
  ) then
    alter table public.entity_addresses
      add constraint entity_addresses_entity_organization_fkey
      foreign key (entity_id, organization_id)
      references public.entities (id, organization_id)
      on update cascade
      on delete cascade;
  end if;
end $$;

create unique index if not exists entity_addresses_one_primary_active_idx
  on public.entity_addresses (entity_id)
  where is_primary = true and is_active = true;

create table if not exists public.entity_supplier_items (
  organization_id uuid not null,
  entity_id uuid not null,
  inventory_item_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid null default auth.uid() references public.profiles(id),
  primary key (organization_id, entity_id, inventory_item_id),
  constraint entity_supplier_items_entity_org_fkey
    foreign key (entity_id, organization_id)
    references public.entities (id, organization_id)
    on update cascade on delete cascade,
  constraint entity_supplier_items_inventory_org_fkey
    foreign key (inventory_item_id, organization_id)
    references public.inventory_items (id, organization_id)
    on update cascade on delete restrict
);

create index if not exists entity_supplier_items_entity_idx
  on public.entity_supplier_items (entity_id);
create index if not exists entity_supplier_items_inventory_idx
  on public.entity_supplier_items (inventory_item_id);

alter table public.entity_supplier_items enable row level security;
revoke all on table public.entity_supplier_items from public, anon;
grant select, insert, delete on table public.entity_supplier_items to authenticated;

drop policy if exists entity_supplier_items_select on public.entity_supplier_items;
create policy entity_supplier_items_select
on public.entity_supplier_items
for select
to authenticated
using (
  organization_id is not null
  and private.has_effective_organization_permission(organization_id, 'customers.view')
);

drop policy if exists entity_supplier_items_insert on public.entity_supplier_items;
create policy entity_supplier_items_insert
on public.entity_supplier_items
for insert
to authenticated
with check (
  organization_id is not null
  and (
    private.has_effective_organization_permission(organization_id, 'customers.create')
    or private.has_effective_organization_permission(organization_id, 'customers.edit')
    or private.has_effective_organization_permission(organization_id, 'customers.update')
  )
  and exists (
    select 1
    from public.entity_roles supplier_role
    where supplier_role.entity_id = entity_supplier_items.entity_id
      and supplier_role.role = 'supplier'
      and supplier_role.is_active = true
  )
);

drop policy if exists entity_supplier_items_delete on public.entity_supplier_items;
create policy entity_supplier_items_delete
on public.entity_supplier_items
for delete
to authenticated
using (
  organization_id is not null
  and (
    private.has_effective_organization_permission(organization_id, 'customers.edit')
    or private.has_effective_organization_permission(organization_id, 'customers.update')
  )
);

-- Cadastros precisa ler nome/SKU do estoque para vincular itens ao fornecedor.
drop policy if exists inventory_items_registration_supplier_lookup on public.inventory_items;
create policy inventory_items_registration_supplier_lookup
on public.inventory_items
for select
to authenticated
using (
  organization_id is not null
  and (
    private.has_effective_organization_permission(organization_id, 'customers.view')
    or private.has_effective_organization_permission(organization_id, 'customers.create')
    or private.has_effective_organization_permission(organization_id, 'customers.edit')
    or private.has_effective_organization_permission(organization_id, 'customers.update')
  )
);

-- Editar um cadastro também permite incluir/remover endereços.
drop policy if exists entity_addresses_insert on public.entity_addresses;
create policy entity_addresses_insert
on public.entity_addresses
for insert
to authenticated
with check (
  exists (
    select 1 from public.entities e
    where e.id = entity_addresses.entity_id
      and e.organization_id = entity_addresses.organization_id
      and (
        private.has_effective_organization_permission(e.organization_id, 'customers.create')
        or private.has_effective_organization_permission(e.organization_id, 'customers.edit')
        or private.has_effective_organization_permission(e.organization_id, 'customers.update')
        or private.has_effective_organization_permission(e.organization_id, 'customers.addresses.edit')
      )
  )
);

drop policy if exists entity_addresses_delete on public.entity_addresses;
create policy entity_addresses_delete
on public.entity_addresses
for delete
to authenticated
using (
  exists (
    select 1 from public.entities e
    where e.id = entity_addresses.entity_id
      and e.organization_id = entity_addresses.organization_id
      and (
        private.has_effective_organization_permission(e.organization_id, 'customers.edit')
        or private.has_effective_organization_permission(e.organization_id, 'customers.update')
        or private.has_effective_organization_permission(e.organization_id, 'customers.addresses.edit')
      )
  )
);

drop policy if exists customer_addresses_insert on public.customer_addresses;
create policy customer_addresses_insert
on public.customer_addresses
for insert
to authenticated
with check (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'customers')
  and private.can_access_shared_organization_resource(organization_id, 'customers', 'manage')
  and (
    private.has_effective_organization_permission(organization_id, 'customers.create')
    or private.has_effective_organization_permission(organization_id, 'customers.edit')
    or private.has_effective_organization_permission(organization_id, 'customers.update')
    or private.has_effective_organization_permission(organization_id, 'customers.addresses.edit')
  )
);

drop policy if exists customer_addresses_delete on public.customer_addresses;
create policy customer_addresses_delete
on public.customer_addresses
for delete
to authenticated
using (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'customers')
  and private.can_access_shared_organization_resource(organization_id, 'customers', 'manage')
  and (
    private.has_effective_organization_permission(organization_id, 'customers.edit')
    or private.has_effective_organization_permission(organization_id, 'customers.update')
    or private.has_effective_organization_permission(organization_id, 'customers.addresses.edit')
  )
);

create or replace function public.sync_registration_addresses(
  p_registration_id uuid,
  p_organization_id uuid,
  p_addresses jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_addresses jsonb := coalesce(p_addresses, '[]'::jsonb);
  v_customer_id uuid;
  v_address jsonb;
  v_address_id uuid;
  v_customer_address_id uuid;
  v_keep_ids uuid[] := array[]::uuid[];
  v_is_primary boolean;
  v_primary_count integer := 0;
  v_position integer := 0;
begin
  if jsonb_typeof(v_addresses) <> 'array' then
    raise exception 'A lista de endereços é inválida.';
  end if;

  select e.legacy_customer_id
    into v_customer_id
  from public.entities e
  where e.id = p_registration_id
    and e.organization_id = p_organization_id;

  if not found then
    raise exception 'Cadastro não encontrado para esta empresa.';
  end if;

  select count(*)
    into v_primary_count
  from jsonb_array_elements(v_addresses) item
  where coalesce((item->>'is_primary')::boolean, false);

  if v_primary_count > 1 then
    raise exception 'Somente um endereço pode ser principal.';
  end if;

  update public.entity_addresses
  set is_primary = false,
      updated_at = timezone('utc', now())
  where entity_id = p_registration_id
    and organization_id = p_organization_id;

  if v_customer_id is not null then
    update public.customer_addresses
    set is_default = false,
        updated_at = timezone('utc', now())
    where customer_id = v_customer_id
      and organization_id = p_organization_id;
  end if;

  for v_address in select value from jsonb_array_elements(v_addresses)
  loop
    v_position := v_position + 1;

    if nullif(v_address->>'id', '') is not null then
      v_address_id := (v_address->>'id')::uuid;
      if not exists (
        select 1 from public.entity_addresses existing
        where existing.id = v_address_id
          and existing.entity_id = p_registration_id
          and existing.organization_id = p_organization_id
      ) then
        raise exception 'Endereço informado não pertence a este cadastro e empresa.';
      end if;
    else
      v_address_id := gen_random_uuid();
    end if;

    v_is_primary := coalesce((v_address->>'is_primary')::boolean, false);
    if v_primary_count = 0 and v_position = 1 then
      v_is_primary := true;
    end if;

    select coalesce(existing.legacy_customer_address_id, existing.id)
      into v_customer_address_id
    from public.entity_addresses existing
    where existing.id = v_address_id
      and existing.entity_id = p_registration_id
      and existing.organization_id = p_organization_id;

    if v_customer_address_id is null then
      v_customer_address_id := v_address_id;
    end if;

    insert into public.entity_addresses (
      id, entity_id, organization_id, type, zip_code, state, city, neighborhood,
      street, number, complement, reference, location_url, is_primary, is_active
    ) values (
      v_address_id,
      p_registration_id,
      p_organization_id,
      coalesce(nullif(trim(coalesce(v_address->>'type', '')), ''), case when v_is_primary then 'Principal' else 'Outro' end),
      nullif(regexp_replace(coalesce(v_address->>'zip_code', ''), '[^0-9]', '', 'g'), ''),
      nullif(upper(trim(coalesce(v_address->>'state', ''))), ''),
      nullif(trim(coalesce(v_address->>'city', '')), ''),
      nullif(trim(coalesce(v_address->>'neighborhood', '')), ''),
      nullif(trim(coalesce(v_address->>'street', '')), ''),
      nullif(trim(coalesce(v_address->>'number', '')), ''),
      nullif(trim(coalesce(v_address->>'complement', '')), ''),
      nullif(trim(coalesce(v_address->>'reference', '')), ''),
      nullif(trim(coalesce(v_address->>'location_url', '')), ''),
      v_is_primary,
      true
    )
    on conflict (id) do update set
      type = excluded.type,
      zip_code = excluded.zip_code,
      state = excluded.state,
      city = excluded.city,
      neighborhood = excluded.neighborhood,
      street = excluded.street,
      number = excluded.number,
      complement = excluded.complement,
      reference = excluded.reference,
      location_url = excluded.location_url,
      is_primary = excluded.is_primary,
      is_active = true,
      updated_at = timezone('utc', now())
    where public.entity_addresses.entity_id = p_registration_id
      and public.entity_addresses.organization_id = p_organization_id;

    v_keep_ids := array_append(v_keep_ids, v_address_id);

    if v_customer_id is not null then
      insert into public.customer_addresses (
        id, customer_id, organization_id, zip_code, street, number, complement,
        neighborhood, city, state, reference, is_default, shared_map_url
      ) values (
        v_customer_address_id,
        v_customer_id,
        p_organization_id,
        nullif(regexp_replace(coalesce(v_address->>'zip_code', ''), '[^0-9]', '', 'g'), ''),
        nullif(trim(coalesce(v_address->>'street', '')), ''),
        nullif(trim(coalesce(v_address->>'number', '')), ''),
        nullif(trim(coalesce(v_address->>'complement', '')), ''),
        nullif(trim(coalesce(v_address->>'neighborhood', '')), ''),
        nullif(trim(coalesce(v_address->>'city', '')), ''),
        nullif(upper(trim(coalesce(v_address->>'state', ''))), ''),
        nullif(trim(coalesce(v_address->>'reference', '')), ''),
        v_is_primary,
        nullif(trim(coalesce(v_address->>'location_url', '')), '')
      )
      on conflict (id) do update set
        customer_id = excluded.customer_id,
        organization_id = excluded.organization_id,
        zip_code = excluded.zip_code,
        street = excluded.street,
        number = excluded.number,
        complement = excluded.complement,
        neighborhood = excluded.neighborhood,
        city = excluded.city,
        state = excluded.state,
        reference = excluded.reference,
        is_default = excluded.is_default,
        shared_map_url = excluded.shared_map_url,
        updated_at = timezone('utc', now());

      update public.entity_addresses
      set legacy_customer_address_id = v_customer_address_id
      where id = v_address_id
        and entity_id = p_registration_id
        and organization_id = p_organization_id;
    end if;
  end loop;

  if v_customer_id is not null then
    delete from public.customer_addresses ca
    where ca.customer_id = v_customer_id
      and ca.organization_id = p_organization_id
      and exists (
        select 1
        from public.entity_addresses ea
        where ea.entity_id = p_registration_id
          and ea.organization_id = p_organization_id
          and coalesce(ea.legacy_customer_address_id, ea.id) = ca.id
          and not (ea.id = any(v_keep_ids))
      );
  end if;

  delete from public.entity_addresses ea
  where ea.entity_id = p_registration_id
    and ea.organization_id = p_organization_id
    and not (ea.id = any(v_keep_ids));
end;
$$;

revoke all on function public.sync_registration_addresses(uuid, uuid, jsonb) from public, anon;
grant execute on function public.sync_registration_addresses(uuid, uuid, jsonb) to authenticated;

create or replace function public.sync_registration_supplier_items(
  p_registration_id uuid,
  p_organization_id uuid,
  p_inventory_item_ids uuid[] default array[]::uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ids uuid[] := coalesce(p_inventory_item_ids, array[]::uuid[]);
  v_expected integer;
  v_valid integer;
begin
  if not exists (
    select 1
    from public.entities e
    join public.entity_roles r on r.entity_id = e.id
    where e.id = p_registration_id
      and e.organization_id = p_organization_id
      and r.role = 'supplier'
      and r.is_active = true
  ) then
    if cardinality(v_ids) = 0 then
      delete from public.entity_supplier_items
      where organization_id = p_organization_id
        and entity_id = p_registration_id;
      return;
    end if;
    raise exception 'O cadastro precisa possuir vínculo Fornecedor.';
  end if;

  select count(distinct item_id) into v_expected
  from unnest(v_ids) item_id;

  select count(distinct inventory.id) into v_valid
  from public.inventory_items inventory
  join unnest(v_ids) item_id on item_id = inventory.id
  where inventory.organization_id = p_organization_id;

  if v_expected <> v_valid then
    raise exception 'Um ou mais itens não pertencem à empresa ativa.';
  end if;

  delete from public.entity_supplier_items link
  where link.organization_id = p_organization_id
    and link.entity_id = p_registration_id
    and not (link.inventory_item_id = any(v_ids));

  insert into public.entity_supplier_items (organization_id, entity_id, inventory_item_id, created_by)
  select p_organization_id, p_registration_id, item_id, (select auth.uid())
  from (select distinct unnest(v_ids) as item_id) ids
  on conflict (organization_id, entity_id, inventory_item_id) do nothing;
end;
$$;

revoke all on function public.sync_registration_supplier_items(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.sync_registration_supplier_items(uuid, uuid, uuid[]) to authenticated;

commit;
