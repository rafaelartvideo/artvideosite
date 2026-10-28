-- Repair previously verified WhatsApp registrations without any CRM entity.
-- A later signed-in artvideo_customer_activate_v2 call will re-run CPF + first-name matching.
begin;
update public.artvideo_customer_accounts
set link_status='needs_cpf',updated_at=now()
where entity_id is null and link_status='created'
  and whatsapp_verified_at is not null and whatsapp_verified_number is not null;
commit;
