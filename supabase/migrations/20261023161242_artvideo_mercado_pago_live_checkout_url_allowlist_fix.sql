begin;
alter table public.artvideo_payment_live_checks
 drop constraint if exists artvideo_payment_live_checkout_url_https;
alter table public.artvideo_payment_live_checks
 add constraint artvideo_payment_live_checkout_url_https
 check(checkout_url is null or (
   (checkout_url like 'https://www.mercadopago.com.br/%'
    or checkout_url like 'https://www.mercadopago.com/%')
   and length(checkout_url)<=2048
 ));
commit;