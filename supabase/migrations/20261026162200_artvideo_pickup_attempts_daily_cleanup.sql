-- Apaga somente tentativas técnicas antigas; preserva pedidos e PINs históricos.
begin;
select cron.schedule(
  'artvideo-pickup-attempts-cleanup',
  '15 3 * * *',
  $job$select private.artvideo_store_cleanup_pickup_attempts_v1();$job$
);
commit;
