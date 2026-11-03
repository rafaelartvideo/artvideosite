-- Paginated search and distinct city options, evaluated with caller RLS.
begin;
create or replace function public.list_platform_service_providers(
 p_search text default '', p_service_id uuid default null, p_state text default '',
 p_city text default '', p_status text default 'all',
 p_limit int default 24, p_offset int default 0
)
returns table (
 id uuid, name text, document text, phone text, whatsapp text, email text,
 state text, city text, neighborhood text, street text, street_number text,
 zip_code text, notes text, is_active boolean, service_ids uuid[],
 service_names text[], attachment_count bigint, total_count bigint
)
language sql stable security invoker set search_path='' as $$
 select p.id,p.name,p.document,p.phone,p.whatsapp,p.email,
   p.state,p.city,p.neighborhood,p.street,p.street_number,
   p.zip_code,p.notes,p.is_active,
   coalesce((select array_agg(l.service_id) from public.platform_provider_service_links l
     where l.provider_id=p.id),array[]::uuid[]),
   coalesce((select array_agg(s.name order by s.name) from public.platform_provider_service_links l
     join public.platform_provider_services s on s.id=l.service_id
     where l.provider_id=p.id),array[]::text[]),
   (select count(*) from public.platform_provider_attachments a where a.provider_id=p.id),
   count(*) over()
 from public.platform_service_providers p
 where p.organization_id=(select public.platform_operator_organization_id())
   and (btrim(coalesce(p_search,''))='' or p.name ilike '%'||btrim(p_search)||'%'
     or p.city ilike '%'||btrim(p_search)||'%'
     or coalesce(p.neighborhood,'') ilike '%'||btrim(p_search)||'%')
   and (p_service_id is null or exists(select 1 from public.platform_provider_service_links l
      where l.provider_id=p.id and l.service_id=p_service_id))
   and (btrim(coalesce(p_state,''))='' or p.state=upper(btrim(p_state)))
   and (btrim(coalesce(p_city,''))='' or lower(p.city)=lower(btrim(p_city)))
   and (p_status not in ('active','inactive')
     or p.is_active=(p_status='active'))
 order by p.name,p.id
 limit least(greatest(coalesce(p_limit,24),1),100)
 offset greatest(coalesce(p_offset,0),0);
$$;
revoke all on function public.list_platform_service_providers(text,uuid,text,text,text,int,int) from public, anon;
grant execute on function public.list_platform_service_providers(text,uuid,text,text,text,int,int) to authenticated;

create or replace function public.list_platform_provider_locations()
returns table(state text, city text)
language sql stable security invoker set search_path='' as $$
  select distinct p.state,p.city from public.platform_service_providers p
  where p.organization_id=(select public.platform_operator_organization_id())
  order by p.state,p.city;
$$;
revoke all on function public.list_platform_provider_locations() from public, anon;
grant execute on function public.list_platform_provider_locations() to authenticated;
commit;
