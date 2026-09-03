begin;

alter table public.customer_addresses
  add column if not exists shared_map_url text;

comment on column public.customer_addresses.shared_map_url is
  'Link de localização compartilhado pelo cliente (Google Maps, Apple Maps, Waze ou serviço equivalente).';

alter table public.customer_addresses
  drop constraint if exists customer_addresses_shared_map_url_http;

alter table public.customer_addresses
  add constraint customer_addresses_shared_map_url_http
  check (
    shared_map_url is null
    or shared_map_url = ''
    or shared_map_url ~* '^https?://'
  );

commit;
