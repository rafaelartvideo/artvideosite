-- O bucket privado aceita 25 MiB, mas a restricao de descritores ainda
-- bloqueava documentos e videos recebidos com mais de 5 MiB.
-- Aumento limitado a 20 MiB para arquivos/video; demais tipos continuam 5 MiB.
alter table public.union_whatsapp_inbound_media_refs
  drop constraint if exists union_whatsapp_inbound_media_refs_file_length_check;
alter table public.union_whatsapp_inbound_media_refs
  add constraint union_whatsapp_inbound_media_refs_file_length_check
  check (file_length > 0 and file_length <=
    case when media_type in ('file','video') then 20971520 else 5242880 end);
