begin;

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
  where organization_id=p_organization_id;

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
    'enabled',v_row.enabled,
    'workspace_name',v_row.workspace_name,
    'api_base_url',v_row.api_base_url,
    'client_id',v_row.client_id,
    'client_secret',v_client_secret
  );
end;
$$;

revoke all on function public.sac_digital_service_credentials(uuid) from public,anon,authenticated;
grant execute on function public.sac_digital_service_credentials(uuid) to service_role;

commit;