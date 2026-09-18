-- Compartilhamento unidirecional do catálogo técnico da ArtVideo.
-- Tipos de equipamento, marcas, modelos, campos opcionais e vínculos de campos
-- são replicados para todas as demais empresas. Dados de clientes/OS não entram
-- neste fluxo. As cópias compartilhadas são somente leitura nos tenants destino.

begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:shared_equipment_catalog', 0)
);

alter table public.equipment_types
  add column if not exists source_artvideo_id uuid;
alter table public.equipment_brands
  add column if not exists source_artvideo_id uuid;
alter table public.equipment_models
  add column if not exists source_artvideo_id uuid;
alter table public.technical_fields
  add column if not exists source_artvideo_id uuid;

create unique index if not exists equipment_types_artvideo_source_org_uidx
  on public.equipment_types (organization_id, source_artvideo_id)
  where source_artvideo_id is not null;
create unique index if not exists equipment_brands_artvideo_source_org_uidx
  on public.equipment_brands (organization_id, source_artvideo_id)
  where source_artvideo_id is not null;
create unique index if not exists equipment_models_artvideo_source_org_uidx
  on public.equipment_models (organization_id, source_artvideo_id)
  where source_artvideo_id is not null;
create unique index if not exists technical_fields_artvideo_source_org_uidx
  on public.technical_fields (organization_id, source_artvideo_id)
  where source_artvideo_id is not null;

comment on column public.equipment_types.source_artvideo_id is
  'ID do tipo de equipamento original da ArtVideo quando este registro é uma cópia compartilhada.';
comment on column public.equipment_brands.source_artvideo_id is
  'ID da marca original da ArtVideo quando este registro é uma cópia compartilhada.';
comment on column public.equipment_models.source_artvideo_id is
  'ID do modelo original da ArtVideo quando este registro é uma cópia compartilhada.';
comment on column public.technical_fields.source_artvideo_id is
  'ID do campo técnico original da ArtVideo quando este registro é uma cópia compartilhada.';

create or replace function private.artvideo_equipment_source_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization.id
  from public.organizations organization
  where coalesce((organization.settings ->> 'is_root')::boolean, false)
    and coalesce((organization.settings ->> 'is_platform_operator')::boolean, false)
  order by organization.created_at, organization.id
  limit 1;
$$;

revoke all on function private.artvideo_equipment_source_organization_id() from public;

create or replace function private.guard_artvideo_shared_equipment_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_root_organization_id uuid;
  v_syncing boolean;
begin
  v_root_organization_id := private.artvideo_equipment_source_organization_id();
  v_syncing := coalesce(current_setting('app.artvideo_equipment_sync', true), '') = 'on';

  if v_syncing then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.organization_id is distinct from v_root_organization_id
       and new.source_artvideo_id is not null then
      raise exception 'Cadastros compartilhados da ArtVideo são gerenciados somente pela ArtVideo.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.organization_id is distinct from v_root_organization_id
       and old.source_artvideo_id is not null then
      raise exception 'Este cadastro é compartilhado pela ArtVideo e não pode ser alterado nesta empresa.'
        using errcode = '42501';
    end if;

    if new.organization_id is distinct from v_root_organization_id
       and new.source_artvideo_id is not null
       and old.source_artvideo_id is null then
      raise exception 'A origem ArtVideo não pode ser definida manualmente.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.organization_id is distinct from v_root_organization_id
     and old.source_artvideo_id is not null then
    raise exception 'Este cadastro é compartilhado pela ArtVideo e não pode ser excluído nesta empresa.'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke all on function private.guard_artvideo_shared_equipment_row() from public;

drop trigger if exists equipment_types_guard_artvideo_shared on public.equipment_types;
create trigger equipment_types_guard_artvideo_shared
before insert or update or delete on public.equipment_types
for each row execute function private.guard_artvideo_shared_equipment_row();

drop trigger if exists equipment_brands_guard_artvideo_shared on public.equipment_brands;
create trigger equipment_brands_guard_artvideo_shared
before insert or update or delete on public.equipment_brands
for each row execute function private.guard_artvideo_shared_equipment_row();

drop trigger if exists equipment_models_guard_artvideo_shared on public.equipment_models;
create trigger equipment_models_guard_artvideo_shared
before insert or update or delete on public.equipment_models
for each row execute function private.guard_artvideo_shared_equipment_row();

drop trigger if exists technical_fields_guard_artvideo_shared on public.technical_fields;
create trigger technical_fields_guard_artvideo_shared
before insert or update or delete on public.technical_fields
for each row execute function private.guard_artvideo_shared_equipment_row();

create or replace function private.guard_artvideo_shared_equipment_field_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_equipment_type_id uuid;
  v_technical_field_id uuid;
  v_type_source uuid;
  v_field_source uuid;
begin
  if coalesce(current_setting('app.artvideo_equipment_sync', true), '') = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_equipment_type_id := old.equipment_type_id;
    v_technical_field_id := old.technical_field_id;
  else
    v_equipment_type_id := new.equipment_type_id;
    v_technical_field_id := new.technical_field_id;
  end if;

  select equipment_type.source_artvideo_id
    into v_type_source
  from public.equipment_types equipment_type
  where equipment_type.id = v_equipment_type_id;

  select technical_field.source_artvideo_id
    into v_field_source
  from public.technical_fields technical_field
  where technical_field.id = v_technical_field_id;

  if v_type_source is not null and v_field_source is not null then
    raise exception 'Os campos compartilhados pela ArtVideo são gerenciados somente pela ArtVideo.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_artvideo_shared_equipment_field_link() from public;

drop trigger if exists equipment_type_fields_guard_artvideo_shared
  on public.equipment_type_technical_fields;
create trigger equipment_type_fields_guard_artvideo_shared
before insert or update or delete on public.equipment_type_technical_fields
for each row execute function private.guard_artvideo_shared_equipment_field_link();

create or replace function private.sync_artvideo_equipment_catalog(
  p_target_organization_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_root_organization_id uuid;
  v_target record;
  v_target_suffix text;
begin
  v_root_organization_id := private.artvideo_equipment_source_organization_id();

  if v_root_organization_id is null then
    raise exception 'Organização raiz da ArtVideo não foi encontrada.'
      using errcode = 'P0002';
  end if;

  if p_target_organization_id = v_root_organization_id then
    return;
  end if;

  perform set_config('app.artvideo_equipment_sync', 'on', true);

  for v_target in
    select organization.id
    from public.organizations organization
    where organization.id <> v_root_organization_id
      and (
        p_target_organization_id is null
        or organization.id = p_target_organization_id
      )
    order by organization.created_at, organization.id
  loop
    v_target_suffix := left(replace(v_target.id::text, '-', ''), 8);

    insert into public.technical_fields (
      organization_id,
      field_key,
      label,
      field_type,
      is_active,
      sort_order,
      source_artvideo_id,
      created_at,
      updated_at
    )
    select
      v_target.id,
      source_field.field_key,
      source_field.label,
      source_field.field_type,
      source_field.is_active,
      source_field.sort_order,
      source_field.id,
      now(),
      now()
    from public.technical_fields source_field
    where source_field.organization_id = v_root_organization_id
      and source_field.source_artvideo_id is null
    on conflict (organization_id, source_artvideo_id)
      where source_artvideo_id is not null
    do update set
      field_key = excluded.field_key,
      label = excluded.label,
      field_type = excluded.field_type,
      is_active = excluded.is_active,
      sort_order = excluded.sort_order,
      updated_at = now();

    insert into public.equipment_types (
      organization_id,
      name,
      slug,
      is_active,
      sort_order,
      checklist_profile_id,
      source_artvideo_id,
      created_at,
      updated_at
    )
    select
      v_target.id,
      source_type.name,
      source_type.slug || '-av-' || v_target_suffix,
      source_type.is_active,
      source_type.sort_order,
      null,
      source_type.id,
      now(),
      now()
    from public.equipment_types source_type
    where source_type.organization_id = v_root_organization_id
      and source_type.source_artvideo_id is null
    on conflict (organization_id, source_artvideo_id)
      where source_artvideo_id is not null
    do update set
      name = excluded.name,
      slug = excluded.slug,
      is_active = excluded.is_active,
      sort_order = excluded.sort_order,
      updated_at = now();

    insert into public.equipment_brands (
      organization_id,
      equipment_type_id,
      name,
      slug,
      is_active,
      sort_order,
      source_artvideo_id,
      created_at,
      updated_at
    )
    select
      v_target.id,
      target_type.id,
      source_brand.name,
      source_brand.slug || '-av-' || v_target_suffix,
      source_brand.is_active,
      source_brand.sort_order,
      source_brand.id,
      now(),
      now()
    from public.equipment_brands source_brand
    join public.equipment_types target_type
      on target_type.organization_id = v_target.id
     and target_type.source_artvideo_id = source_brand.equipment_type_id
    where source_brand.organization_id = v_root_organization_id
      and source_brand.source_artvideo_id is null
    on conflict (organization_id, source_artvideo_id)
      where source_artvideo_id is not null
    do update set
      equipment_type_id = excluded.equipment_type_id,
      name = excluded.name,
      slug = excluded.slug,
      is_active = excluded.is_active,
      sort_order = excluded.sort_order,
      updated_at = now();

    insert into public.equipment_models (
      organization_id,
      equipment_brand_id,
      name,
      slug,
      is_active,
      sort_order,
      source_artvideo_id,
      created_at,
      updated_at
    )
    select
      v_target.id,
      target_brand.id,
      source_model.name,
      source_model.slug || '-av-' || v_target_suffix,
      source_model.is_active,
      source_model.sort_order,
      source_model.id,
      now(),
      now()
    from public.equipment_models source_model
    join public.equipment_brands target_brand
      on target_brand.organization_id = v_target.id
     and target_brand.source_artvideo_id = source_model.equipment_brand_id
    where source_model.organization_id = v_root_organization_id
      and source_model.source_artvideo_id is null
    on conflict (organization_id, source_artvideo_id)
      where source_artvideo_id is not null
    do update set
      equipment_brand_id = excluded.equipment_brand_id,
      name = excluded.name,
      slug = excluded.slug,
      is_active = excluded.is_active,
      sort_order = excluded.sort_order,
      updated_at = now();

    delete from public.equipment_type_technical_fields target_link
    using public.equipment_types target_type,
          public.technical_fields target_field
    where target_link.organization_id = v_target.id
      and target_type.id = target_link.equipment_type_id
      and target_type.organization_id = v_target.id
      and target_type.source_artvideo_id is not null
      and target_field.id = target_link.technical_field_id
      and target_field.organization_id = v_target.id
      and target_field.source_artvideo_id is not null
      and not exists (
        select 1
        from public.equipment_type_technical_fields source_link
        where source_link.organization_id = v_root_organization_id
          and source_link.equipment_type_id = target_type.source_artvideo_id
          and source_link.technical_field_id = target_field.source_artvideo_id
      );

    insert into public.equipment_type_technical_fields (
      organization_id,
      equipment_type_id,
      technical_field_id,
      required,
      sort_order,
      created_at,
      updated_at
    )
    select
      v_target.id,
      target_type.id,
      target_field.id,
      source_link.required,
      source_link.sort_order,
      now(),
      now()
    from public.equipment_type_technical_fields source_link
    join public.equipment_types target_type
      on target_type.organization_id = v_target.id
     and target_type.source_artvideo_id = source_link.equipment_type_id
    join public.technical_fields target_field
      on target_field.organization_id = v_target.id
     and target_field.source_artvideo_id = source_link.technical_field_id
    where source_link.organization_id = v_root_organization_id
    on conflict (equipment_type_id, technical_field_id)
    do update set
      organization_id = excluded.organization_id,
      required = excluded.required,
      sort_order = excluded.sort_order,
      updated_at = now();

    update public.equipment_models target_model
    set is_active = false,
        updated_at = now()
    where target_model.organization_id = v_target.id
      and target_model.source_artvideo_id is not null
      and not exists (
        select 1
        from public.equipment_models source_model
        where source_model.id = target_model.source_artvideo_id
          and source_model.organization_id = v_root_organization_id
          and source_model.source_artvideo_id is null
      );

    update public.equipment_brands target_brand
    set is_active = false,
        updated_at = now()
    where target_brand.organization_id = v_target.id
      and target_brand.source_artvideo_id is not null
      and not exists (
        select 1
        from public.equipment_brands source_brand
        where source_brand.id = target_brand.source_artvideo_id
          and source_brand.organization_id = v_root_organization_id
          and source_brand.source_artvideo_id is null
      );

    update public.equipment_types target_type
    set is_active = false,
        updated_at = now()
    where target_type.organization_id = v_target.id
      and target_type.source_artvideo_id is not null
      and not exists (
        select 1
        from public.equipment_types source_type
        where source_type.id = target_type.source_artvideo_id
          and source_type.organization_id = v_root_organization_id
          and source_type.source_artvideo_id is null
      );

    update public.technical_fields target_field
    set is_active = false,
        updated_at = now()
    where target_field.organization_id = v_target.id
      and target_field.source_artvideo_id is not null
      and not exists (
        select 1
        from public.technical_fields source_field
        where source_field.id = target_field.source_artvideo_id
          and source_field.organization_id = v_root_organization_id
          and source_field.source_artvideo_id is null
      );
  end loop;

  perform set_config('app.artvideo_equipment_sync', 'off', true);
end;
$$;

revoke all on function private.sync_artvideo_equipment_catalog(uuid) from public;

create or replace function private.sync_artvideo_equipment_catalog_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_root_organization_id uuid;
  v_changed_organization_id uuid;
begin
  v_root_organization_id := private.artvideo_equipment_source_organization_id();

  if tg_op = 'DELETE' then
    v_changed_organization_id := old.organization_id;
  else
    v_changed_organization_id := new.organization_id;
  end if;

  if v_changed_organization_id = v_root_organization_id then
    perform private.sync_artvideo_equipment_catalog(null);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_artvideo_equipment_catalog_change() from public;

drop trigger if exists equipment_types_sync_artvideo_catalog on public.equipment_types;
create trigger equipment_types_sync_artvideo_catalog
after insert or update or delete on public.equipment_types
for each row execute function private.sync_artvideo_equipment_catalog_change();

drop trigger if exists equipment_brands_sync_artvideo_catalog on public.equipment_brands;
create trigger equipment_brands_sync_artvideo_catalog
after insert or update or delete on public.equipment_brands
for each row execute function private.sync_artvideo_equipment_catalog_change();

drop trigger if exists equipment_models_sync_artvideo_catalog on public.equipment_models;
create trigger equipment_models_sync_artvideo_catalog
after insert or update or delete on public.equipment_models
for each row execute function private.sync_artvideo_equipment_catalog_change();

drop trigger if exists technical_fields_sync_artvideo_catalog on public.technical_fields;
create trigger technical_fields_sync_artvideo_catalog
after insert or update or delete on public.technical_fields
for each row execute function private.sync_artvideo_equipment_catalog_change();

drop trigger if exists equipment_type_fields_sync_artvideo_catalog
  on public.equipment_type_technical_fields;
create trigger equipment_type_fields_sync_artvideo_catalog
after insert or update or delete on public.equipment_type_technical_fields
for each row execute function private.sync_artvideo_equipment_catalog_change();

create or replace function private.sync_artvideo_equipment_catalog_new_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_root_organization_id uuid;
begin
  v_root_organization_id := private.artvideo_equipment_source_organization_id();

  if v_root_organization_id is not null
     and new.id <> v_root_organization_id then
    perform private.sync_artvideo_equipment_catalog(new.id);
  end if;

  return new;
end;
$$;

revoke all on function private.sync_artvideo_equipment_catalog_new_organization() from public;

drop trigger if exists organizations_sync_artvideo_equipment_catalog
  on public.organizations;
create trigger organizations_sync_artvideo_equipment_catalog
after insert on public.organizations
for each row execute function private.sync_artvideo_equipment_catalog_new_organization();

select private.sync_artvideo_equipment_catalog(null);

commit;
