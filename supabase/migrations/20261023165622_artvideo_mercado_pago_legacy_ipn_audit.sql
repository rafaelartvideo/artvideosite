begin;
alter table public.artvideo_payment_live_checks
 add column if not exists legacy_notification_received_at timestamptz;
-- Evento IPN entregue ao Supabase em 23/10 16:39:10Z e aprovado
-- separadamente por consulta autenticada na API. Nao eh comprovacao HMAC.
update public.artvideo_payment_live_checks
 set legacy_notification_received_at='2026-10-23 16:39:10.447+00'
 where id='ed5fb4b6-dc70-484c-a38f-253e3b235548'
   and payment_id='185730654834' and status='approved'
   and legacy_notification_received_at is null;
commit;