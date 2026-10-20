begin;
-- Assign only new conversations to the configured default queue.
-- Transfers, previously assigned threads and prior history stay unchanged.
create or replace function private.union_whatsapp_assign_default_queue()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.department_id is null then
    select d.id into new.department_id
    from public.union_whatsapp_departments d
    where d.organization_id = new.organization_id
      and d.is_active = true and d.is_default = true
    limit 1;
  end if;
  return new;
end;
$$;
drop trigger if exists union_whatsapp_assign_default_queue on public.union_whatsapp_conversations;
create trigger union_whatsapp_assign_default_queue before insert
on public.union_whatsapp_conversations for each row
execute function private.union_whatsapp_assign_default_queue();
commit;
