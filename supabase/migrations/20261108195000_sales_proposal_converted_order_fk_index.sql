begin;
create index if not exists sales_proposals_converted_order_fk_idx
 on public.sales_proposals(organization_id,converted_order_id)
 where converted_order_id is not null;
commit;
