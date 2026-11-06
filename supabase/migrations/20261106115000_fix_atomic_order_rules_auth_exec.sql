begin;

-- The atomic OS creation RPC is SECURITY INVOKER, but the November rules
-- changes call private SECURITY DEFINER functions that authenticated cannot
-- execute directly. Keep those routines private and use narrow, guarded
-- internal wrappers rather than granting broad direct access.

create schema if not exists internal_api;
revoke all on schema internal_api from public, anon;
grant usage on schema internal_api to authenticated;

create or replace function internal_api.effective_order_rules_for_order_creation(
  p_organization_id uuid,
  p_service_type_id uuid,
  p_equipment_type_id uuid
)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $fn$
begin
  if (select auth.uid()) is null
     or not private.is_organization_member(p_organization_id)
     or not private.is_organization_module_enabled(p_organization_id, 'orders')
     or not private.has_effective_organization_permission(p_organization_id, 'orders.create') then
    raise exception 'Sem permissão para criar OS nesta empresa.'
      using errcode = '42501';
  end if;

  return private.effective_order_rules_v1(
    p_organization_id, p_service_type_id, p_equipment_type_id
  );
end;
$fn$;

create or replace function internal_api.validate_order_rules_for_order_creation(
  p_organization_id uuid,
  p_order_id uuid,
  p_stage text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if (select auth.uid()) is null
     or p_stage is distinct from 'create'
     or not private.is_organization_member(p_organization_id)
     or not private.is_organization_module_enabled(p_organization_id, 'orders')
     or not private.has_effective_organization_permission(p_organization_id, 'orders.create')
     or not exists (
       select 1 from public.service_orders s
       where s.id = p_order_id
         and s.organization_id = p_organization_id
         and s.assigned_to = (select auth.uid())
     ) then
    raise exception 'Sem permissão para validar a criação desta OS.'
      using errcode = '42501';
  end if;

  perform private.validate_order_rules_v1(p_organization_id, p_order_id, p_stage);
end;
$fn$;

revoke all on function internal_api.effective_order_rules_for_order_creation(uuid,uuid,uuid)
  from public, anon, authenticated;
revoke all on function internal_api.validate_order_rules_for_order_creation(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function internal_api.effective_order_rules_for_order_creation(uuid,uuid,uuid)
  to authenticated;
grant execute on function internal_api.validate_order_rules_for_order_creation(uuid,uuid,text)
  to authenticated;

-- Retain the RPC's SECURITY INVOKER behavior, RLS, tenant scoping,
-- transactional rollback and idempotency. Idempotent on already-fixed DBs.
do $rewrite$
declare
  old_definition text;
  new_definition text;
begin
  select pg_get_functiondef(
    'public.create_service_order_atomic(uuid,uuid,jsonb,uuid[],uuid[],jsonb,jsonb)'::regprocedure
  ) into old_definition;

  if position('private.effective_order_rules_v1(' in old_definition) > 0
     and position('private.validate_order_rules_v1(' in old_definition) > 0 then
    new_definition := replace(
      replace(
        old_definition,
        'private.effective_order_rules_v1(',
        'internal_api.effective_order_rules_for_order_creation('
      ),
      'private.validate_order_rules_v1(',
      'internal_api.validate_order_rules_for_order_creation('
    );
    execute new_definition;
  elsif position('internal_api.effective_order_rules_for_order_creation(' in old_definition) = 0
     or position('internal_api.validate_order_rules_for_order_creation(' in old_definition) = 0 then
    raise exception 'Unexpected atomic OS RPC definition; migration aborted';
  end if;
end;
$rewrite$;

-- Private functions remain inaccessible to authenticated clients directly.
revoke all on function private.effective_order_rules_v1(uuid,uuid,uuid)
  from public, anon, authenticated;
revoke all on function private.validate_order_rules_v1(uuid,uuid,text,jsonb)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;