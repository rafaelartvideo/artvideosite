begin;

alter table public.product_categories
  drop constraint if exists product_categories_artvideo_only;
alter table public.brands
  drop constraint if exists brands_artvideo_only;

do $do$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.product_categories'::regclass
      and conname='product_categories_org_id_unique'
  ) then
    alter table public.product_categories
      add constraint product_categories_org_id_unique
      unique (organization_id,id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.brands'::regclass
      and conname='brands_org_id_unique'
  ) then
    alter table public.brands
      add constraint brands_org_id_unique
      unique (organization_id,id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.products'::regclass
      and conname='products_category_same_org_fkey'
  ) then
    alter table public.products
      add constraint products_category_same_org_fkey
      foreign key (organization_id,category_id)
      references public.product_categories(organization_id,id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.products'::regclass
      and conname='products_brand_same_org_fkey'
  ) then
    alter table public.products
      add constraint products_brand_same_org_fkey
      foreign key (organization_id,brand_id)
      references public.brands(organization_id,id)
      on delete restrict;
  end if;
end
$do$;

commit;