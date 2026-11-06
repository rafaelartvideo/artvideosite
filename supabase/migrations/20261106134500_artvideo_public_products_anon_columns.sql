-- Vitrine pública: os produtos publicados devem continuar visíveis após logout.
-- Produtos de outras empresas permanecem bloqueados por products_public_artvideo (RLS).
-- Apenas colunas comerciais/visíveis ao cliente; nunca revelar campos internos/fiscais.
grant select (
  id, organization_id, category_id, brand_id, name, slug, sku,
  short_description, description, price, compare_at_price, cover_media_id,
  is_active, is_featured, created_at, updated_at, show_in_catalog,
  site_characteristics, model, manufacturer_code, barcode,
  gross_weight_grams, width_mm, height_mm, length_mm
) on table public.products to anon;
