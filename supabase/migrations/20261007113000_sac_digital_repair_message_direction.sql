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
where raw_metadata#>>'{sac_history,by}' in ('contact','channel')
  and coalesce(raw_metadata->>'sent_via_union','false') <> 'true'
  and direction <> 'incoming';

commit;
