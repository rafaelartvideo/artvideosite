begin;
alter table public.platform_service_providers
  add column if not exists person_type text not null default 'PF' check(person_type in ('PF','PJ')),
  add column if not exists birth_date date,
  add column if not exists gender text check(gender in ('M','F','I')),
  add column if not exists legal_name text,
  add column if not exists complement text;

create or replace function public.save_platform_service_provider(
 p_provider_id uuid, p_payload jsonb, p_service_ids uuid[]
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_org uuid := public.platform_operator_organization_id();
  v_id uuid := coalesce(p_provider_id,gen_random_uuid());
  v_service_ids uuid[];
  v_name text := btrim(coalesce(p_payload->>'name',''));
  v_state text := upper(btrim(coalesce(p_payload->>'state','')));
  v_city text := btrim(coalesce(p_payload->>'city',''));
  v_person_type text := coalesce(nullif(p_payload->>'person_type',''),'PF');
begin
  if v_person_type not in ('PF','PJ') then raise exception 'Tipo de pessoa inválido.'; end if;
  if not private.has_organization_permission(v_org,'platform.providers.manage') then
    raise exception 'Acesso negado ao cadastro de prestadores.' using errcode='42501';
  end if;
  select array_agg(distinct i) into v_service_ids from unnest(coalesce(p_service_ids,array[]::uuid[])) i where i is not null;
  if cardinality(coalesce(v_service_ids,array[]::uuid[])) = 0 then
    raise exception 'Selecione ao menos um serviço.';
  end if;
  if (select count(*) from public.platform_provider_services where organization_id=v_org and id=any(v_service_ids)) <> cardinality(v_service_ids) then
    raise exception 'Um ou mais serviços selecionados não existem.';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 160 or v_state !~ '^[A-Z]{2}$'
     or char_length(v_city) < 2 or char_length(v_city) > 120 then
    raise exception 'Informe nome, estado e cidade válidos.';
  end if;
  if nullif(btrim(coalesce(p_payload->>'phone','')),'') is null
     and nullif(btrim(coalesce(p_payload->>'whatsapp','')),'') is null then
    raise exception 'Informe telefone ou WhatsApp.';
  end if;

  if p_provider_id is null then
    insert into public.platform_service_providers
      (id,organization_id,name,document,phone,whatsapp,email,state,city,neighborhood,street,street_number,zip_code,notes,is_active,person_type,birth_date,gender,legal_name,complement)
    values
      (v_id,v_org,v_name,nullif(btrim(p_payload->>'document'),''),
       nullif(btrim(p_payload->>'phone'),''),nullif(btrim(p_payload->>'whatsapp'),''),
       nullif(btrim(p_payload->>'email'),''),v_state,v_city,
       nullif(btrim(p_payload->>'neighborhood'),''),nullif(btrim(p_payload->>'street'),''),
       nullif(btrim(p_payload->>'street_number'),''),nullif(btrim(p_payload->>'zip_code'),''),
       nullif(btrim(p_payload->>'notes'),''),coalesce((p_payload->>'is_active')::boolean,true),
       v_person_type,nullif(p_payload->>'birth_date','')::date,
       nullif(p_payload->>'gender',''),nullif(btrim(p_payload->>'legal_name'),''),
       nullif(btrim(p_payload->>'complement'),''));
  else
    update public.platform_service_providers set
      name=v_name, document=nullif(btrim(p_payload->>'document'),''),
      phone=nullif(btrim(p_payload->>'phone'),''),whatsapp=nullif(btrim(p_payload->>'whatsapp'),''),
      email=nullif(btrim(p_payload->>'email'),''),state=v_state,city=v_city,
      neighborhood=nullif(btrim(p_payload->>'neighborhood'),''),
      street=nullif(btrim(p_payload->>'street'),''),
      street_number=nullif(btrim(p_payload->>'street_number'),''),
      zip_code=nullif(btrim(p_payload->>'zip_code'),''),
      notes=nullif(btrim(p_payload->>'notes'),''),
      is_active=coalesce((p_payload->>'is_active')::boolean,true),
      person_type=v_person_type,birth_date=nullif(p_payload->>'birth_date','')::date,
      gender=nullif(p_payload->>'gender',''),
      legal_name=nullif(btrim(p_payload->>'legal_name'),''),
      complement=nullif(btrim(p_payload->>'complement'),''),updated_at=now()
    where id=v_id and organization_id=v_org;
    if not found then
      raise exception 'Prestador não encontrado ou sem permissão.' using errcode='42501';
    end if;
  end if;
  delete from public.platform_provider_service_links
    where organization_id=v_org and provider_id=v_id and not (service_id=any(v_service_ids));
  insert into public.platform_provider_service_links(organization_id,provider_id,service_id)
  select v_org,v_id,i from unnest(v_service_ids) i on conflict do nothing;
  return v_id;
end $$;
create or replace function public.list_platform_service_providers_v2(
 p_search text default '', p_service_id uuid default null, p_state text default '',
 p_city text default '', p_status text default 'all',
 p_limit int default 24, p_offset int default 0
)
returns table (
 id uuid, name text, document text, phone text, whatsapp text, email text,
 state text, city text, neighborhood text, street text, street_number text,
 zip_code text, notes text, is_active boolean, service_ids uuid[],
 service_names text[], attachment_count bigint, total_count bigint,
 person_type text, birth_date date, gender text, legal_name text, complement text
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
   count(*) over(),p.person_type,p.birth_date,p.gender,p.legal_name,p.complement
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
revoke all on function public.list_platform_service_providers_v2(text,uuid,text,text,text,int,int) from public,anon;
grant execute on function public.list_platform_service_providers_v2(text,uuid,text,text,text,int,int) to authenticated;
commit;