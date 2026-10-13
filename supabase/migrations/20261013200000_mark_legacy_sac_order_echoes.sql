-- Preservar evidências da SAC ao corrigir ecos antigos de envios pela OS.
-- A rota Client legada fazia o provedor registrar como "contact" o texto
-- que a Union acabou de enviar; havia dois registros da MESMA mensagem.
-- Somente pares com o mesmo texto, protocolo, organização e diferença de
-- até dez segundos, e prova de envio pela OS, são classificados como eco.
-- Não excluir nem reclassificar mensagens verdadeiras de clientes.
do $$
declare v_candidates integer;
begin
 select count(*) into v_candidates
 from public.sac_digital_messages incoming
 where incoming.direction='incoming'
   and incoming.raw_metadata->'sac_history'->>'by'='contact'
   and incoming.raw_metadata->>'sent_via_union' is distinct from 'true'
   and exists (
     select 1 from public.sac_digital_messages outgoing
     where outgoing.organization_id=incoming.organization_id
       and outgoing.protocol_id=incoming.protocol_id
       and outgoing.direction='outgoing'
       and outgoing.raw_metadata->>'sent_via_union'='true'
       and nullif(outgoing.raw_metadata->>'sent_from_service_order','') is not null
       and btrim(coalesce(outgoing.body_text,''))=btrim(coalesce(incoming.body_text,''))
       and abs(extract(epoch from incoming.sent_at-outgoing.sent_at))<=10
   );
 if v_candidates>25 then
   raise exception 'Quantidade inesperada de ecos da OS: %. Nenhum registro alterado.',v_candidates;
 end if;

 update public.sac_digital_messages incoming
 set direction='outgoing',
     raw_metadata=jsonb_set(
       coalesce(incoming.raw_metadata,'{}'::jsonb),
       '{suppressed_legacy_order_echo}',
       'true'::jsonb,true)
 where incoming.direction='incoming'
   and incoming.raw_metadata->'sac_history'->>'by'='contact'
   and incoming.raw_metadata->>'sent_via_union' is distinct from 'true'
   and exists (
     select 1 from public.sac_digital_messages outgoing
     where outgoing.organization_id=incoming.organization_id
       and outgoing.protocol_id=incoming.protocol_id
       and outgoing.direction='outgoing'
       and outgoing.raw_metadata->>'sent_via_union'='true'
       and nullif(outgoing.raw_metadata->>'sent_from_service_order','') is not null
       and btrim(coalesce(outgoing.body_text,''))=btrim(coalesce(incoming.body_text,''))
       and abs(extract(epoch from incoming.sent_at-outgoing.sent_at))<=10
   );
end $$;