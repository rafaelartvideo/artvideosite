-- Torna as cópias do catálogo técnico da ArtVideo independentes nas empresas parceiras.
-- A ArtVideo continua enviando novos equipamentos, marcas, modelos, campos e vínculos.
-- As empresas destino podem editar suas cópias e nenhuma alteração delas retorna à ArtVideo.

begin;

select pg_advisory_xact_lock(hashtextextended('artvideo:shared_equipment_catalog', 0));

comment on column public.equipment_types.source_artvideo_id is
  'Mapeamento interno para a origem ArtVideo. A cópia pertence à empresa destino e pode ser editada independentemente.';
comment on column public.equipment_brands.source_artvideo_id is
  'Mapeamento interno para a origem ArtVideo. A cópia pertence à empresa destino e pode ser editada independentemente.';
comment on column public.equipment_models.source_artvideo_id is
  'Mapeamento interno para a origem ArtVideo. A cópia pertence à empresa destino e pode ser editada independentemente.';
comment on column public.technical_fields.source_artvideo_id is
  'Mapeamento interno para a origem ArtVideo. A cópia pertence à empresa destino e pode ser editada independentemente.';

create or replace function private.guard_artvideo_shared_equipment_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.artvideo_equipment_sync', true), '') = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.source_artvideo_id is not null then
      raise exception 'A origem ArtVideo é controlada internamente e não pode ser definida manualmente.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.source_artvideo_id is distinct from old.source_artvideo_id then
      raise exception 'A origem ArtVideo é um vínculo interno e não pode ser alterada manualmente.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  return old;
end;
$$;

revoke all on function private.guard_artvideo_shared_equipment_row() from public;

drop trigger if exists equipment_type_fields_guard_artvideo_shared
  on public.equipment_type_technical_fields;
drop function if exists private.guard_artvideo_shared_equipment_field_link();

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
    raise exception 'Organização raiz da ArtVideo não foi encontrada.' using errcode = 'P0002';
  end if;

  if p_target_organization_id = v_root_organization_id then return; end if;

  perform set_config('app.artvideo_equipment_sync', 'on', true);

  for v_target in
    select organization.id
    from public.organizations organization
    where organization.id <> v_root_organization_id
      and (p_target_organization_id is null or organization.id = p_target_organization_id)
    order by organization.created_at, organization.id
  loop
    v_target_suffix := left(replace(v_target.id::text, '-', ''), 8);

    insert into public.technical_fields (
      organization_id, field_key, label, field_type, is_active, sort_order,
      source_artvideo_id, created_at, updated_at
    )
    select
      v_target.id,
      case
        when exists (
          select 1 from public.technical_fields existing_field
          where existing_field.organization_id = v_target.id
            and existing_field.field_key = source_field.field_key
            and existing_field.source_artvideo_id is distinct from source_field.id
        )
        then source_field.field_key || '_av_' || left(replace(source_field.id::text, '-', ''), 8)
        else source_field.field_key
      end,
      source_field.label, source_field.field_type, source_field.is_active,
      source_field.sort_order, source_field.id, now(), now()
    from public.technical_fields source_field
    where source_field.organization_id = v_root_organization_id
      and source_field.source_artvideo_id is null
    on conflict (organization_id, source_artvideo_id)
      where source_artvideo_id is not null
    do nothing;

    insert into public.equipment_types (
      organization_id, name, slug, is_active, sort_order, checklist_profile_id,
      source_artvideo_id, created_at, updated_at
    )
    select
      v_target.id, source_type.name,
      source_type.slug || '-av-' || v_target_suffix || '-' || left(replace(source_type.id::text, '-', ''), 8),
      source_type.is_active, source_type.sort_order, null, source_type.id, now(), now()
    from public.equipment_types source_type
    where source_type.organization_id = v_root_organization_id
      and source_type.source_artvideo_id is null
    on conflict (organization_id, source_artvideo_id)
      where source_artvideo_id is not null
    do nothing;

    insert into public.equipment_brands (
      organization_id, equipment_type_id, name, slug, is_active, sort_order,
      source_artvideo_id, created_at, updated_at
    )
    select
      v_target.id, target_type.id, source_brand.name,
      source_brand.slug || '-av-' || v_target_suffix || '-' || left(replace(source_brand.id::text, '-', ''), 8),
      source_brand.is_active, source_brand.sort_order, source_brand.id, now(), now()
    from public.equipment_brands source_brand
    join public.equipment_types target_type
      on target_type.organization_id = v_target.id
     and target_type.source_artvideo_id = source_brand.equipment_type_id
    where source_brand.organization_id = v_root_organization_id
      and source_brand.source_artvideo_id is null
    on conflict (organization_id, source_artvideo_id)
      where source_artvideo_id is not null
    do nothing;

    insert into public.equipment_models (
      organization_id, equipment_brand_id, name, slug, is_active, sort_order,
      source_artvideo_id, created_at, updated_at
    )
    select
      v_target.id, target_brand.id, source_model.name,
      source_model.slug || '-av-' || v_target_suffix || '-' || left(replace(source_model.id::text, '-', ''), 8),
      source_model.is_active, source_model.sort_order, source_model.id, now(), now()
    from public.equipment_models source_model
    join public.equipment_brands target_brand
      on target_brand.organization_id = v_target.id
     and target_brand.source_artvideo_id = source_model.equipment_brand_id
    where source_model.organization_id = v_root_organization_id
      and source_model.source_artvideo_id is null
    on conflict (organization_id, source_artvideo_id)
      where source_artvideo_id is not null
    do nothing;

    insert into public.equipment_type_technical_fields (
      organization_id, equipment_type_id, technical_field_id, required, sort_order,
      created_at, updated_at
    )
    select
      v_target.id, target_type.id, target_field.id,
      source_link.required, source_link.sort_order, now(), now()
    from public.equipment_type_technical_fields source_link
    join public.equipment_types target_type
      on target_type.organization_id = v_target.id
     and target_type.source_artvideo_id = source_link.equipment_type_id
    join public.technical_fields target_field
      on target_field.organization_id = v_target.id
     and target_field.source_artvideo_id = source_link.technical_field_id
    where source_link.organization_id = v_root_organization_id
    on conflict (equipment_type_id, technical_field_id)
    do nothing;
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
  v_target record;
  v_target_suffix text;
begin
  v_root_organization_id := private.artvideo_equipment_source_organization_id();

  if new.organization_id is distinct from v_root_organization_id then return new; end if;

  perform set_config('app.artvideo_equipment_sync', 'on', true);

  for v_target in
    select organization.id
    from public.organizations organization
    where organization.id <> v_root_organization_id
    order by organization.created_at, organization.id
  loop
    v_target_suffix := left(replace(v_target.id::text, '-', ''), 8);

    if tg_table_name = 'equipment_types' then
      insert into public.equipment_types (
        organization_id, name, slug, is_active, sort_order, checklist_profile_id,
        source_artvideo_id, created_at, updated_at
      )
      values (
        v_target.id, new.name,
        new.slug || '-av-' || v_target_suffix || '-' || left(replace(new.id::text, '-', ''), 8),
        new.is_active, new.sort_order, null, new.id, now(), now()
      )
      on conflict (organization_id, source_artvideo_id)
        where source_artvideo_id is not null
      do nothing;

    elsif tg_table_name = 'technical_fields' then
      insert into public.technical_fields (
        organization_id, field_key, label, field_type, is_active, sort_order,
        source_artvideo_id, created_at, updated_at
      )
      values (
        v_target.id,
        case
          when exists (
            select 1 from public.technical_fields existing_field
            where existing_field.organization_id = v_target.id
              and existing_field.field_key = new.field_key
          )
          then new.field_key || '_av_' || left(replace(new.id::text, '-', ''), 8)
          else new.field_key
        end,
        new.label, new.field_type, new.is_active, new.sort_order, new.id, now(), now()
      )
      on conflict (organization_id, source_artvideo_id)
        where source_artvideo_id is not null
      do nothing;

    elsif tg_table_name = 'equipment_brands' then
      insert into public.equipment_brands (
        organization_id, equipment_type_id, name, slug, is_active, sort_order,
        source_artvideo_id, created_at, updated_at
      )
      select
        v_target.id, target_type.id, new.name,
        new.slug || '-av-' || v_target_suffix || '-' || left(replace(new.id::text, '-', ''), 8),
        new.is_active, new.sort_order, new.id, now(), now()
      from public.equipment_types target_type
      where target_type.organization_id = v_target.id
        and target_type.source_artvideo_id = new.equipment_type_id
      on conflict (organization_id, source_artvideo_id)
        where source_artvideo_id is not null
      do nothing;

    elsif tg_table_name = 'equipment_models' then
      insert into public.equipment_models (
        organization_id, equipment_brand_id, name, slug, is_active, sort_order,
        source_artvideo_id, created_at, updated_at
      )
      select
        v_target.id, target_brand.id, new.name,
        new.slug || '-av-' || v_target_suffix || '-' || left(replace(new.id::text, '-', ''), 8),
        new.is_active, new.sort_order, new.id, now(), now()
      from public.equipment_brands target_brand
      where target_brand.organization_id = v_target.id
        and target_brand.source_artvideo_id = new.equipment_brand_id
      on conflict (organization_id, source_artvideo_id)
        where source_artvideo_id is not null
      do nothing;

    elsif tg_table_name = 'equipment_type_technical_fields' then
      insert into public.equipment_type_technical_fields (
        organization_id, equipment_type_id, technical_field_id, required, sort_order,
        created_at, updated_at
      )
      select
        v_target.id, target_type.id, target_field.id,
        new.required, new.sort_order, now(), now()
      from public.equipment_types target_type
      join public.technical_fields target_field
        on target_field.organization_id = v_target.id
       and target_field.source_artvideo_id = new.technical_field_id
      where target_type.organization_id = v_target.id
        and target_type.source_artvideo_id = new.equipment_type_id
      on conflict (equipment_type_id, technical_field_id)
      do nothing;
    end if;
  end loop;

  perform set_config('app.artvideo_equipment_sync', 'off', true);
  return new;
end;
$$;

revoke all on function private.sync_artvideo_equipment_catalog_change() from public;

drop trigger if exists equipment_types_sync_artvideo_catalog on public.equipment_types;
create trigger equipment_types_sync_artvideo_catalog
after insert on public.equipment_types
for each row execute function private.sync_artvideo_equipment_catalog_change();

drop trigger if exists equipment_brands_sync_artvideo_catalog on public.equipment_brands;
create trigger equipment_brands_sync_artvideo_catalog
after insert on public.equipment_brands
for each row execute function private.sync_artvideo_equipment_catalog_change();

drop trigger if exists equipment_models_sync_artvideo_catalog on public.equipment_models;
create trigger equipment_models_sync_artvideo_catalog
after insert on public.equipment_models
for each row execute function private.sync_artvideo_equipment_catalog_change();

drop trigger if exists technical_fields_sync_artvideo_catalog on public.technical_fields;
create trigger technical_fields_sync_artvideo_catalog
after insert on public.technical_fields
for each row execute function private.sync_artvideo_equipment_catalog_change();

drop trigger if exists equipment_type_fields_sync_artvideo_catalog on public.equipment_type_technical_fields;
create trigger equipment_type_fields_sync_artvideo_catalog
after insert on public.equipment_type_technical_fields
for each row execute function private.sync_artvideo_equipment_catalog_change();

commit;
