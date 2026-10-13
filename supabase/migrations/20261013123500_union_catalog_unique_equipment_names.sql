-- Evita duplicar nomes de equipamentos no catálogo central da Union.
-- Índice aditivo; catálogo oficial ainda está vazio nesta implantação.
create unique index if not exists catalog_equipment_types_normalized_name_uidx
  on public.catalog_equipment_types (lower(public.normalize_visual_text(name)));