begin;
create or replace function public.list_platform_service_providers_v4(
 p_search text default '', p_service_ids uuid[] default array[]::uuid[],
 p_states text[] default array[]::text[], p_cities text[] default array[]::text[],
 p_statuses text[] default array[]::text[],
 p_limit int default 24, p_offset int default 0
)
returns table (
 id uuid, name text, document text, phone text, whatsapp text, email text,
 state text, city text, neighborhood text, street text, street_number text,
 zip_code text, notes text, is_active boolean, service_ids uuid[],
 service_names text[], attachment_count bigint, total_count bigint,
 person_type text, birth_date date, gender text, legal_name text, complement text, instagram text
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
   count(*) over(),p.person_type,p.birth_date,p.gender,p.legal_name,p.complement,p.instagram
 from public.platform_service_providers p
 where p.organization_id=(select public.platform_operator_organization_id())
   and (btrim(coalesce(p_search,''))='' or p.name ilike '%'||btrim(p_search)||'%'
     or p.city ilike '%'||btrim(p_search)||'%'
     or coalesce(p.neighborhood,'') ilike '%'||btrim(p_search)||'%')
   and (cardinality(coalesce(p_service_ids, array[]::uuid[]))=0 or exists(
     select 1 from public.platform_provider_service_links l
      where l.provider_id=p.id and l.service_id=any(p_service_ids)))
   and (cardinality(coalesce(p_states, array[]::text[]))=0 or p.state=any(p_states))
   and (cardinality(coalesce(p_cities, array[]::text[]))=0
       or (p.state||':'||p.city)=any(p_cities))
   and (cardinality(coalesce(p_statuses, array[]::text[]))=0
      or (p.is_active and 'active'=any(p_statuses))
      or (not p.is_active and 'inactive'=any(p_statuses)))
 order by p.name,p.id
 limit least(greatest(coalesce(p_limit,24),1),100)
 offset greatest(coalesce(p_offset,0),0);
$$;
revoke all on function public.list_platform_service_providers_v4(text,uuid[],text[],text[],text[],int,int) from public,anon;
grant execute on function public.list_platform_service_providers_v4(text,uuid[],text[],text[],text[],int,int) to authenticated;
commit;
