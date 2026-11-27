-- Associa comprovantes por identidade e tipo sem depender do nome editável.
-- Mantém reconhecimento por nome para documentos históricos, sem varredura de Storage.
BEGIN;
ALTER TABLE public.service_order_situation_media
  ADD COLUMN IF NOT EXISTS completion_evidence_kind text;
ALTER TABLE public.service_order_situation_media DROP CONSTRAINT IF EXISTS service_order_completion_evidence_kind_check;
ALTER TABLE public.service_order_situation_media
  ADD CONSTRAINT service_order_completion_evidence_kind_check
  CHECK (completion_evidence_kind IS NULL OR completion_evidence_kind IN ('payment_proof','delivery_evidence'));
CREATE INDEX IF NOT EXISTS service_order_completion_evidence_kind_idx
ON public.service_order_situation_media(organization_id,service_order_id,completion_evidence_kind)
WHERE completion_evidence_kind IS NOT NULL;
CREATE OR REPLACE FUNCTION private.sync_order_payment_proofs_to_finance_v1(
  p_organization_id uuid, p_service_order_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF p_organization_id IS NULL OR p_service_order_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.financial_attachments (
    organization_id,financial_entry_id,financial_settlement_id,
    attachment_type,file_name,storage_path,mime_type,size_bytes,
    created_by,created_at,storage_bucket,source_media_id,source_document_kind
  )
  SELECT entry.organization_id,entry.id,NULL,
    'proof',media_file.file_name,media_file.storage_path,media_file.mime_type,media_file.file_size,
    source_doc.uploaded_by,source_doc.created_at,'service-images',media_file.id,'payment_proof'
  FROM public.financial_entries entry
  JOIN public.service_order_situation_media source_doc
    ON source_doc.service_order_id::text=entry.origin_reference
   AND source_doc.organization_id=entry.organization_id
  JOIN public.attachment_types type_of_doc
    ON type_of_doc.id=source_doc.attachment_type_id
   AND type_of_doc.organization_id=entry.organization_id
  JOIN public.media media_file
    ON media_file.id=source_doc.media_id
   AND media_file.organization_id=entry.organization_id
  WHERE entry.organization_id=p_organization_id
    AND entry.entry_type='receivable'
    AND entry.origin_type='service_order'
    AND entry.origin_reference=p_service_order_id::text
    AND source_doc.situation_id IS NULL
    AND (source_doc.completion_evidence_kind='payment_proof' OR
         (source_doc.completion_evidence_kind IS NULL AND lower(btrim(type_of_doc.name))='comprovante de pagamento'))
    AND media_file.bucket_id='service-images'
    AND btrim(media_file.storage_path)<>''
  ON CONFLICT (storage_path) DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION private.sync_order_delivery_evidence_to_finance_v1(
  p_organization_id uuid, p_service_order_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF p_organization_id IS NULL OR p_service_order_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.financial_attachments (
    organization_id,financial_entry_id,financial_settlement_id,
    attachment_type,file_name,storage_path,mime_type,size_bytes,
    created_by,created_at,storage_bucket,source_media_id,source_document_kind
  )
  SELECT entry.organization_id,entry.id,NULL,
    'other',media_file.file_name,media_file.storage_path,media_file.mime_type,media_file.file_size,
    source_doc.uploaded_by,source_doc.created_at,'service-images',media_file.id,'delivery_evidence'
  FROM public.financial_entries entry
  JOIN public.service_order_situation_media source_doc
    ON source_doc.service_order_id::text=entry.origin_reference
   AND source_doc.organization_id=entry.organization_id
  JOIN public.attachment_types type_of_doc
    ON type_of_doc.id=source_doc.attachment_type_id
   AND type_of_doc.organization_id=entry.organization_id
  JOIN public.media media_file
    ON media_file.id=source_doc.media_id
   AND media_file.organization_id=entry.organization_id
  WHERE entry.organization_id=p_organization_id
    AND entry.entry_type='receivable'
    AND entry.origin_type='service_order'
    AND entry.origin_reference=p_service_order_id::text
    AND source_doc.situation_id IS NULL
    AND (source_doc.completion_evidence_kind='delivery_evidence' OR
         (source_doc.completion_evidence_kind IS NULL AND lower(btrim(type_of_doc.name)) IN (
           'evidência de entrega','evidencia de entrega','comprovante de entrega do equipamento'
         )))
    AND media_file.bucket_id='service-images'
    AND btrim(media_file.storage_path)<>''
  ON CONFLICT (storage_path) DO NOTHING;
END;
$function$;
REVOKE ALL ON FUNCTION private.sync_order_delivery_evidence_to_finance_v1(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.mark_order_completion_evidence_v1(
  p_organization_id uuid,p_service_order_id uuid,
  p_payment_media_id uuid DEFAULT NULL,p_delivery_media_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $body$
DECLARE v_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_organization_member(p_organization_id)
     OR NOT private.has_effective_organization_permission(p_organization_id,'orders.complete')
     OR NOT private.has_effective_organization_permission(p_organization_id,'orders.section.images')
  THEN RAISE EXCEPTION 'Sem permissão para identificar evidências de conclusão.' USING errcode='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.service_orders
                WHERE id=p_service_order_id AND organization_id=p_organization_id)
  THEN RAISE EXCEPTION 'OS não encontrada.' USING errcode='P0002'; END IF;
  IF p_payment_media_id IS NOT NULL AND p_payment_media_id IS NOT DISTINCT FROM p_delivery_media_id
  THEN RAISE EXCEPTION 'A mesma mídia não pode servir como ambas as evidências.' USING errcode='22023'; END IF;
  IF p_payment_media_id IS NOT NULL THEN
    UPDATE public.service_order_situation_media
    SET completion_evidence_kind='payment_proof'
    WHERE organization_id=p_organization_id AND service_order_id=p_service_order_id
      AND media_id=p_payment_media_id AND situation_id IS NULL
      AND (completion_evidence_kind IS NULL OR completion_evidence_kind='payment_proof');
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count<>1 THEN
      RAISE EXCEPTION 'Comprovante não encontrado ou já classificado de outra forma.' USING errcode='23514';
    END IF;
  END IF;
  IF p_delivery_media_id IS NOT NULL THEN
    UPDATE public.service_order_situation_media
    SET completion_evidence_kind='delivery_evidence'
    WHERE organization_id=p_organization_id AND service_order_id=p_service_order_id
      AND media_id=p_delivery_media_id AND situation_id IS NULL
      AND (completion_evidence_kind IS NULL OR completion_evidence_kind='delivery_evidence');
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count<>1 THEN
      RAISE EXCEPTION 'Evidência de entrega não encontrada ou já classificada de outra forma.' USING errcode='23514';
    END IF;
  END IF;
  IF p_payment_media_id IS NOT NULL THEN
    PERFORM private.sync_order_payment_proofs_to_finance_v1(p_organization_id,p_service_order_id);
  END IF;
  IF p_delivery_media_id IS NOT NULL THEN
    PERFORM private.sync_order_delivery_evidence_to_finance_v1(p_organization_id,p_service_order_id);
  END IF;
END
$body$;
REVOKE ALL ON FUNCTION public.mark_order_completion_evidence_v1(uuid,uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_order_completion_evidence_v1(uuid,uuid,uuid,uuid) TO authenticated;
COMMIT;
