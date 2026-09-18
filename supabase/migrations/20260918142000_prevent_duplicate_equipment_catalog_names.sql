-- Impede nomes duplicados no catálogo de equipamentos e torna o compartilhamento
-- ArtVideo -> parceiras tolerante a cadastros já existentes, sem sobrescrevê-los.

begin;

select pg_advisory_xact_lock(hashtextextended('artvideo:shared_equipment_catalog', 0));

delete from public.equipment_models duplicate_model
using (
  select id
  from (
    select
      model.id,
      row_number() over (
        partition by model.organization_id,
                     model.equipment_brand_id,
                     lower(public.normalize_visual_text(model.name))
        order by model.created_at, model.id
      ) as rn
    from public.equipment_models model
  ) ranked
  where ranked.rn > 1
) duplicates
where duplicate_model.id = duplicates.id
  and not exists (
    select 1 from public.service_orders service_order
    where service_order.equipment_model_id = duplicate_model.id
  )
  and not exists (
    select 1 from public.customer_equipments customer_equipment
    where customer_equipment.equipment_model_id = duplicate_model.id
  );

do $$
begin
  if exists (
    select 1
    from public.equipment_types equipment_type
    group by equipment_type.organization_id,
             lower(public.normalize_visual_text(equipment_type.name))
    having count(*) > 1
  ) then
    raise exception 'Existem equipamentos duplicados que precisam ser consolidados antes de criar a restrição de unicidade.'
      using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.equipment_brands equipment_brand
    group by equipment_brand.organization_id,
             equipment_brand.equipment_type_id,
             lower(public.normalize_visual_text(equipment_brand.name))
    having count(*) > 1
  ) then
    raise exception 'Existem marcas duplicadas que precisam ser consolidadas antes de criar a restrição de unicidade.'
      using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.equipment_models equipment_model
    group by equipment_model.organization_id,
             equipment_model.equipment_brand_id,
             lower(public.normalize_visual_text(equipment_model.name))
    having count(*) > 1
  ) then
    raise exception 'Existem modelos duplicados referenciados que precisam ser consolidados antes de criar a restrição de unicidade.'
      using errcode = '23505';
  end if;
end;
$$;

create unique index if not exists equipment_types_organization_name_uidx
  on public.equipment_types (
    organization_id,
    lower(public.normalize_visual_text(name))
  );

create unique index if not exists equipment_brands_type_name_uidx
  on public.equipment_brands (
    organization_id,
    equipment_type_id,
    lower(public.normalize_visual_text(name))
  );

create unique index if not exists equipment_models_brand_name_uidx
  on public.equipment_models (
    organization_id,
    equipment_brand_id,
    lower(public.normalize_visual_text(name))
  );

comment on index public.equipment_types_organization_name_uidx is
  'Impede equipamentos com o mesmo nome normalizado dentro da mesma empresa.';
comment on index public.equipment_brands_type_name_uidx is
  'Impede marcas com o mesmo nome normalizado dentro do mesmo equipamento e empresa.';
comment on index public.equipment_models_brand_name_uidx is
  'Impede modelos com o mesmo nome normalizado dentro da mesma marca e empresa.';

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

    update public.technical_fields target_field
       set source_artvideo_id = source_field.id
      from public.technical_fields source_field
     where source_field.organization_id = v_root_organization_id
       and source_field.source_artvideo_id is null
       and target_field.organization_id = v_target.id
       and target_field.source_artvideo_id is null
       and target_field.field_key = source_field.field_key
       and not exists (
         select 1
         from public.technical_fields mapped_field
         where mapped_field.organization_id = v_target.id
           and mapped_field.source_artvideo_id = source_field.id
       );

    insert into public.technical_fields (
      organization_id, field_key, label, field_type, is_active, sort_order,
      source_artvideo_id, created_at, updated_at
    )
    select
      v_target.id, source_field.field_key, source_field.label,
      source_field.field_type, source_field.is_active, source_field.sort_order,
      source_field.id, now(), now()
    from public.technical_fields source_field
    where source_field.organization_id = v_root_organization_id
      and source_field.source_artvideo_id is null
      and not exists (
        select 1
        from public.technical_fields target_field
        where target_field.organization_id = v_target.id
          and (
            target_field.source_artvideo_id = source_field.id
            or target_field.field_key = source_field.field_key
          )
      )
    on conflict do nothing;

    update public.equipment_types target_type
       set source_artvideo_id = source_type.id
      from public.equipment_types source_type
     where source_type.organization_id = v_root_organization_id
       and source_type.source_artvideo_id is null
       and target_type.organization_id = v_target.id
       and target_type.source_artvideo_id is null
       and lower(public.normalize_visual_text(target_type.name))
           = lower(public.normalize_visual_text(source_type.name))
       and not exists (
         select 1
         from public.equipment_types mapped_type
         where mapped_type.organization_id = v_target.id
           and mapped_type.source_artvideo_id = source_type.id
       );

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
      and not exists (
        select 1
        from public.equipment_types target_type
        where target_type.organization_id = v_target.id
          and (
            target_type.source_artvideo_id = source_type.id
            or lower(public.normalize_visual_text(target_type.name))
               = lower(public.normalize_visual_text(source_type.name))
          )
      )
    on conflict do nothing;

    update public.equipment_brands target_brand
       set source_artvideo_id = source_brand.id
      from public.equipment_brands source_brand
      join public.equipment_types target_type
        on target_type.organization_id = v_target.id
       and target_type.source_artvideo_id = source_brand.equipment_type_id
     where source_brand.organization_id = v_root_organization_id
       and source_brand.source_artvideo_id is null
       and target_brand.organization_id = v_target.id
       and target_brand.equipment_type_id = target_type.id
       and target_brand.source_artvideo_id is null
       and lower(public.normalize_visual_text(target_brand.name))
           = lower(public.normalize_visual_text(source_brand.name))
       and not exists (
         select 1
         from public.equipment_brands mapped_brand
         where mapped_brand.organization_id = v_target.id
           and mapped_brand.source_artvideo_id = source_brand.id
       );

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
      and not exists (
        select 1
        from public.equipment_brands target_brand
        where target_brand.organization_id = v_target.id
          and target_brand.equipment_type_id = target_type.id
          and (
            target_brand.source_artvideo_id = source_brand.id
            or lower(public.normalize_visual_text(target_brand.name))
               = lower(public.normalize_visual_text(source_brand.name))
          )
      )
    on conflict do nothing;

    update public.equipment_models target_model
       set source_artvideo_id = source_model.id
      from public.equipment_models source_model
      join public.equipment_brands target_brand
        on target_brand.organization_id = v_target.id
       and target_brand.source_artvideo_id = source_model.equipment_brand_id
     where source_model.organization_id = v_root_organization_id
       and source_model.source_artvideo_id is null
       and target_model.organization_id = v_target.id
       and target_model.equipment_brand_id = target_brand.id
       and target_model.source_artvideo_id is null
       and lower(public.normalize_visual_text(target_model.name))
           = lower(public.normalize_visual_text(source_model.name))
       and not exists (
         select 1
         from public.equipment_models mapped_model
         where mapped_model.organization_id = v_target.id
           and mapped_model.source_artvideo_id = source_model.id
       );

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
      and not exists (
        select 1
        from public.equipment_models target_model
        where target_model.organization_id = v_target.id
          and target_model.equipment_brand_id = target_brand.id
          and (
            target_model.source_artvideo_id = source_model.id
            or lower(public.normalize_visual_text(target_model.name))
               = lower(public.normalize_visual_text(source_model.name))
          )
      )
    on conflict do nothing;

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
begin
  v_root_organization_id := private.artvideo_equipment_source_organization_id();

  if new.organization_id = v_root_organization_id then
    perform private.sync_artvideo_equipment_catalog(null);
  end if;

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

drop trigger if exists equipment_type_fields_sync_artvideo_catalog
  on public.equipment_type_technical_fields;
create trigger equipment_type_fields_sync_artvideo_catalog
after insert on public.equipment_type_technical_fields
for each row execute function private.sync_artvideo_equipment_catalog_change();

select private.sync_artvideo_equipment_catalog(null);

commit;
