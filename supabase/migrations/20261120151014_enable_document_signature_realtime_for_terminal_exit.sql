-- Realtime leve para atualizar a assinatura sem botão manual de atualização.
-- A publicação respeita a política SELECT com permissão e escopo da OS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime'
      AND schemaname='public'
      AND tablename='document_signature_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.document_signature_requests;
  END IF;
END $$;
