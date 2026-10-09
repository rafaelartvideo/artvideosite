-- Normaliza nomes de modelos em todo o catálogo e nos registros de equipamentos.
-- Mantém IDs, marcas, slugs, relacionamentos, serial e demais dados inalterados.
create or replace function private.uppercase_equipment_model_names()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'equipment_models' then
    new.name := upper(btrim(new.name));
  elsif tg_table_name = 'customer_equipments' then
    new.equipment_model_name := upper(btrim(new.equipment_model_name));
  elsif tg_table_name = 'service_orders' then
    new.model := upper(btrim(new.model));
  end if;
  return new;
end;
$$;

revoke all on function private.uppercase_equipment_model_names() from public;

drop trigger if exists equipment_models_uppercase_name on public.equipment_models;
create trigger equipment_models_uppercase_name
before insert or update of name on public.equipment_models
for each row execute function private.uppercase_equipment_model_names();

drop trigger if exists customer_equipments_uppercase_model_name on public.customer_equipments;
create trigger customer_equipments_uppercase_model_name
before insert or update of equipment_model_name on public.customer_equipments
for each row execute function private.uppercase_equipment_model_names();

drop trigger if exists service_orders_uppercase_model_name on public.service_orders;
create trigger service_orders_uppercase_model_name
before insert or update of model on public.service_orders
for each row execute function private.uppercase_equipment_model_names();

update public.equipment_models
set name = upper(btrim(name))
where name is distinct from upper(btrim(name));

update public.customer_equipments
set equipment_model_name = upper(btrim(equipment_model_name))
where equipment_model_name is distinct from upper(btrim(equipment_model_name));

update public.service_orders
set model = upper(btrim(model))
where model is distinct from upper(btrim(model));
