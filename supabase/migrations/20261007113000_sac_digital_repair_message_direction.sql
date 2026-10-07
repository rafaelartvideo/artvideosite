begin;

-- Corrige registros antigos cuja direção pode ter sido inferida antes
-- da reconciliação com /protocol/messages. Envios feitos pela Union
-- continuam sempre como saída.
update public.sac_digital_messages
set direction = 'outgoing'
where raw_metadata#>>'{sac_history,by}' = 'operator'
  and coalesce(raw_metadata->>'sent_via_union','false') <> 'true'
  and direction <> 'outgoing';

update public.sac_digital_messages
set direction = 'incoming'
where raw_metadata#>>'{sac_history,by}' = 'contact'
  and coalesce(raw_metadata->>'sent_via_union','false') <> 'true'
  and direction <> 'incoming';

update public.sac_digital_messages
set direction = 'outgoing',
    sender_name = coalesce(sender_name, 'Automação SAC Digital')
where raw_metadata#>>'{sac_history,by}' = 'channel'
  and coalesce(raw_metadata->>'sent_via_union','false') <> 'true'
  and (direction <> 'outgoing' or sender_name is null);

-- Preenche o nome quando o operador atual do protocolo ainda é o mesmo
-- operador registrado na mensagem histórica. Os demais nomes são
-- reconciliados pela API ao abrir/sincronizar a conversa.
update public.sac_digital_messages m
set sender_name = p.operator_name
from public.sac_digital_protocols p
where p.id = m.protocol_id
  and m.direction = 'outgoing'
  and m.sender_name is null
  and m.raw_metadata#>>'{sac_history,by}' = 'operator'
  and p.operator_id = m.raw_metadata#>>'{sac_history,operator}'
  and nullif(btrim(coalesce(p.operator_name,'')),'') is not null;

commit;
