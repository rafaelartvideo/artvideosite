-- Conclusão da OS: resolver IDs e anexos por RPC, sem depender da listagem de Documentos.
-- Preserva as permissões de leitura e conclusão da OS e não expõe a tabela a outros usuários.
BEGIN;

INSERT INTO public.attachment_types (organization_id,name,is_active)
SELECT DISTINCT st.organization_id,'Evidência de entrega',true
FROM public.service_types st
WHERE st.enable_delivery_evidence_on_completion
AND NOT EXISTS (
  SELECT 1 FROM public.attachment_types typ
  WHERE typ.organization_id=st.organization_id
    AND lower(btrim(typ.name)) IN ('evidência de entrega','evidencia de entrega')
);

INSERT INTO public.attachment_types (organization_id,name,is_active)
SELECT DISTINCT st.organization_id,'Comprovante de pagamento',true
FROM public.service_types st
WHERE st.enable_payment_proof_on_completion
AND NOT EXISTS (
  SELECT 1 FROM public.attachment_types typ
  WHERE typ.organization_id=st.organization_id
    AND lower(btrim(typ.name))='comprovante de pagamento'
);

CREATE OR REPLACE FUNCTION public.get_order_completion_evidence_config_v1(p_organization_id uuid, p_service_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_type uuid;
  v_payment_enabled boolean;
  v_delivery_enabled boolean;
  v_payment_required boolean;
  v_delivery_required boolean;
  v_payment_type_id uuid;
  v_delivery_type_id uuid;
  v_payment_attached boolean;
  v_delivery_attached boolean;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT private.can_access_shared_organization_resource(p_organization_id,'orders','read')
    OR NOT private.has_effective_organization_permission(p_organization_id,'orders.complete')
  THEN
    RAISE EXCEPTION 'Sem permissão para consultar a conclusão desta empresa.'
      USING errcode='42501';
  END IF;

  SELECT o.service_type_id INTO v_type
  FROM public.service_orders o
  WHERE o.id=p_service_order_id AND o.organization_id=p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OS não encontrada na empresa selecionada.' USING errcode='22023';
  END IF;

  SELECT COALESCE(st.enable_payment_proof_on_completion,true),
         COALESCE(st.enable_delivery_evidence_on_completion,false)
  INTO v_payment_enabled,v_delivery_enabled
  FROM public.service_types st
  WHERE st.id=v_type AND st.organization_id=p_organization_id;
  v_payment_enabled := COALESCE(v_payment_enabled,true);
  v_delivery_enabled := COALESCE(v_delivery_enabled,false);

  SELECT COALESCE(s.require_payment_proof_on_completion,false),
         COALESCE(s.require_delivery_evidence_on_completion,false)
  INTO v_payment_required,v_delivery_required
  FROM public.organization_company_settings s
  WHERE s.organization_id=p_organization_id;

  IF v_payment_enabled THEN
    SELECT typ.id INTO v_payment_type_id
    FROM public.attachment_types typ
    WHERE typ.organization_id=p_organization_id AND typ.is_active
      AND lower(btrim(typ.name))='comprovante de pagamento'
    ORDER BY typ.created_at,typ.id LIMIT 1;
  END IF;

  IF v_delivery_enabled THEN
    SELECT typ.id INTO v_delivery_type_id
    FROM public.attachment_types typ
    WHERE typ.organization_id=p_organization_id AND typ.is_active
      AND lower(btrim(typ.name)) IN ('evidência de entrega','evidencia de entrega')
    ORDER BY CASE WHEN lower(btrim(typ.name))='evidência de entrega' THEN 0 ELSE 1 END,
             typ.created_at,typ.id LIMIT 1;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.service_order_situation_media link
    JOIN public.attachment_types typ
      ON typ.id=link.attachment_type_id AND typ.organization_id=p_organization_id
    WHERE link.organization_id=p_organization_id
      AND link.service_order_id=p_service_order_id
      AND link.situation_id IS NULL
      AND lower(btrim(typ.name))='comprovante de pagamento'
  ) INTO v_payment_attached;

  SELECT EXISTS (
    SELECT 1
    FROM public.service_order_situation_media link
    JOIN public.attachment_types typ
      ON typ.id=link.attachment_type_id AND typ.organization_id=p_organization_id
    WHERE link.organization_id=p_organization_id
      AND link.service_order_id=p_service_order_id
      AND link.situation_id IS NULL
      AND lower(btrim(typ.name)) IN ('evidência de entrega','evidencia de entrega')
  ) INTO v_delivery_attached;

  RETURN jsonb_build_object(
    'payment_enabled',v_payment_enabled,
    'payment_required',v_payment_enabled AND COALESCE(v_payment_required,false),
    'payment_attachment_type_id',v_payment_type_id,
    'payment_attached',v_payment_attached,
    'delivery_enabled',v_delivery_enabled,
    'delivery_required',v_delivery_enabled AND COALESCE(v_delivery_required,false),
    'delivery_attachment_type_id',v_delivery_type_id,
    'delivery_attached',v_delivery_attached
  );
END;
$function$


REVOKE ALL ON FUNCTION public.get_order_completion_evidence_config_v1(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_order_completion_evidence_config_v1(uuid,uuid) TO authenticated;
COMMIT;
