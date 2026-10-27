-- Permitir registrar alteracoes originadas de contas do site que nao possuem perfil de funcionario.\n
CREATE OR REPLACE FUNCTION private.audit_log_row_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_old_raw jsonb := '{}'::jsonb;
  v_new_raw jsonb := '{}'::jsonb;
  v_row_raw jsonb := '{}'::jsonb;
  v_old_safe jsonb := '{}'::jsonb;
  v_new_safe jsonb := '{}'::jsonb;
  v_changed jsonb := '{}'::jsonb;
  v_snapshot jsonb;
  v_org uuid;
  v_actor uuid;
  v_actor_name text;
  v_operation text;
  v_context jsonb;
  v_entity_id text;
  v_source text;
begin
  -- Alterações distribuídas pelo catálogo da Union não representam uma ação humana.
  -- Não gerar auditoria nem notificações (que derivam dos registros de auditoria).
  if current_setting('app.union_catalog_automatic',true) = 'on' then
    if TG_OP='DELETE' then return OLD; end if;
    return NEW;
  end if;
  v_operation := lower(TG_OP);

  if TG_OP = 'INSERT' then
    v_new_raw := to_jsonb(NEW);
    v_row_raw := v_new_raw;
  elsif TG_OP = 'UPDATE' then
    v_old_raw := to_jsonb(OLD);
    v_new_raw := to_jsonb(NEW);
    v_row_raw := v_new_raw;
  else
    v_old_raw := to_jsonb(OLD);
    v_row_raw := v_old_raw;
  end if;

  v_org := private.audit_try_uuid(v_row_raw ->> 'organization_id');

  if v_org is null and TG_TABLE_NAME = 'role_permissions' then
    select r.organization_id
      into v_org
    from public.roles r
    where r.id = private.audit_try_uuid(v_row_raw ->> 'role_id');
  end if;

  if v_org is null then
    if TG_OP = 'DELETE' then return OLD; end if;
    return NEW;
  end if;

  v_old_safe := private.audit_safe_row(v_old_raw);
  v_new_safe := private.audit_safe_row(v_new_raw);

  if TG_OP = 'UPDATE' then
    select coalesce(
      jsonb_object_agg(
        keys.key,
        jsonb_build_object(
          'before', v_old_safe -> keys.key,
          'after', v_new_safe -> keys.key
        )
      ),
      '{}'::jsonb
    )
    into v_changed
    from (
      select key from jsonb_object_keys(v_old_safe) as old_keys(key)
      union
      select key from jsonb_object_keys(v_new_safe) as new_keys(key)
    ) keys
    where (v_old_safe -> keys.key) is distinct from (v_new_safe -> keys.key);

    if v_changed = '{}'::jsonb then
      return NEW;
    end if;
  elsif TG_OP = 'INSERT' then
    v_snapshot := v_new_safe;
  else
    v_snapshot := v_old_safe;
  end if;

  v_actor := auth.uid();
  if v_actor is null then
    v_actor := private.audit_actor_from_row(v_row_raw, v_operation);
  end if;

  if v_actor is not null then
    select p.full_name
      into v_actor_name
    from public.profiles p
    where p.id = v_actor;
    -- Uma conta do site pode existir em auth.users sem perfil de funcionario no CRM.
    -- A auditoria continua, mas a FK de actor_user_id deve receber NULL nesse caso.
    if not found then
      v_actor := null;
    end if;
  end if;

  v_source := case
    when auth.uid() is not null then 'authenticated_user'
    when v_actor is not null then 'server_on_behalf'
    else 'system'
  end;

  v_context := private.audit_context_for_row(TG_TABLE_NAME, v_row_raw);

  v_entity_id := coalesce(
    v_row_raw ->> 'id',
    v_row_raw ->> 'service_order_id',
    v_row_raw ->> 'entity_id',
    v_row_raw ->> 'customer_id',
    v_row_raw ->> 'financial_entry_id',
    v_row_raw ->> 'inventory_item_id',
    v_row_raw ->> 'appointment_id',
    v_row_raw ->> 'quote_request_id',
    v_row_raw ->> 'role_id',
    v_row_raw ->> 'user_id'
  );

  insert into public.organization_audit_logs (
    organization_id,
    actor_user_id,
    actor_name_snapshot,
    action,
    operation,
    entity_type,
    entity_id,
    table_name,
    module_key,
    context_type,
    context_id,
    source,
    changed_fields,
    row_snapshot,
    metadata
  )
  values (
    v_org,
    v_actor,
    v_actor_name,
    TG_TABLE_NAME || '.' || v_operation,
    v_operation,
    TG_TABLE_NAME,
    v_entity_id,
    TG_TABLE_NAME,
    private.audit_module_for_table(TG_TABLE_NAME),
    v_context ->> 'type',
    v_context ->> 'id',
    v_source,
    case when TG_OP = 'UPDATE' then v_changed else '{}'::jsonb end,
    v_snapshot,
    jsonb_build_object(
      'schema', TG_TABLE_SCHEMA,
      'trigger', 'universal_audit_v1'
    )
  );

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$function$
;
