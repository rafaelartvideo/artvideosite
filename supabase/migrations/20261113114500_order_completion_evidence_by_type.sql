-- Configuração das duas evidências da conclusão por tipo e exigência por empresa.
-- Reexecutável, preservando as configurações existentes de comprovante.
ALTER TABLE public.service_types
  ADD COLUMN IF NOT EXISTS enable_payment_proof_on_completion boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_delivery_evidence_on_completion boolean NOT NULL DEFAULT false;
ALTER TABLE public.organization_company_settings
  ADD COLUMN IF NOT EXISTS require_delivery_evidence_on_completion boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_order_completion_evidence_config_v1(p_organization_id uuid, p_service_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_type uuid; v_payment_enabled boolean; v_delivery_enabled boolean;
        v_payment_required boolean; v_delivery_required boolean;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT private.can_access_shared_organization_resource(p_organization_id,'orders','read')
    OR NOT private.has_effective_organization_permission(p_organization_id,'orders.complete') THEN
    RAISE EXCEPTION 'Sem permissão para consultar a conclusão desta empresa.' USING errcode='42501';
  END IF;
  SELECT o.service_type_id INTO v_type FROM public.service_orders o
  WHERE o.id=p_service_order_id AND o.organization_id=p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OS não encontrada na empresa selecionada.' USING errcode='22023';
  END IF;
  SELECT COALESCE(st.enable_payment_proof_on_completion,true),
         COALESCE(st.enable_delivery_evidence_on_completion,false)
  INTO v_payment_enabled,v_delivery_enabled
  FROM public.service_types st WHERE st.id=v_type AND st.organization_id=p_organization_id;
  v_payment_enabled := COALESCE(v_payment_enabled,true);
  v_delivery_enabled := COALESCE(v_delivery_enabled,false);
  SELECT COALESCE(c.require_payment_proof_on_completion,false),
         COALESCE(c.require_delivery_evidence_on_completion,false)
  INTO v_payment_required,v_delivery_required
  FROM public.organization_company_settings c WHERE c.organization_id=p_organization_id;
  RETURN jsonb_build_object(
    'payment_enabled',v_payment_enabled,
    'payment_required',v_payment_enabled AND COALESCE(v_payment_required,false),
    'delivery_enabled',v_delivery_enabled,
    'delivery_required',v_delivery_enabled AND COALESCE(v_delivery_required,false)
  );
END; $function$


;

CREATE OR REPLACE FUNCTION private.require_order_payment_proof_before_completion_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_payment_enabled boolean := true; v_delivery_enabled boolean := false;
        v_payment_required boolean := false; v_delivery_required boolean := false;
        v_covered_free boolean;
BEGIN
  SELECT COALESCE(t.enable_payment_proof_on_completion,true),
         COALESCE(t.enable_delivery_evidence_on_completion,false)
  INTO v_payment_enabled,v_delivery_enabled
  FROM public.service_types t WHERE t.id=new.service_type_id AND t.organization_id=new.organization_id;
  v_payment_enabled := COALESCE(v_payment_enabled,true);
  v_delivery_enabled := COALESCE(v_delivery_enabled,false);
  SELECT COALESCE(c.require_payment_proof_on_completion,false),
         COALESCE(c.require_delivery_evidence_on_completion,false)
  INTO v_payment_required,v_delivery_required
  FROM public.organization_company_settings c WHERE c.organization_id=new.organization_id;
  v_covered_free := new.return_root_id IS NOT NULL
       AND new.return_classification IN ('covered','courtesy')
       AND COALESCE(new.final_total,0)=0;

  IF v_payment_enabled AND COALESCE(v_payment_required,false) AND NOT v_covered_free
     AND NOT EXISTS (
       SELECT 1 FROM public.service_order_situation_media attachment
       JOIN public.attachment_types classification ON classification.id=attachment.attachment_type_id
         AND classification.organization_id=new.organization_id
       JOIN public.media media_file ON media_file.id=attachment.media_id
         AND media_file.organization_id=new.organization_id
       WHERE attachment.service_order_id=new.id
         AND attachment.organization_id=new.organization_id
         AND attachment.situation_id IS NULL
         AND lower(btrim(classification.name))='comprovante de pagamento'
         AND media_file.bucket_id='service-images'
         AND nullif(media_file.storage_path,'') IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'Anexe o comprovante de pagamento antes de concluir a OS.' USING errcode='23514';
  END IF;

  IF v_delivery_enabled AND COALESCE(v_delivery_required,false)
     AND NOT EXISTS (
       SELECT 1 FROM public.service_order_situation_media attachment
       JOIN public.attachment_types classification ON classification.id=attachment.attachment_type_id
         AND classification.organization_id=new.organization_id
       JOIN public.media media_file ON media_file.id=attachment.media_id
         AND media_file.organization_id=new.organization_id
       WHERE attachment.service_order_id=new.id
         AND attachment.organization_id=new.organization_id
         AND attachment.situation_id IS NULL
         AND lower(btrim(classification.name)) IN ('evidência de entrega','evidencia de entrega')
         AND media_file.bucket_id='service-images'
         AND nullif(media_file.storage_path,'') IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'Anexe a evidência de entrega antes de concluir a OS.' USING errcode='23514';
  END IF;
  RETURN new;
END; $function$


;

CREATE OR REPLACE FUNCTION private.ensure_order_completion_evidence_types_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_org uuid; v_payment boolean; v_delivery boolean;
BEGIN
  v_org := new.organization_id;
  IF tg_table_name='service_types' THEN
    v_payment:=new.enable_payment_proof_on_completion;
    v_delivery:=new.enable_delivery_evidence_on_completion;
  ELSE
    v_payment:=new.require_payment_proof_on_completion;
    v_delivery:=new.require_delivery_evidence_on_completion;
  END IF;
  IF v_payment THEN
    INSERT INTO public.attachment_types(organization_id,name,is_active)
    SELECT v_org,'Comprovante de pagamento',true
    WHERE NOT EXISTS(SELECT 1 FROM public.attachment_types
      WHERE organization_id=v_org AND lower(btrim(name))='comprovante de pagamento');
    UPDATE public.attachment_types SET is_active=true WHERE organization_id=v_org
      AND lower(btrim(name))='comprovante de pagamento' AND is_active=false;
  END IF;
  IF v_delivery THEN
    INSERT INTO public.attachment_types(organization_id,name,is_active)
    SELECT v_org,'Evidência de entrega',true
    WHERE NOT EXISTS(SELECT 1 FROM public.attachment_types
      WHERE organization_id=v_org AND lower(btrim(name)) IN ('evidência de entrega','evidencia de entrega'));
    UPDATE public.attachment_types SET is_active=true WHERE organization_id=v_org
      AND lower(btrim(name)) IN ('evidência de entrega','evidencia de entrega') AND is_active=false;
  END IF;
  RETURN new;
END; $function$
;


REVOKE ALL ON FUNCTION public.get_order_completion_evidence_config_v1(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_order_completion_evidence_config_v1(uuid,uuid) TO authenticated;

DROP TRIGGER IF EXISTS service_types_ensure_completion_evidence_types ON public.service_types;
CREATE TRIGGER service_types_ensure_completion_evidence_types
  AFTER INSERT OR UPDATE OF enable_payment_proof_on_completion,enable_delivery_evidence_on_completion
  ON public.service_types FOR EACH ROW EXECUTE FUNCTION private.ensure_order_completion_evidence_types_v1();
DROP TRIGGER IF EXISTS company_ensure_completion_evidence_types ON public.organization_company_settings;
CREATE TRIGGER company_ensure_completion_evidence_types
  AFTER INSERT OR UPDATE OF require_payment_proof_on_completion,require_delivery_evidence_on_completion
  ON public.organization_company_settings FOR EACH ROW EXECUTE FUNCTION private.ensure_order_completion_evidence_types_v1();

-- Adiciona as chaves ao RPC de configuração sem uma consulta adicional.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.load_service_types_configuration_v1(uuid)'::regprocedure)
    INTO definition;
  IF position('enable_delivery_evidence_on_completion' IN definition)=0 THEN
    definition:=replace(definition,
      '''generates_warranty'', item.generates_warranty,',
      '''generates_warranty'', item.generates_warranty,
       ''enable_payment_proof_on_completion'', item.enable_payment_proof_on_completion,
       ''enable_delivery_evidence_on_completion'', item.enable_delivery_evidence_on_completion,');
    IF position('enable_delivery_evidence_on_completion' IN definition)=0 THEN
      RAISE EXCEPTION 'Não foi possível atualizar as configurações dos tipos.';
    END IF;
    EXECUTE definition;
  END IF;
END $$;

INSERT INTO public.attachment_types (organization_id,name,is_active)
SELECT DISTINCT t.organization_id,'Comprovante de pagamento',true
FROM public.service_types t
WHERE t.enable_payment_proof_on_completion
AND NOT EXISTS (
  SELECT 1 FROM public.attachment_types a
  WHERE a.organization_id=t.organization_id
    AND lower(btrim(a.name))='comprovante de pagamento'
);
INSERT INTO public.attachment_types (organization_id,name,is_active)
SELECT DISTINCT t.organization_id,'Evidência de entrega',true
FROM public.service_types t
WHERE t.enable_delivery_evidence_on_completion
AND NOT EXISTS (
  SELECT 1 FROM public.attachment_types a
  WHERE a.organization_id=t.organization_id
    AND lower(btrim(a.name)) IN ('evidência de entrega','evidencia de entrega')
);
