-- Colunas comerciais da ficha técnica do produto (somente produtos públicos pela RLS).
-- Produtos de outras empresas e produtos não publicados seguem inacessíveis para anon.
grant select (sku,model,manufacturer_code,barcode,gross_weight_grams,width_mm,height_mm,length_mm)
on public.products to anon;
