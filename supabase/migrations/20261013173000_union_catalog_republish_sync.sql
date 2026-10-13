-- Um item despublicado pode ser editado livremente sem alterar as empresas.
-- Ao republicar, o nome oficial mais recente é propagado atomicamente.
create or replace function private.sync_union_catalog_official_name()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_conflicting_company text;
begin
  if not new.is_published then
    return new;
  end if;
  if new.name is not distinct from old.name and old.is_published then
    return new;
  end if;

  if tg_table_name='catalog_equipment_types' then
    select o.name into v_conflicting_company
    from public.organization_catalog_equipment_links l
    join public.equipment_types local_type on local_type.id=l.equipment_type_id
      and local_type.organization_id=l.organization_id
    join public.equipment_types conflict_type on conflict_type.organization_id=l.organization_id
      and conflict_type.id <> local_type.id
      and lower(public.normalize_visual_text(conflict_type.name))=
          lower(public.normalize_visual_text(new.name))
    join public.organizations o on o.id=l.organization_id
    where l.catalog_equipment_type_id=new.id
    limit 1;

    if v_conflicting_company is not null then
      raise exception 'Nome oficial "%" já existe em outro equipamento da empresa "%". Corrija o conflito antes de publicar.',new.name,v_conflicting_company
      using errcode='22023';
    end if;
    update public.equipment_types local_type
      set name=new.name,updated_at=now()
      from public.organization_catalog_equipment_links l
      where l.catalog_equipment_type_id=new.id
        and l.equipment_type_id=local_type.id
        and l.organization_id=local_type.organization_id
        and local_type.name is distinct from new.name;
    update public.organization_catalog_equipment_links l
      set official_name_snapshot=new.name,synced_at=now()
      where l.catalog_equipment_type_id=new.id;

  elsif tg_table_name='catalog_brands' then
    select o.name into v_conflicting_company
    from public.organization_catalog_brand_links l
    join public.equipment_brands local_brand on local_brand.id=l.equipment_brand_id
      and local_brand.organization_id=l.organization_id
    join public.equipment_brands conflict_brand on conflict_brand.organization_id=l.organization_id
      and conflict_brand.equipment_type_id=local_brand.equipment_type_id
      and conflict_brand.id <> local_brand.id
      and lower(public.normalize_visual_text(conflict_brand.name))=
          lower(public.normalize_visual_text(new.name))
    join public.organizations o on o.id=l.organization_id
    where l.catalog_brand_id=new.id
    limit 1;

    if v_conflicting_company is not null then
      raise exception 'Marca "%" já existe no mesmo equipamento da empresa "%". Corrija o conflito antes de publicar.',new.name,v_conflicting_company
      using errcode='22023';
    end if;
    update public.equipment_brands local_brand
      set name=new.name,updated_at=now()
      from public.organization_catalog_brand_links l
      where l.catalog_brand_id=new.id
        and l.equipment_brand_id=local_brand.id
        and l.organization_id=local_brand.organization_id
        and local_brand.name is distinct from new.name;
    update public.organization_catalog_brand_links l
      set official_name_snapshot=new.name,synced_at=now()
      where l.catalog_brand_id=new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists union_catalog_equipment_auto_name_sync on public.catalog_equipment_types;
create trigger union_catalog_equipment_auto_name_sync
after update of name,is_published on public.catalog_equipment_types
for each row when (
  old.name is distinct from new.name
  or old.is_published is distinct from new.is_published
) execute function private.sync_union_catalog_official_name();

drop trigger if exists union_catalog_brand_auto_name_sync on public.catalog_brands;
create trigger union_catalog_brand_auto_name_sync
after update of name,is_published on public.catalog_brands
for each row when (
  old.name is distinct from new.name
  or old.is_published is distinct from new.is_published
) execute function private.sync_union_catalog_official_name();
