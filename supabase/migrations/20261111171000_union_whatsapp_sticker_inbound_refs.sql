-- Figurinhas recebidas já são reconhecidas em union_whatsapp_messages,
-- mas o descritor de mídia também precisa aceitar o tipo sticker.
-- Sem isso o PostgREST retorna 400 e deixa a mensagem sem arquivo.
BEGIN;
ALTER TABLE public.union_whatsapp_inbound_media_refs
  DROP CONSTRAINT IF EXISTS union_whatsapp_inbound_media_refs_media_type_check;
ALTER TABLE public.union_whatsapp_inbound_media_refs
  ADD CONSTRAINT union_whatsapp_inbound_media_refs_media_type_check
  CHECK (media_type IN ('image','video','audio','file','sticker'));
COMMIT;
