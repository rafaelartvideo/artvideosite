-- Remove o UUID raiz restante das funções atuais.
-- Cada função passa a resolver seu papel (Union World ou ArtVideo) pelos marcadores
-- registrados em organizations.settings.

do $$
declare
  v_target record;
  v_definition text;
  v_legacy_literal constant text := '''00000000-0000-4000-8000-000000000001''::uuid';
begin
  for v_target in
    select *
    from (
      values
        ('private', 'enforce_artvideo_only_site_modules', 'public.artvideo_organization_id()'),
        ('private', 'ensure_partner_default_roles', 'public.platform_operator_organization_id()'),
        ('private', 'provision_partner_default_roles', 'public.platform_operator_organization_id()'),
        ('private', 'sync_partner_company_settings_from_organization', 'public.platform_operator_organization_id()'),
        ('public', 'apply_uniq_call_event', 'public.artvideo_organization_id()'),
        ('public', 'observed_uniq_subscribers', 'public.artvideo_organization_id()'),
        ('public', 'set_employee_uniq_subscriber', 'public.artvideo_organization_id()'),
        ('public', 'set_partner_data_share', 'public.platform_operator_organization_id()'),
        ('public', 'submit_public_quote_request', 'public.artvideo_organization_id()'),
        ('public', 'track_service_order', 'public.artvideo_organization_id()')
    ) as targets(schema_name, function_name, resolver_expression)
  loop
    select pg_get_functiondef(p.oid)
      into v_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = v_target.schema_name
      and p.proname = v_target.function_name
      and p.prokind = 'f';

    if v_definition is null then
      raise exception 'Função %.% não encontrada durante migração de identidade.',
        v_target.schema_name,
        v_target.function_name;
    end if;

    if position(v_legacy_literal in v_definition) = 0 then
      continue;
    end if;

    v_definition := replace(
      v_definition,
      v_legacy_literal,
      v_target.resolver_expression
    );

    execute v_definition;
  end loop;
end;
$$;
