begin;
-- Se o equipamento de uma OS mudar, descartar o codigo que pertencia ao aparelho anterior.
create or replace function private.discard_unlock_on_equipment_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.equipment_type_id is distinct from new.equipment_type_id
     or old.equipment_brand_id is distinct from new.equipment_brand_id
     or old.equipment_model_id is distinct from new.equipment_model_id then
    delete from private.service_order_device_unlocks where service_order_id=new.id;
  end if;
  return new;
end $$;
drop trigger if exists service_order_unlock_equipment_guard on public.service_orders;
create trigger service_order_unlock_equipment_guard
after update of equipment_type_id,equipment_brand_id,equipment_model_id
on public.service_orders
for each row execute function private.discard_unlock_on_equipment_change();
commit;