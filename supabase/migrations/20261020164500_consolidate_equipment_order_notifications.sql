-- Mantém apenas um aviso para o cadastro de um equipamento.
-- Na abertura de OS, o aviso da OS substitui o aviso do tipo de equipamento criado durante o processo.
begin;
create or replace function private.filter_equipment_notification_v1()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if new.event_type = 'created' and new.entity_type in ('equipment_brands', 'equipment_models') then
    return null;
  end if;
  if new.event_type = 'created' and new.entity_type = 'equipment_types' then
    new.title := 'Equipamento cadastrado';
  end if;
  return new;
end;
$function$;
drop trigger if exists filter_equipment_notification_v1 on public.organization_notifications;
create trigger filter_equipment_notification_v1
before insert on public.organization_notifications
for each row execute function private.filter_equipment_notification_v1();

create or replace function private.consolidate_order_equipment_notification_v1()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if new.entity_type = 'service_orders' and new.event_type = 'created'
     and new.actor_user_id is not null then
    delete from public.organization_notifications existing
    using public.service_orders order_record
    where order_record.id::text = new.entity_id
      and order_record.organization_id = new.organization_id
      and order_record.equipment_type_id::text = existing.entity_id
      and existing.organization_id = new.organization_id
      and existing.entity_type = 'equipment_types'
      and existing.event_type = 'created'
      and existing.actor_user_id = new.actor_user_id
      and existing.created_at >= new.created_at - interval '15 minutes'
      and existing.created_at <= new.created_at
      and existing.id <> new.id;
  end if;
  return null;
end;
$function$;
drop trigger if exists consolidate_order_equipment_notification_v1 on public.organization_notifications;
create trigger consolidate_order_equipment_notification_v1
after insert on public.organization_notifications
for each row execute function private.consolidate_order_equipment_notification_v1();
revoke all on function private.filter_equipment_notification_v1() from public, anon, authenticated;
revoke all on function private.consolidate_order_equipment_notification_v1() from public, anon, authenticated;
commit;
