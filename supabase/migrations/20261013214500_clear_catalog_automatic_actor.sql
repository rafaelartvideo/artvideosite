-- Vínculos históricos do catálogo central foram criados pela automação,
-- não pela pessoa que escolheu o segmento. Eliminar a atribuição indevida.
update public.organization_catalog_equipment_links
  set created_by=null where created_by is not null;
update public.organization_catalog_brand_links
  set created_by=null where created_by is not null;
