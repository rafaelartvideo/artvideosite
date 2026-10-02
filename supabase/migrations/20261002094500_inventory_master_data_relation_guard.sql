begin;

alter table public.products
  drop constraint if exists products_category_same_org_fkey;
alter table public.products
  drop constraint if exists products_brand_same_org_fkey;

create or replace function private.products_enforce_master_data_organization()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.category_id is not null and not exists (
    select 1
    from public.product_categories category
    where category.id=new.category_id
      and category.organization_id=new.organization_id
  ) then
    raise exception 'A categoria selecionada não pertence à empresa do item.' using errcode='23503';
  end if;

  if new.brand_id is not null and not exists (
    select 1
    from public.brands brand
    where brand.id=new.brand_id
      and brand.organization_id=new.organization_id
  ) then
    raise exception 'A marca selecionada não pertence à empresa do item.' using errcode='23503';
  end if;

  return new;
end;
$$;

drop trigger if exists products_enforce_master_data_organization on public.products;
create trigger products_enforce_master_data_organization
before insert or update of organization_id,category_id,brand_id on public.products
for each row execute function private.products_enforce_master_data_organization();

commit;