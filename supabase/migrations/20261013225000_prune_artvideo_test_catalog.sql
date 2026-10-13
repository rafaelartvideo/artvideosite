-- Higienização de TESTES reais com OS históricos preservados.
-- A proteção contra edição de OS cancelada é suspensa apenas nesta transação.
-- Não altera status, financeiro, cliente, série nem os dados históricos das OS.
BEGIN;
ALTER TABLE public.service_orders DISABLE TRIGGER protect_service_order_resolution;
DO $$
DECLARE
 v_previous text:=current_setting('app.union_catalog_automatic',true);
 v_root uuid:='00000000-0000-4000-8000-000000000001';
 v_ids uuid[];
 v_count int;
 v_ce int;
 v_os int;
 v_deleted int;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.organizations o
  WHERE o.id=v_root AND o.settings->>'is_artvideo_tenant'='true') THEN
  RAISE EXCEPTION 'Empresa Artvideo não identificada';
 END IF;

 SELECT array_agg(t.id ORDER BY t.id),count(*) INTO v_ids,v_count
 FROM public.equipment_types t
 WHERE (t.organization_id=v_root
   AND t.id IN ('eff8121e-07e7-4052-a4d5-b03b9a67aa42'::uuid,
                '18e93f69-9771-4f8c-a13c-2cc3a4d798f2'::uuid)
   AND t.name IN ('Teste Televisor Check','Teste01'))
 OR (t.organization_id<>v_root
   AND t.source_artvideo_id IN (
     '5c9da50c-6df2-4081-8b0a-2b139f617e3a'::uuid,
     '9600d629-2e60-435d-815c-61711a16bc48'::uuid,
     'eff8121e-07e7-4052-a4d5-b03b9a67aa42'::uuid)
   AND t.name IN ('Teste','Teste1','Teste Televisor Check'));
 IF v_count<>11 THEN RAISE EXCEPTION 'Esperados 11 cadastros de teste, encontrados %',v_count; END IF;
 IF EXISTS(SELECT 1 FROM public.organization_catalog_equipment_links l
           WHERE l.equipment_type_id=ANY(v_ids)) THEN
  RAISE EXCEPTION 'Tipo de teste associado ao Catálogo Union';
 END IF;

 IF EXISTS(
   SELECT 1 FROM public.equipment_types t WHERE t.id=ANY(v_ids)
   AND t.organization_id<>v_root AND (
     EXISTS(SELECT 1 FROM public.service_orders so WHERE so.equipment_type_id=t.id)
     OR EXISTS(SELECT 1 FROM public.customer_equipments ce WHERE ce.equipment_type_id=t.id)
     OR EXISTS(SELECT 1 FROM public.service_order_checklists sc WHERE sc.equipment_type_id=t.id)
     OR EXISTS(SELECT 1 FROM public.device_capture_sessions d WHERE d.equipment_type_id=t.id)
   )
 ) THEN RAISE EXCEPTION 'Uma cópia de teste passou a ter uso operacional'; END IF;

 PERFORM set_config('app.union_catalog_automatic','on',true);

 -- Desvincular referências do equipamento de cliente antes de modificar a OS.
 -- Preservar nomes históricos, cliente e série no registro de equipamento do cliente.
 UPDATE public.customer_equipments ce
 SET equipment_type_id=NULL,equipment_brand_id=NULL,equipment_model_id=NULL
 WHERE ce.organization_id=v_root AND ce.equipment_type_id=ANY(v_ids);
 GET DIAGNOSTICS v_ce=ROW_COUNT;
 IF v_ce<>3 THEN RAISE EXCEPTION 'Esperados 3 dispositivos de teste, %',v_ce; END IF;

 UPDATE public.service_orders so
 SET equipment_type_id=NULL,equipment_brand_id=NULL,equipment_model_id=NULL
 WHERE so.organization_id=v_root AND so.equipment_type_id=ANY(v_ids);
 GET DIAGNOSTICS v_os=ROW_COUNT;
 IF v_os<>3 THEN RAISE EXCEPTION 'Esperadas 3 OS de teste, %',v_os; END IF;

 DELETE FROM public.equipment_type_technical_fields f
 WHERE f.equipment_type_id=ANY(v_ids);

 DELETE FROM public.equipment_types t WHERE t.id=ANY(v_ids);
 GET DIAGNOSTICS v_deleted=ROW_COUNT;
 IF v_deleted<>11 THEN RAISE EXCEPTION 'Exclusão de % dos 11 testes; revertendo',v_deleted; END IF;
 PERFORM set_config('app.union_catalog_automatic',coalesce(v_previous,''),true);
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.union_catalog_automatic',coalesce(v_previous,''),true);
 RAISE;
END $$;
ALTER TABLE public.service_orders ENABLE TRIGGER protect_service_order_resolution;
COMMIT;
