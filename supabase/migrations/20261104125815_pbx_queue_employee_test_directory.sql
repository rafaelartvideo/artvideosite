-- Allow employees with PBX viewing permission to discover only active internal queue test numbers.
-- Does not expose configuration, members, agent state, trunk, or secrets.
create or replace function public.pbx_available_test_queues(p_organization_id uuid)
returns table(test_extension integer,name text)
language plpgsql security definer set search_path=''
as $$
begin
  if (select auth.uid()) is null
    or not private.is_platform_organization(p_organization_id)
    or not private.has_organization_permission(p_organization_id,'pbx.view') then
    raise exception 'Sem acesso às filas internas.' using errcode='42501';
  end if;
  return query
    select q.test_extension,q.name
    from public.pbx_queues q
    where q.organization_id=p_organization_id
      and q.enabled and q.provisioning_status='applied'
    order by q.test_extension
    limit 50;
end;
$$;
revoke all on function public.pbx_available_test_queues(uuid) from public,anon,authenticated;
grant execute on function public.pbx_available_test_queues(uuid) to authenticated;

