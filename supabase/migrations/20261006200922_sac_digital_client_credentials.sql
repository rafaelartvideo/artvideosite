begin;

alter table public.sac_digital_integrations
  add column if not exists client_id text;

alter table public.sac_digital_integrations
  drop constraint if exists sac_digital_integrations_client_id_length;

alter table public.sac_digital_integrations
  add constraint sac_digital_integrations_client_id_length
  check (client_id is null or char_length(client_id) <= 500);

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
    'credential_configured',
      nullif(pg_catalog.btrim(coalesce(v_row.client_id,'')),'') is not null
      and v_row.credential_secret_id is not null,
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
      'client_id','',
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
    'client_id',coalesce(v_row.client_id,''),
    'credential_configured',
      nullif(pg_catalog.btrim(coalesce(v_row.client_id,'')),'') is not null
      and v_row.credential_secret_id is not null,
    'credential_updated_at',v_row.credential_updated_at,
    'webhook_token',v_row.webhook_token,
    'connection_status',v_row.connection_status,
    'last_webhook_at',v_row.last_webhook_at,
    'last_event_type',v_row.last_event_type,
    'last_error',v_row.last_error
  );
end;
$$;

create or replace function public.configure_sac_digital_integration(
  p_organization_id uuid,
  p_enabled boolean,
  p_workspace_name text,
  p_api_base_url text,
  p_client_id text,
  p_client_secret text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_secret_id uuid;
  v_secret_name text := 'sac_digital_client_secret_' || p_organization_id::text;
  v_client_secret text := nullif(pg_catalog.btrim(coalesce(p_client_secret,'')),'');
  v_client_id text := nullif(pg_catalog.btrim(coalesce(p_client_id,'')),'');
  v_workspace text := nullif(pg_catalog.btrim(coalesce(p_workspace_name,'')),'');
  v_api_base_url text := nullif(pg_catalog.btrim(coalesce(p_api_base_url,'')),'');
  v_row public.sac_digital_integrations%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;
  if not private.has_effective_organization_permission(p_organization_id,'sac_digital.settings.manage') then
    raise exception 'Sem permissão para gerenciar a integração SAC Digital.' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.organization_modules
    where organization_id=p_organization_id
      and module_key='sac_digital'
      and is_enabled
  ) then
    raise exception 'O módulo SAC Digital não está habilitado para esta empresa.' using errcode='42501';
  end if;
  if v_workspace is not null and char_length(v_workspace)>200 then
    raise exception 'Nome do workspace muito longo.' using errcode='22023';
  end if;
  if v_api_base_url is not null and char_length(v_api_base_url)>2048 then
    raise exception 'URL da API muito longa.' using errcode='22023';
  end if;
  if v_client_id is not null and char_length(v_client_id)>500 then
    raise exception 'Client ID muito longo.' using errcode='22023';
  end if;

  select credential_secret_id into v_secret_id
  from public.sac_digital_integrations
  where organization_id=p_organization_id;

  if v_client_secret is not null then
    if v_secret_id is not null and exists (
      select 1 from vault.secrets where id=v_secret_id
    ) then
      perform vault.update_secret(
        v_secret_id,
        v_client_secret,
        v_secret_name,
        'Client Secret SAC Digital da organização ' || p_organization_id::text
      );
    else
      select vault.create_secret(
        v_client_secret,
        v_secret_name,
        'Client Secret SAC Digital da organização ' || p_organization_id::text
      ) into v_secret_id;
    end if;
  end if;

  insert into public.sac_digital_integrations (
    organization_id,enabled,workspace_name,api_base_url,client_id,
    credential_secret_id,credential_updated_at,connection_status,
    updated_at,updated_by
  ) values (
    p_organization_id,coalesce(p_enabled,false),v_workspace,v_api_base_url,v_client_id,
    v_secret_id,case when v_client_secret is not null then now() else null end,
    case when v_client_id is not null and v_secret_id is not null then 'configured' else 'not_configured' end,
    now(),(select auth.uid())
  )
  on conflict (organization_id) do update set
    enabled=excluded.enabled,
    workspace_name=excluded.workspace_name,
    api_base_url=excluded.api_base_url,
    client_id=excluded.client_id,
    credential_secret_id=coalesce(excluded.credential_secret_id,public.sac_digital_integrations.credential_secret_id),
    credential_updated_at=case
      when v_client_secret is not null then now()
      else public.sac_digital_integrations.credential_updated_at
    end,
    connection_status=case
      when nullif(pg_catalog.btrim(coalesce(excluded.client_id,'')),'') is not null
       and coalesce(excluded.credential_secret_id,public.sac_digital_integrations.credential_secret_id) is not null
        then case when public.sac_digital_integrations.connection_status='receiving' then 'receiving' else 'configured' end
      else 'not_configured'
    end,
    updated_at=now(),
    updated_by=(select auth.uid())
  returning * into v_row;

  return jsonb_build_object(
    'organization_id',v_row.organization_id,
    'enabled',v_row.enabled,
    'workspace_name',coalesce(v_row.workspace_name,''),
    'api_base_url',coalesce(v_row.api_base_url,''),
    'client_id',coalesce(v_row.client_id,''),
    'credential_configured',
      nullif(pg_catalog.btrim(coalesce(v_row.client_id,'')),'') is not null
      and v_row.credential_secret_id is not null,
    'credential_updated_at',v_row.credential_updated_at,
    'webhook_token',v_row.webhook_token,
    'connection_status',v_row.connection_status,
    'last_webhook_at',v_row.last_webhook_at,
    'last_event_type',v_row.last_event_type,
    'last_error',v_row.last_error
  );
end;
$$;

create or replace function public.sac_digital_service_credentials(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_row public.sac_digital_integrations%rowtype;
  v_client_secret text;
begin
  select * into v_row
  from public.sac_digital_integrations
  where organization_id=p_organization_id and enabled;

  if not found
     or nullif(pg_catalog.btrim(coalesce(v_row.client_id,'')),'') is null
     or v_row.credential_secret_id is null then
    return null;
  end if;

  select decrypted_secret into v_client_secret
  from vault.decrypted_secrets
  where id=v_row.credential_secret_id;

  if v_client_secret is null then return null; end if;

  return jsonb_build_object(
    'organization_id',v_row.organization_id,
    'workspace_name',v_row.workspace_name,
    'api_base_url',v_row.api_base_url,
    'client_id',v_row.client_id,
    'client_secret',v_client_secret
  );
end;
$$;

revoke all on function public.configure_sac_digital_integration(uuid,boolean,text,text,text,text) from public,anon;
grant execute on function public.configure_sac_digital_integration(uuid,boolean,text,text,text,text) to authenticated;

revoke all on function public.sac_digital_service_credentials(uuid) from public,anon,authenticated;
grant execute on function public.sac_digital_service_credentials(uuid) to service_role;

comment on function public.configure_sac_digital_integration(uuid,boolean,text,text,text,text)
is 'Configura o SAC Digital por empresa. Client ID fica na configuração e Client Secret é salvo no Supabase Vault sem ser retornado ao navegador.';

comment on function public.sac_digital_service_credentials(uuid)
is 'Leitura interna de client_id e client_secret do SAC Digital para funções backend; apenas service_role.';

commit;