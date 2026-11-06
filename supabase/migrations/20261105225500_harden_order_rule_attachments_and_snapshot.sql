-- Harden custom-field file references and freeze effective rules after the atomic creation snapshot.
do $migration$
declare
  v_definition text;
  v_before text := 'and m.organization_id=p_org and m.storage_path is not null';
  v_after text := 'and m.organization_id=p_org and m.storage_path like ''orders/''||p_order_id::text||''/attachments/custom-fields/%''';
begin
  select pg_get_functiondef('private.validate_order_rules_v1(uuid,uuid,text,jsonb)'::regprocedure)
    into v_definition;
  if position(v_after in v_definition)=0 then
    if position(v_before in v_definition)=0 then
      raise exception 'Current validator does not contain the expected file authorization condition.';
    end if;
    execute replace(v_definition, v_before, v_after);
  end if;
end;
$migration$;

create or replace function private.guard_order_rules_snapshot_immutable()
returns trigger language plpgsql security definer set search_path='' as $guard$
begin
  if old.order_rules_snapshot is not null
     and old.order_rules_snapshot is distinct from new.order_rules_snapshot then
    raise exception 'As regras da OS foram congeladas na criação e não podem ser alteradas.'
      using errcode='42501';
  end if;
  return new;
end;
$guard$;
revoke all on function private.guard_order_rules_snapshot_immutable()
  from public,anon,authenticated;
drop trigger if exists guard_order_rules_snapshot_immutable on public.service_orders;
create trigger guard_order_rules_snapshot_immutable
before update of order_rules_snapshot on public.service_orders
for each row execute function private.guard_order_rules_snapshot_immutable();
