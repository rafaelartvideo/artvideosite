begin;
alter table public.artvideo_store_payment_settings
 add column if not exists mercado_pago_public_key text;
alter table public.artvideo_store_payment_settings
 add constraint artvideo_mp_public_key_format_check
 check(mercado_pago_public_key is null or mercado_pago_public_key=''
  or mercado_pago_public_key ~ '^(APP_USR|TEST)-[A-Za-z0-9_-]{12,200}$');
commit;