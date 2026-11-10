begin;
-- Índices de apoio aos vínculos do pedido, usados também nas telas financeiras e de auditoria.
create index if not exists sales_orders_created_by_idx on public.sales_orders(created_by);
create index if not exists sales_orders_cancelled_by_idx on public.sales_orders(cancelled_by)
 where cancelled_by is not null;
create index if not exists sales_orders_customer_id_idx on public.sales_orders(customer_id)
 where customer_id is not null;
create index if not exists sales_orders_financial_entry_idx on public.sales_orders(financial_entry_id)
 where financial_entry_id is not null;
create index if not exists sales_orders_payment_method_idx on public.sales_orders(payment_method_id)
 where payment_method_id is not null;
commit;
