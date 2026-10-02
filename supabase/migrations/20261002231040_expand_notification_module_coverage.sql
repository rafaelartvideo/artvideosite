
begin;

create or replace function private.create_notification_from_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text;
  v_article text := 'um';
  v_feminine boolean := false;
  v_module text;
  v_route text;
  v_permissions text[] := '{}'::text[];
  v_event_type text;
  v_adjective text;
  v_verb text;
  v_actor text;
  v_detail text;
  v_uuid uuid;
  v_table text := coalesce(new.table_name, new.entity_type, '');
begin
  if new.organization_id is null or new.operation not in ('insert','update','delete') then
    return new;
  end if;

  case v_table
    when 'service_orders' then
      v_label := 'Ordem de Serviço'; v_article := 'uma'; v_feminine := true; v_module := 'orders';
      v_route := '/admin/orders/' || coalesce(new.entity_id, '');
      v_permissions := array['orders.view','orders.monitor.view'];
    when 'entities' then
      v_label := 'Cadastro'; v_module := 'customers';
      v_route := '/admin/customers/' || coalesce(new.entity_id, '');
      v_permissions := array['customers.view'];
    when 'quote_requests' then
      v_label := 'Orçamento'; v_module := 'quotes';
      v_route := '/admin/quotes/' || coalesce(new.entity_id, '');
      v_permissions := array['quotes.view'];
    when 'request_statuses' then
      v_label := 'Status de orçamento'; v_module := 'quotes';
      v_route := '/admin/quotes';
      v_permissions := array['quotes.view'];
    when 'appointments' then
      v_label := 'Agendamento'; v_module := 'agenda';
      v_route := '/admin/agenda/' || coalesce(new.entity_id, '');
      v_permissions := array['agenda.view'];
    when 'appointment_situations' then
      v_label := 'Situação da agenda'; v_article := 'uma'; v_feminine := true; v_module := 'agenda';
      v_route := '/admin/agenda';
      v_permissions := array['agenda.view'];
    when 'inventory_items' then
      v_label := 'Item de estoque'; v_module := 'inventory';
      v_route := '/admin/inventory/' || coalesce(new.entity_id, '');
      v_permissions := array['inventory.view','products.view'];
    when 'products' then
      v_label := 'Produto'; v_module := 'inventory';
      v_route := '/admin/inventory';
      v_permissions := array['inventory.view','products.view'];
    when 'pdv_sales' then
      v_label := 'Venda'; v_article := 'uma'; v_feminine := true; v_module := 'pdv';
      v_route := '/admin/pdv';
      v_permissions := array['pdv.view'];
    when 'pdv_settings' then
      v_label := 'Configuração do PDV'; v_article := 'uma'; v_feminine := true; v_module := 'pdv';
      v_route := '/admin/pdv';
      v_permissions := array['pdv.view'];
    when 'financial_entries' then
      v_label := 'Lançamento financeiro'; v_module := 'finance';
      v_route := '/admin/finance';
      v_permissions := array['finance.view'];
    when 'financial_accounts' then
      v_label := 'Conta financeira'; v_article := 'uma'; v_feminine := true; v_module := 'finance';
      v_route := '/admin/finance';
      v_permissions := array['finance.view'];
    when 'financial_categories' then
      v_label := 'Categoria financeira'; v_article := 'uma'; v_feminine := true; v_module := 'finance';
      v_route := '/admin/finance';
      v_permissions := array['finance.view'];
    when 'financial_cost_centers' then
      v_label := 'Centro de custo'; v_module := 'finance';
      v_route := '/admin/finance';
      v_permissions := array['finance.view'];
    when 'financial_payment_methods' then
      v_label := 'Forma de pagamento'; v_article := 'uma'; v_feminine := true; v_module := 'finance';
      v_route := '/admin/finance';
      v_permissions := array['finance.view'];
    when 'financial_recurring_rules' then
      v_label := 'Regra de recorrência'; v_article := 'uma'; v_feminine := true; v_module := 'finance';
      v_route := '/admin/finance';
      v_permissions := array['finance.view'];
    when 'financial_settings' then
      v_label := 'Configuração financeira'; v_article := 'uma'; v_feminine := true; v_module := 'finance';
      v_route := '/admin/finance';
      v_permissions := array['finance.view'];
    when 'financial_transfers' then
      v_label := 'Transferência financeira'; v_article := 'uma'; v_feminine := true; v_module := 'finance';
      v_route := '/admin/finance';
      v_permissions := array['finance.view'];
    when 'financial_settlements' then
      v_label := 'Baixa financeira'; v_article := 'uma'; v_feminine := true; v_module := 'finance';
      v_route := '/admin/finance';
      v_permissions := array['finance.view'];
    when 'financial_cash_sessions' then
      v_label := 'Sessão de caixa'; v_article := 'uma'; v_feminine := true; v_module := 'finance';
      v_route := '/admin/finance';
      v_permissions := array['finance.view'];
    when 'equipment_types' then
      v_label := 'Tipo de equipamento'; v_module := 'equipment';
      v_route := '/admin/operation/equipment';
      v_permissions := array['equipment.view'];
    when 'equipment_brands' then
      v_label := 'Marca de equipamento'; v_article := 'uma'; v_feminine := true; v_module := 'equipment';
      v_route := '/admin/operation/equipment';
      v_permissions := array['equipment.view'];
    when 'equipment_models' then
      v_label := 'Modelo de equipamento'; v_module := 'equipment';
      v_route := '/admin/operation/equipment';
      v_permissions := array['equipment.view'];
    when 'checklist_profiles' then
      v_label := 'Checklist'; v_module := 'checklists';
      v_route := '/admin/operation/checklists';
      v_permissions := array['checklists.view'];
    when 'general_services' then
      v_label := 'Serviço Geral'; v_module := 'generalServices';
      v_route := '/admin/operation/general-services';
      v_permissions := array['general_services.view'];
    when 'service_types' then
      v_label := 'Tipo de Atendimento'; v_module := 'serviceTypes';
      v_route := '/admin/operation/service-types';
      v_permissions := array['service_types.view'];
    when 'os_situations' then
      v_label := 'Situação da OS'; v_article := 'uma'; v_feminine := true; v_module := 'situations';
      v_route := '/admin/operation/order-situations';
      v_permissions := array['situations.view'];
    when 'order_statuses' then
      v_label := 'Status da OS'; v_module := 'orderStatuses';
      v_route := '/admin/operation/order-statuses';
      v_permissions := array['order_statuses.view'];
    when 'roles' then
      v_label := 'Função'; v_article := 'uma'; v_feminine := true; v_module := 'roles';
      v_route := '/admin/operation/roles';
      v_permissions := array['roles.view'];
    when 'print_templates' then
      v_label := 'Modelo de documento'; v_module := 'documents';
      v_route := '/admin/operation/documents';
      v_permissions := array['documents.view'];
    when 'attachment_types' then
      v_label := 'Tipo de anexo'; v_module := 'documents';
      v_route := '/admin/operation/documents';
      v_permissions := array['documents.view'];
    when 'document_signature_requests' then
      v_label := 'Solicitação de assinatura'; v_article := 'uma'; v_feminine := true; v_module := 'documents';
      v_route := '/admin/operation/documents';
      v_permissions := array['documents.view'];
    when 'document_signatures' then
      v_label := 'Assinatura'; v_article := 'uma'; v_feminine := true; v_module := 'documents';
      v_route := '/admin/operation/documents';
      v_permissions := array['documents.view'];
    when 'organization_terms' then
      v_label := 'Termo'; v_module := 'terms';
      v_route := '/admin/operation/terms';
      v_permissions := array['terms.view'];
    when 'service_warranty_terms' then
      v_label := 'Garantia'; v_article := 'uma'; v_feminine := true; v_module := 'terms';
      v_route := '/admin/operation/terms';
      v_permissions := array['terms.view'];
    when 'organization_company_settings' then
      v_label := 'Dados da empresa'; v_article := 'os'; v_module := 'settings';
      v_route := '/admin/operation/company';
      v_permissions := array['settings.details.view'];
    when 'services' then
      v_label := 'Serviço do Site'; v_module := 'services';
      v_route := '/admin/site/services';
      v_permissions := array['services.view'];
    when 'brands' then
      v_label := 'Marca'; v_article := 'uma'; v_feminine := true; v_module := 'brands';
      v_route := '/admin/site/brands';
      v_permissions := array['brands.view'];
    when 'service_categories' then
      v_label := 'Categoria'; v_article := 'uma'; v_feminine := true; v_module := 'categories';
      v_route := '/admin/site/categories';
      v_permissions := array['categories.view'];
    when 'product_categories' then
      v_label := 'Categoria'; v_article := 'uma'; v_feminine := true; v_module := 'categories';
      v_route := '/admin/site/categories';
      v_permissions := array['categories.view'];
    when 'site_settings' then
      v_label := 'Configuração do site'; v_article := 'uma'; v_feminine := true; v_module := 'siteSettings';
      v_route := '/admin/site/settings';
      v_permissions := array['site_settings.view'];
    when 'site_pages' then
      v_label := 'Página do site'; v_article := 'uma'; v_feminine := true; v_module := 'siteSettings';
      v_route := '/admin/site/settings';
      v_permissions := array['site_settings.view'];
    when 'navigation_items' then
      v_label := 'Item de navegação'; v_module := 'siteSettings';
      v_route := '/admin/site/settings';
      v_permissions := array['site_settings.view'];
    when 'contact_fields' then
      v_label := 'Informação de contato'; v_article := 'uma'; v_feminine := true; v_module := 'contact';
      v_route := '/admin/contact';
      v_permissions := array['contact.view'];
    when 'organization_members' then
      v_label := 'Acesso de usuário'; v_module := 'roles';
      v_route := '/admin/operation/roles';
      v_permissions := array['roles.view'];
    when 'organization_modules' then
      v_label := 'Módulo da empresa'; v_module := 'partnerCompanies';
      v_route := '/admin/partner-companies';
      v_permissions := array['organizations.view'];
    when 'organizations' then
      v_label := 'Empresa parceira'; v_article := 'uma'; v_feminine := true; v_module := 'partnerCompanies';
      v_route := '/admin/partner-companies';
      v_permissions := array['organizations.view'];
    when 'field_tracking_units' then
      v_label := 'Rastreador'; v_module := 'fieldTracking';
      v_route := '/admin/field-map';
      v_permissions := array['field_tracking.view','field_tracking.manage'];
    when 'field_tracking_integrations' then
      v_label := 'Integração de rastreamento'; v_article := 'uma'; v_feminine := true; v_module := 'fieldTracking';
      v_route := '/admin/field-map';
      v_permissions := array['field_tracking.view','field_tracking.manage'];
    else
      return new;
  end case;

  v_event_type := case new.operation
    when 'insert' then 'created'
    when 'update' then 'updated'
    else 'deleted'
  end;

  v_adjective := case new.operation
    when 'insert' then case when v_feminine then 'criada' else 'criado' end
    when 'update' then case when v_feminine then 'editada' else 'editado' end
    else case when v_feminine then 'excluída' else 'excluído' end
  end;

  if v_table = 'organization_company_settings' then
    v_adjective := case new.operation
      when 'insert' then 'cadastrados'
      when 'update' then 'editados'
      else 'excluídos'
    end;
  end if;

  v_verb := case new.operation
    when 'insert' then 'criou'
    when 'update' then 'editou'
    else 'excluiu'
  end;

  v_actor := coalesce(nullif(btrim(new.actor_name_snapshot), ''), 'Sistema');
  v_uuid := private.audit_try_uuid(new.entity_id);

  if v_table = 'service_orders' then
    if new.operation = 'delete' then
      v_detail := coalesce(new.row_snapshot ->> 'os_number', new.row_snapshot ->> 'number');
    elsif v_uuid is not null then
      select coalesce(to_jsonb(service_order) ->> 'os_number', to_jsonb(service_order) ->> 'number')
      into v_detail
      from public.service_orders service_order
      where service_order.id = v_uuid;
    end if;
  elsif v_table = 'entities' then
    if new.operation = 'delete' then
      v_detail := coalesce(
        nullif(new.row_snapshot ->> 'name', ''),
        nullif(new.row_snapshot ->> 'trade_name', ''),
        nullif(new.row_snapshot ->> 'legal_name', '')
      );
    elsif v_uuid is not null then
      select coalesce(
        nullif(entity.name, ''),
        nullif(entity.trade_name, ''),
        nullif(entity.legal_name, '')
      )
      into v_detail
      from public.entities entity
      where entity.id = v_uuid;
    end if;
  elsif v_table = 'inventory_items' then
    if new.operation = 'delete' then
      v_detail := coalesce(
        nullif(new.row_snapshot ->> 'name', ''),
        nullif(new.row_snapshot ->> 'description', ''),
        nullif(new.row_snapshot ->> 'sku', '')
      );
    elsif v_uuid is not null then
      select coalesce(
        nullif(to_jsonb(item) ->> 'name', ''),
        nullif(to_jsonb(item) ->> 'description', ''),
        nullif(to_jsonb(item) ->> 'sku', '')
      )
      into v_detail
      from public.inventory_items item
      where item.id = v_uuid;
    end if;
  elsif v_table = 'pdv_sales' then
    if new.operation = 'delete' then
      v_detail := new.row_snapshot ->> 'sale_number';
    elsif v_uuid is not null then
      select nullif(to_jsonb(sale) ->> 'sale_number', '')
      into v_detail
      from public.pdv_sales sale
      where sale.id = v_uuid;
    end if;
  elsif v_table = 'field_tracking_units' then
    v_detail := coalesce(
      nullif(new.row_snapshot ->> 'name', ''),
      nullif(new.metadata ->> 'unit_name', '')
    );
    if new.operation <> 'delete' and v_uuid is not null then
      select nullif(unit.name, '')
      into v_detail
      from public.field_tracking_units unit
      where unit.id = v_uuid;
    end if;
  end if;

  insert into public.organization_notifications (
    organization_id,
    audit_log_id,
    actor_user_id,
    actor_name_snapshot,
    module_key,
    event_type,
    entity_type,
    entity_id,
    title,
    message,
    route,
    visibility_permissions,
    metadata,
    created_at
  )
  values (
    new.organization_id,
    new.id,
    new.actor_user_id,
    new.actor_name_snapshot,
    v_module,
    v_event_type,
    v_table,
    new.entity_id,
    case
      when v_table = 'service_orders' and nullif(v_detail, '') is not null
        then 'OS #' || v_detail || ' ' || v_adjective
      when nullif(v_detail, '') is not null
        then v_label || ' ' || v_adjective || ': ' || v_detail
      else v_label || ' ' || v_adjective
    end,
    case
      when v_table = 'organization_company_settings'
        then v_actor || ' editou os dados da empresa.'
      else v_actor || ' ' || v_verb || ' ' || v_article || ' ' || lower(v_label) || '.'
    end,
    nullif(v_route, ''),
    v_permissions,
    jsonb_build_object(
      'audit_action', new.action,
      'audit_operation', new.operation,
      'detail', v_detail
    ),
    coalesce(new.created_at, now())
  )
  on conflict (audit_log_id) do nothing;

  return new;
end;
$$;

revoke all on function private.create_notification_from_audit() from public;

create or replace function private.audit_field_tracking_unit_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_actor_name text;
  v_changed jsonb := '{}'::jsonb;
  v_snapshot jsonb := '{}'::jsonb;
  v_operation text := lower(tg_op);
  v_row jsonb;
begin
  if tg_op = 'UPDATE'
     and row(
       new.name,
       new.unit_type,
       new.linked_user_id,
       new.identifier_type,
       new.identifier_value,
       new.tracking_provider,
       new.is_active
     ) is not distinct from row(
       old.name,
       old.unit_type,
       old.linked_user_id,
       old.identifier_type,
       old.identifier_value,
       old.tracking_provider,
       old.is_active
     )
  then
    return new;
  end if;

  v_actor := coalesce((select auth.uid()), new.created_by, case when tg_op = 'DELETE' then old.created_by else null end);

  if v_actor is not null then
    select profile.full_name
      into v_actor_name
    from public.profiles profile
    where profile.id = v_actor;
  end if;

  if tg_op = 'UPDATE' then
    if new.name is distinct from old.name then
      v_changed := v_changed || jsonb_build_object('name', jsonb_build_object('before', old.name, 'after', new.name));
    end if;
    if new.unit_type is distinct from old.unit_type then
      v_changed := v_changed || jsonb_build_object('unit_type', jsonb_build_object('before', old.unit_type, 'after', new.unit_type));
    end if;
    if new.linked_user_id is distinct from old.linked_user_id then
      v_changed := v_changed || jsonb_build_object('linked_user_id', jsonb_build_object('before', old.linked_user_id, 'after', new.linked_user_id));
    end if;
    if new.identifier_type is distinct from old.identifier_type then
      v_changed := v_changed || jsonb_build_object('identifier_type', jsonb_build_object('before', old.identifier_type, 'after', new.identifier_type));
    end if;
    if new.identifier_value is distinct from old.identifier_value then
      v_changed := v_changed || jsonb_build_object('identifier_value', jsonb_build_object('before', old.identifier_value, 'after', new.identifier_value));
    end if;
    if new.tracking_provider is distinct from old.tracking_provider then
      v_changed := v_changed || jsonb_build_object('tracking_provider', jsonb_build_object('before', old.tracking_provider, 'after', new.tracking_provider));
    end if;
    if new.is_active is distinct from old.is_active then
      v_changed := v_changed || jsonb_build_object('is_active', jsonb_build_object('before', old.is_active, 'after', new.is_active));
    end if;
  end if;

  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_snapshot := jsonb_build_object(
    'id', v_row -> 'id',
    'name', v_row -> 'name',
    'unit_type', v_row -> 'unit_type',
    'linked_user_id', v_row -> 'linked_user_id',
    'identifier_type', v_row -> 'identifier_type',
    'identifier_value', v_row -> 'identifier_value',
    'tracking_provider', v_row -> 'tracking_provider',
    'is_active', v_row -> 'is_active'
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
    coalesce(new.organization_id, old.organization_id),
    v_actor,
    v_actor_name,
    'field_tracking_units.' || v_operation,
    v_operation,
    'field_tracking_units',
    coalesce(new.id, old.id)::text,
    'field_tracking_units',
    'field_tracking',
    'field_tracking_unit',
    coalesce(new.id, old.id)::text,
    case when (select auth.uid()) is not null then 'authenticated_user' else 'system' end,
    v_changed,
    v_snapshot,
    jsonb_build_object('schema', tg_table_schema, 'trigger', 'field_tracking_audit_v1', 'unit_name', coalesce(new.name, old.name))
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.audit_field_tracking_unit_change() from public;

drop trigger if exists audit_field_tracking_unit_change on public.field_tracking_units;
create trigger audit_field_tracking_unit_change
after insert or update or delete on public.field_tracking_units
for each row execute function private.audit_field_tracking_unit_change();

create or replace function private.audit_field_tracking_integration_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_actor_name text;
  v_changed jsonb := '{}'::jsonb;
  v_snapshot jsonb := '{}'::jsonb;
  v_operation text := lower(tg_op);
  v_row jsonb;
begin
  if tg_op = 'UPDATE'
     and row(new.provider, new.token_hint, new.is_active)
       is not distinct from row(old.provider, old.token_hint, old.is_active)
  then
    return new;
  end if;

  v_actor := coalesce((select auth.uid()), new.created_by, case when tg_op = 'DELETE' then old.created_by else null end);

  if v_actor is not null then
    select profile.full_name
      into v_actor_name
    from public.profiles profile
    where profile.id = v_actor;
  end if;

  if tg_op = 'UPDATE' then
    if new.provider is distinct from old.provider then
      v_changed := v_changed || jsonb_build_object('provider', jsonb_build_object('before', old.provider, 'after', new.provider));
    end if;
    if new.token_hint is distinct from old.token_hint then
      v_changed := v_changed || jsonb_build_object('token_hint', jsonb_build_object('before', old.token_hint, 'after', new.token_hint));
    end if;
    if new.is_active is distinct from old.is_active then
      v_changed := v_changed || jsonb_build_object('is_active', jsonb_build_object('before', old.is_active, 'after', new.is_active));
    end if;
  end if;

  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_snapshot := jsonb_build_object(
    'id', v_row -> 'id',
    'provider', v_row -> 'provider',
    'token_hint', v_row -> 'token_hint',
    'is_active', v_row -> 'is_active'
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
    coalesce(new.organization_id, old.organization_id),
    v_actor,
    v_actor_name,
    'field_tracking_integrations.' || v_operation,
    v_operation,
    'field_tracking_integrations',
    coalesce(new.id, old.id)::text,
    'field_tracking_integrations',
    'field_tracking',
    'field_tracking_integration',
    coalesce(new.id, old.id)::text,
    case when (select auth.uid()) is not null then 'authenticated_user' else 'system' end,
    v_changed,
    v_snapshot,
    jsonb_build_object('schema', tg_table_schema, 'trigger', 'field_tracking_audit_v1')
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.audit_field_tracking_integration_change() from public;

drop trigger if exists audit_field_tracking_integration_change on public.field_tracking_integrations;
create trigger audit_field_tracking_integration_change
after insert or update or delete on public.field_tracking_integrations
for each row execute function private.audit_field_tracking_integration_change();

commit;
