begin;
alter table public.union_whatsapp_conversations
 add column if not exists service_order_id uuid;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='union_whatsapp_service_order_fk') then
  alter table public.union_whatsapp_conversations add constraint union_whatsapp_service_order_fk
   foreign key (service_order_id) references public.service_orders(id) on delete set null;
 end if;
end $$;
create index if not exists union_whatsapp_order_link_idx
 on public.union_whatsapp_conversations(organization_id,service_order_id)
 where service_order_id is not null;
commit;