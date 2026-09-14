begin;

create or replace function private.inherit_service_order_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_organization_id uuid;
begin
  if new.service_order_id is null then
    return new;
  end if;

  select service_order.organization_id
    into parent_organization_id
  from public.service_orders service_order
  where service_order.id = new.service_order_id;

  if parent_organization_id is null then
    raise exception 'OS não encontrada para o registro vinculado.'
      using errcode = '23503';
  end if;

  new.organization_id := parent_organization_id;
  return new;
end;
$$;

commit;
