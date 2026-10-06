begin;

create or replace function public.get_sac_digital_integration_status(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_row public.sac_digital_integrations%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;
  if not private.has_effective_organization_permission(p_organization_id,'sac_digital.view') then
    raise exception 'Sem permissão para acessar o SAC Digital nesta empresa.' using errcode='42501';
  end if;

  select integration.* into v_row
  from public.sac_digital_integrations integration
  where integration.organization_id=p_organization_id;

  if not found then
    return jsonb_build_object(
      'organization_id',p_organization_id,
      'enabled',false,
      'credential_configured',false,
      'connection_status','not_configured',
      'last_webhook_at',null,
      'last_event_type',null,
      'last_error',null
    );
  end if;

  return jsonb_build_object(
    'organization_id',v_row.organization_id,
    'enabled',v_row.enabled,
    'credential_configured',v_row.credential_secret_id is not null,
    'connection_status',v_row.connection_status,
    'last_webhook_at',v_row.last_webhook_at,
    'last_event_type',v_row.last_event_type,
    'last_error',v_row.last_error
  );
end;
$$;

create or replace function public.get_sac_digital_integration_settings(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_row public.sac_digital_integrations%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;
  if not private.has_effective_organization_permission(p_organization_id,'sac_digital.settings.manage') then
    raise exception 'Sem permissão para gerenciar a integração SAC Digital.' using errcode='42501';
  end if;

  select integration.* into v_row
  from public.sac_digital_integrations integration
  where integration.organization_id=p_organization_id;

  if not found then
    return jsonb_build_object(
      'organization_id',p_organization_id,
      'enabled',false,
      'workspace_name','',
      'api_base_url','',
      'credential_configured',false,
      'webhook_token',null,
      'connection_status','not_configured',
      'last_webhook_at',null,
      'last_event_type',null,
      'last_error',null
    );
  end if;

  return jsonb_build_object(
    'organization_id',v_row.organization_id,
    'enabled',v_row.enabled,
    'workspace_name',coalesce(v_row.workspace_name,''),
    'api_base_url',coalesce(v_row.api_base_url,''),
    'credential_configured',v_row.credential_secret_id is not null,
    'credential_updated_at',v_row.credential_updated_at,
    'webhook_token',v_row.webhook_token,
    'connection_status',v_row.connection_status,
    'last_webhook_at',v_row.last_webhook_at,
    'last_event_type',v_row.last_event_type,
    'last_error',v_row.last_error
  );
end;
$$;

revoke all on function public.get_sac_digital_integration_status(uuid) from public,anon;
revoke all on function public.get_sac_digital_integration_settings(uuid) from public,anon;
grant execute on function public.get_sac_digital_integration_status(uuid) to authenticated;
grant execute on function public.get_sac_digital_integration_settings(uuid) to authenticated;

commit;