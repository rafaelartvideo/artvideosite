-- Desativa a replicação legada irrestrita Artvideo -> todas as empresas.
-- O Catálogo Union é distribuído pelo(s) segmento(s) da empresa.
-- Não altera triggers de integridade, auditoria manual, regras de catálogo Union,
-- nem registros já existentes. Reversível por ENABLE TRIGGER.
alter table public.equipment_types disable trigger equipment_types_sync_artvideo_catalog;
alter table public.equipment_brands disable trigger equipment_brands_sync_artvideo_catalog;
alter table public.equipment_models disable trigger equipment_models_sync_artvideo_catalog;
alter table public.technical_fields disable trigger technical_fields_sync_artvideo_catalog;
alter table public.equipment_type_technical_fields disable trigger equipment_type_fields_sync_artvideo_catalog;
alter table public.organizations disable trigger organizations_sync_artvideo_equipment_catalog;
