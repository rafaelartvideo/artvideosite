-- Union World: nomes oficiais sincronizados automaticamente, sem aceite das parceiras.
-- Apenas registros explicitamente vinculados ao catálogo oficial são afetados.
-- Os IDs, slugs, modelos, campos, checklists e histórico das OS permanecem intactos.

alter table public.organization_catalog_equipment_links
  add column if not exists synced_at timestamptz;
alter table public.organization_catalog_brand_links
  add column if not exists synced_at timestamptz;

update public.organization_catalog_equipment_links
  set synced_at = coalesce(synced_at, reviewed_at, created_at)
  where synced_at is null;
update public.organization_catalog_brand_links
  set synced_at = coalesce(synced_at, reviewed_at, created_at)
  where synced_at is null;

create or replace function private.sync_union_catalog_official_name()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_conflicting_company text;
begin
  if new.name is not distinct from old.name then
    return new;
  end if;

  if tg_table_name = 'catalog_equipment_types' then
    -- Bloqueia o renomeio antes de propagar caso gere nomes duplicados em uma empresa.
    select o.name into v_conflicting_company
      from public.organization_catalog_equipment_links l
      join public.equipment_types local_type
        on local_type.id = l.equipment_type_id and local_type.organization_id = l.organization_id
      join public.equipment_types conflict_type
        on conflict_type.organization_id = l.organization_id
       and conflict_type.id <> local_type.id
       and lower(public.normalize_visual_text(conflict_type.name)) =
           lower(public.normalize_visual_text(new.name))
      join public.organizations o on o.id = l.organization_id
      where l.catalog_equipment_type_id = new.id
      limit 1;

    if v_conflicting_company is not null then
      raise exception
        'Não foi possível sincronizar o equipamento "%": já existe outro cadastro com esse nome na empresa "%". Resolva a duplicação antes de salvar.',
        new.name, v_conflicting_company
        using errcode = '22023';
    end if;

    update public.equipment_types local_type
      set name = new.name, updated_at = now()
      from public.organization_catalog_equipment_links l
      where l.catalog_equipment_type_id = new.id
        and l.equipment_type_id = local_type.id
        and l.organization_id = local_type.organization_id
        and local_type.name is distinct from new.name;

    update public.organization_catalog_equipment_links l
      set official_name_snapshot = new.name, synced_at = now()
      where l.catalog_equipment_type_id = new.id;

  elsif tg_table_name = 'catalog_brands' then
    select o.name into v_conflicting_company
      from public.organization_catalog_brand_links l
      join public.equipment_brands local_brand
        on local_brand.id = l.equipment_brand_id
       and local_brand.organization_id = l.organization_id
      join public.equipment_brands conflict_brand
        on conflict_brand.organization_id = l.organization_id
       and conflict_brand.equipment_type_id = local_brand.equipment_type_id
       and conflict_brand.id <> local_brand.id
       and lower(public.normalize_visual_text(conflict_brand.name)) =
           lower(public.normalize_visual_text(new.name))
      join public.organizations o on o.id = l.organization_id
      where l.catalog_brand_id = new.id
      limit 1;

    if v_conflicting_company is not null then
      raise exception
        'Não foi possível sincronizar a marca "%": já existe outra marca com esse nome no mesmo equipamento da empresa "%". Resolva a duplicação antes de salvar.',
        new.name, v_conflicting_company
        using errcode = '22023';
    end if;

    update public.equipment_brands local_brand
      set name = new.name, updated_at = now()
      from public.organization_catalog_brand_links l
      where l.catalog_brand_id = new.id
        and l.equipment_brand_id = local_brand.id
        and l.organization_id = local_brand.organization_id
        and local_brand.name is distinct from new.name;

    update public.organization_catalog_brand_links l
      set official_name_snapshot = new.name, synced_at = now()
      where l.catalog_brand_id = new.id;

  else
    raise exception 'Tabela não reconhecida para sincronização automática.';
  end if;

  return new;
end;
$$;

drop trigger if exists union_catalog_equipment_auto_name_sync
  on public.catalog_equipment_types;
create trigger union_catalog_equipment_auto_name_sync
after update of name on public.catalog_equipment_types
for each row
when (old.name is distinct from new.name)
execute function private.sync_union_catalog_official_name();

drop trigger if exists union_catalog_brand_auto_name_sync
  on public.catalog_brands;
create trigger union_catalog_brand_auto_name_sync
after update of name on public.catalog_brands
for each row
when (old.name is distinct from new.name)
execute function private.sync_union_catalog_official_name();

-- Remove os endpoints de aprovação manual descontinuados; mantém os snapshots para auditoria.
drop function if exists public.review_company_catalog_name_update_v1(uuid,text,uuid,uuid,text);
drop function if exists public.load_company_catalog_name_updates_v1(uuid);

comment on function private.sync_union_catalog_official_name() is
'Propaga alterações do nome oficial, na mesma transação, exclusivamente aos registros vinculados de cada empresa. Conflitos impedem o salvamento e não deixam alterações parciais.';
