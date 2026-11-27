-- Manage queue membership from the extension screen without touching SIP claims.
create or replace function private.pbx_extension_queue_settings(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.pbx_has_permission(p_org,'pbx.manage') then raise exception 'Permission denied' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'name',q.name,'status',q.provisioning_status,
 'extension_ids',(select coalesce(jsonb_agg(m.extension_id order by m.position),'[]') from public.pbx_queue_members m where m.queue_id=q.id)) order by q.test_extension)
 from public.pbx_queues q where q.organization_id=p_org and q.enabled),'[]'::jsonb);
end;$$;
create or replace function private.pbx_set_extension_queues(p_org uuid,p_extension uuid,p_expected uuid[],p_selected uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare q public.pbx_queues%rowtype; current_ids uuid[]; desired_ids uuid[];members uuid[];
begin
 if not private.pbx_has_permission(p_org,'pbx.manage') then raise exception 'Permission denied' using errcode='42501';end if;
 if p_expected is null or p_selected is null or cardinality(p_selected)>50 or cardinality(p_expected)>50 then raise exception 'Filas invalidas' using errcode='23514';end if;
 if not exists(select 1 from public.pbx_extensions e where e.id=p_extension and e.organization_id=p_org and e.desired_enabled and e.provisioning_status in ('applied','manual')) then raise exception 'Ramal indisponivel' using errcode='23514';end if;
 -- Lock only this tenant's queue rows in stable order, and preserve other members.
 perform 1 from public.pbx_queues where organization_id=p_org and enabled order by id for update;
 select coalesce(array_agg(q.id order by q.id),'{}'::uuid[]) into current_ids from public.pbx_queues q join public.pbx_queue_members m on m.queue_id=q.id where q.organization_id=p_org and q.enabled and m.extension_id=p_extension;
 if current_ids is distinct from (select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) from unnest(p_expected) x) then raise exception 'Filas alteradas; atualize' using errcode='40001';end if;
 select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into desired_ids from unnest(p_selected) x;
 if cardinality(desired_ids)<>cardinality(p_selected) or exists(select 1 from unnest(desired_ids) x where not exists(select 1 from public.pbx_queues q where q.id=x and q.organization_id=p_org and q.enabled)) then raise exception 'Fila indisponivel' using errcode='23514';end if;
 for q in select * from public.pbx_queues where organization_id=p_org and enabled and (id=any(current_ids)) is distinct from (id=any(desired_ids)) order by id loop
  select coalesce(array_agg(m.extension_id order by m.position),'{}'::uuid[]) into members from public.pbx_queue_members m where m.queue_id=q.id and m.extension_id<>p_extension;
  if q.id=any(desired_ids) then members:=array_append(members,p_extension);end if;
  perform private.pbx_save_queue(p_org,q.id,q.name,q.test_extension,q.strategy,q.ring_seconds,q.max_wait_seconds,q.enabled,members);
 end loop;
end;$$;
create or replace function public.pbx_extension_queue_settings(p_org uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.pbx_extension_queue_settings(p_org);$$;
create or replace function public.pbx_set_extension_queues(p_org uuid,p_extension uuid,p_expected uuid[],p_selected uuid[]) returns void language sql security invoker set search_path='' as $$select private.pbx_set_extension_queues(p_org,p_extension,p_expected,p_selected);$$;
revoke all on function private.pbx_extension_queue_settings(uuid),private.pbx_set_extension_queues(uuid,uuid,uuid[],uuid[]),public.pbx_extension_queue_settings(uuid),public.pbx_set_extension_queues(uuid,uuid,uuid[],uuid[]) from public,anon,authenticated,service_role;
grant execute on function private.pbx_extension_queue_settings(uuid),private.pbx_set_extension_queues(uuid,uuid,uuid[],uuid[]),public.pbx_extension_queue_settings(uuid),public.pbx_set_extension_queues(uuid,uuid,uuid[],uuid[]) to authenticated;
