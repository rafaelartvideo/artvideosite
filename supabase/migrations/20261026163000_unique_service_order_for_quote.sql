begin;
-- Garante um único vínculo de OS por solicitação, inclusive com duas abas abertas.
create unique index if not exists service_orders_one_order_per_site_quote
on public.service_orders (organization_id,quote_request_id)
where quote_request_id is not null;
commit;
