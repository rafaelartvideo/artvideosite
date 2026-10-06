begin;

create or replace function public.has_sac_digital_permission(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if (select auth.uid()) is null then
    return false;
  end if;

  if p_permission_key not in (
    'sac_digital.view',
    'sac_digital.messages.view',
    'sac_digital.messages.send',
    'sac_digital.protocols.manage',
    'sac_digital.settings.manage'
  ) then
    return false;
  end if;

  return private.has_effective_organization_permission(
    p_organization_id,
    p_permission_key
  );
end;
$$;

revoke all on function public.has_sac_digital_permission(uuid,text) from public,anon;
grant execute on function public.has_sac_digital_permission(uuid,text) to authenticated;

commit;