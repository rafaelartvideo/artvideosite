-- Vincula imagens das OS aos locais financeiros sem copiar bytes.
-- Comprovante -> Extrato/Financeiro; entrega -> Documentos de A receber.
BEGIN;

ALTER TABLE public.financial_attachments
  ADD COLUMN IF NOT EXISTS source_document_kind text NULL;

UPDATE public.financial_attachments
SET source_document_kind='payment_proof'
WHERE source_media_id IS NOT NULL AND attachment_type='proof'
  AND source_document_kind IS NULL;

ALTER TABLE public.financial_attachments
  DROP CONSTRAINT IF EXISTS financial_attachments_source_document_kind_check;
ALTER TABLE public.financial_attachments
  ADD CONSTRAINT financial_attachments_source_document_kind_check
  CHECK (source_document_kind IS NULL OR source_document_kind IN ('payment_proof','delivery_evidence'));

ALTER TABLE public.financial_attachments
  DROP CONSTRAINT IF EXISTS financial_attachments_source_media_consistency;
ALTER TABLE public.financial_attachments
  ADD CONSTRAINT financial_attachments_source_media_consistency
  CHECK (
    (source_media_id IS NULL AND storage_bucket='financial-documents' AND source_document_kind IS NULL)
    OR
    (source_media_id IS NOT NULL AND storage_bucket='service-images' AND (
       (attachment_type='proof' AND source_document_kind IN ('payment_proof'))
       OR (attachment_type='other' AND source_document_kind='delivery_evidence')
    ))
  );

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
    AND lower(btrim(type_of_doc.name))='comprovante de pagamento'
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
    AND lower(btrim(type_of_doc.name)) IN (
      'evidência de entrega','evidencia de entrega','comprovante de entrega do equipamento'
    )
    AND media_file.bucket_id='service-images'
    AND btrim(media_file.storage_path)<>''
  ON CONFLICT (storage_path) DO NOTHING;
END;
$function$;
REVOKE ALL ON FUNCTION private.sync_order_delivery_evidence_to_finance_v1(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.finance_proof_on_entry_created_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_order_id uuid;
BEGIN
  IF new.origin_reference IS NULL OR new.origin_reference !~
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RETURN new; END IF;
  v_order_id := new.origin_reference::uuid;
  PERFORM private.sync_order_payment_proofs_to_finance_v1(new.organization_id,v_order_id);
  PERFORM private.sync_order_delivery_evidence_to_finance_v1(new.organization_id,v_order_id);
  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION private.finance_proof_on_os_attachment_added_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_type text;
BEGIN
  SELECT lower(btrim(t.name)) INTO v_type
  FROM public.attachment_types t WHERE t.id=new.attachment_type_id
    AND t.organization_id=new.organization_id;
  IF v_type='comprovante de pagamento' THEN
    PERFORM private.sync_order_payment_proofs_to_finance_v1(new.organization_id,new.service_order_id);
  ELSIF v_type IN ('evidência de entrega','evidencia de entrega','comprovante de entrega do equipamento') THEN
    PERFORM private.sync_order_delivery_evidence_to_finance_v1(new.organization_id,new.service_order_id);
  END IF;
  RETURN new;
END;
$function$;

DROP POLICY IF EXISTS finance_linked_order_proof_select ON storage.objects;
CREATE POLICY finance_linked_order_proof_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id='service-images'
  AND EXISTS (
    SELECT 1 FROM public.financial_attachments linked
    WHERE linked.storage_bucket='service-images'
      AND linked.storage_path=objects.name
      AND linked.source_media_id IS NOT NULL
      AND (
        (linked.attachment_type='proof' AND linked.source_document_kind='payment_proof')
        OR (linked.attachment_type='other' AND linked.source_document_kind='delivery_evidence')
      )
      AND linked.archived_at IS NULL
      AND (
        private.can_access_finance(linked.organization_id,'finance.documents.view')
        OR private.can_access_finance(linked.organization_id,'finance.documents.manage')
      )
      AND private.can_view_financial_entry(linked.organization_id,linked.financial_entry_id)
  )
);

-- Backfill: também inclui comprovantes/evidências enviados antes deste deploy.
DO $$
DECLARE r RECORD;
BEGIN
 FOR r IN
   SELECT DISTINCT doc.organization_id,doc.service_order_id
   FROM public.service_order_situation_media doc
   JOIN public.attachment_types typ ON typ.id=doc.attachment_type_id AND typ.organization_id=doc.organization_id
   JOIN public.financial_entries entry ON entry.organization_id=doc.organization_id
     AND entry.entry_type='receivable' AND entry.origin_type='service_order'
     AND entry.origin_reference=doc.service_order_id::text
   WHERE doc.situation_id IS NULL
     AND lower(btrim(typ.name)) IN (
       'comprovante de pagamento','evidência de entrega','evidencia de entrega',
       'comprovante de entrega do equipamento'
     )
 LOOP
    PERFORM private.sync_order_payment_proofs_to_finance_v1(r.organization_id,r.service_order_id);
    PERFORM private.sync_order_delivery_evidence_to_finance_v1(r.organization_id,r.service_order_id);
 END LOOP;
END $$;

COMMIT;