alter table public.union_whatsapp_messages
add column if not exists delivery_status text
check (delivery_status in ('sent','delivered','read'));
update public.union_whatsapp_messages set delivery_status='sent'
where direction='outgoing' and delivery_status is null;