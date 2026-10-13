-- Remover a categoria redundante "Tv 85 Polegadas" na Artvideo.
-- O modelo real 85QNED70BSA já foi movido para Televisor > LG.
-- Só exclui se não houver OS/cliente/checklist/captura nem modelo dependente.
do $$
declare
  v_previous text:=current_setting('app.union_catalog_automatic',true);
  v_type_id uuid;
begin
  perform set_config('app.union_catalog_automatic','on',true);
  select t.id into v_type_id from public.equipment_types t
  where t.organization_id='00000000-0000-4000-8000-000000000001'
    and t.name='Tv 85 Polegadas';
  if v_type_id is not null then
    if exists(select 1 from public.equipment_models m
       join public.equipment_brands b on b.id=m.equipment_brand_id
       where b.equipment_type_id=v_type_id)
      or exists(select 1 from public.service_orders so where so.equipment_type_id=v_type_id)
      or exists(select 1 from public.customer_equipments ce where ce.equipment_type_id=v_type_id)
      or exists(select 1 from public.service_order_checklists sc where sc.equipment_type_id=v_type_id)
      or exists(select 1 from public.device_capture_sessions d where d.equipment_type_id=v_type_id)
      or exists(select 1 from public.organization_catalog_equipment_links l where l.equipment_type_id=v_type_id)
    then
      raise exception 'A categoria redundante ainda possui dependências e não pode ser excluída.';
    end if;
    delete from public.equipment_brands
      where equipment_type_id=v_type_id
        and organization_id='00000000-0000-4000-8000-000000000001'
        and not exists(select 1 from public.service_orders so where so.equipment_brand_id=public.equipment_brands.id)
        and not exists(select 1 from public.customer_equipments ce where ce.equipment_brand_id=public.equipment_brands.id);
    delete from public.equipment_type_technical_fields
      where equipment_type_id=v_type_id;
    delete from public.equipment_types
      where id=v_type_id and organization_id='00000000-0000-4000-8000-000000000001'
        and not exists(select 1 from public.equipment_brands b where b.equipment_type_id=v_type_id);
  end if;
  perform set_config('app.union_catalog_automatic',coalesce(v_previous,''),true);
exception when others then
  perform set_config('app.union_catalog_automatic',coalesce(v_previous,''),true);
  raise;
end $$;
