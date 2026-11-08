-- Restore Artvideo storefront access after adding products.product_condition.
-- products_public_artvideo RLS still limits anonymous reads to the Artvideo
-- organization, active products and items explicitly published in the catalog.
-- Never grant table-wide SELECT: products contains internal inventory/fiscal data.
grant select (product_condition) on table public.products to anon;
