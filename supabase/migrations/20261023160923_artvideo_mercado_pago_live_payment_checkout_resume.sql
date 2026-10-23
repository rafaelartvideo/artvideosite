begin;
alter table public.artvideo_payment_live_checks
 add column if not exists checkout_url text;
alter table public.artvideo_payment_live_checks
 add constraint artvideo_payment_live_checkout_url_https
 check (
  checkout_url is null or (
    checkout_url ~ '^https://(www\\.)?mercadopago\\.com(\\.br)?/'
    and length(checkout_url)<=2048
  )
 );
commit;