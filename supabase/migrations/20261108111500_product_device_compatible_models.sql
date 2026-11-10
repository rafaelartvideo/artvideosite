-- Modelos de equipamentos compatíveis com cada produto (não são SKUs nem produtos relacionados).
-- Variações herdam modelos do principal até que a compatibilidade seja personalizada.
begin;

create table if not exists public.product_device_compatible_models (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 product_id uuid not null references public.products(id) on delete cascade,
 device_type text not null,
 brand text not null,
 model text not null,
 device_type_key text not null,
 brand_key text not null,
 model_key text not null,
 created_by uuid references public.profiles(id) on delete set null default auth.uid(),
 created_at timestamptz not null default now(),
 constraint compatible_device_type_length check (char_length(device_type) between 1 and 60),
 constraint compatible_device_brand_length check (char_length(brand) between 1 and 80),
 constraint compatible_device_model_length check (char_length(model) between 1 and 120),
 constraint compatible_device_model_key_nonempty check (model_key<>'' and brand_key<>'' and device_type_key<>''),
 unique (organization_id,product_id,device_type_key,brand_key,model_key)
);
create index if not exists product_device_compatible_models_search_idx
 on public.product_device_compatible_models(organization_id,model_key,brand_key);
create index if not exists product_device_compatible_models_product_idx
 on public.product_device_compatible_models(organization_id,product_id);

create table if not exists public.product_device_compatible_settings (
 product_id uuid primary key references public.products(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete restrict,
 inherit_parent boolean not null default true,
 updated_by uuid references public.profiles(id) on delete set null,
 updated_at timestamptz not null default now()
);
create index if not exists product_device_compatible_settings_org_idx
 on public.product_device_compatible_settings(organization_id,product_id);

alter table public.product_device_compatible_models enable row level security;
alter table public.product_device_compatible_settings enable row level security;
revoke all on public.product_device_compatible_models,public.product_device_compatible_settings from anon,authenticated;
-- Leitura e gravação centralizadas em RPCs com autorização por empresa e módulo.
drop trigger if exists universal_audit_row_changes on public.product_device_compatible_models;
create trigger universal_audit_row_changes after insert or update or delete on public.product_device_compatible_models
for each row execute function private.audit_log_row_change();
drop trigger if exists universal_audit_row_changes on public.product_device_compatible_settings;
create trigger universal_audit_row_changes after insert or update or delete on public.product_device_compatible_settings
for each row execute function private.audit_log_row_change();

create or replace function private.effective_device_compatible_models_v1(
 p_organization_id uuid,p_product_ids uuid[]
) returns table (
 product_id uuid,device_type text,brand text,model text,
 inherited_from_parent boolean
)
language sql stable security definer set search_path='' as $function$
with requested as (
 select distinct p.id
 from unnest(coalesce(p_product_ids,'{}'::uuid[])) as requested(id)
 join public.products p on p.id=requested.id and p.organization_id=p_organization_id
), choice as (
 select r.id as product_id,
   case when l.parent_product_id is not null
     and coalesce(s.inherit_parent,true)
     and not exists (select 1 from public.product_device_compatible_models own
       where own.organization_id=p_organization_id and own.product_id=r.id)
     then l.parent_product_id else r.id end as source_product_id
 from requested r
 left join public.product_variation_links l on l.organization_id=p_organization_id and l.variation_product_id=r.id
 left join public.product_device_compatible_settings s on s.organization_id=p_organization_id and s.product_id=r.id
)
select c.product_id,m.device_type,m.brand,m.model,(c.source_product_id<>c.product_id)
from choice c
join public.product_device_compatible_models m
 on m.organization_id=p_organization_id and m.product_id=c.source_product_id
order by c.product_id,m.brand_key,m.device_type_key,m.model_key;
$function$;

create or replace function private.product_device_model_search_match_v1(
 p_organization_id uuid,p_product_id uuid,p_search text
) returns boolean language sql stable security definer set search_path='' as $function$
 select exists (
 select 1 from private.effective_device_compatible_models_v1(p_organization_id,array[p_product_id]) m
 where m.model ilike '%'||btrim(coalesce(p_search,''))||'%'
    or (m.brand||' '||m.model) ilike '%'||btrim(coalesce(p_search,''))||'%'
    or (m.device_type||' '||m.brand||' '||m.model) ilike '%'||btrim(coalesce(p_search,''))||'%'
    or regexp_replace(upper(m.model),'[^A-Z0-9]+','','g')
       like '%'||regexp_replace(upper(btrim(coalesce(p_search,''))),'[^A-Z0-9]+','','g')||'%'
 );
$function$;

create or replace function public.list_product_device_compatible_models_v1(
 p_organization_id uuid,p_product_ids uuid[]
) returns table (
 product_id uuid,device_type text,brand text,model text,
 inherited_from_parent boolean
) language plpgsql stable security definer set search_path='' as $function$
begin
 if auth.uid() is null or not (
  private.has_tenant_module_permission(p_organization_id,'inventory','inventory.view')
  or private.has_tenant_module_permission(p_organization_id,'inventory','inventory.details.view')
  or private.has_tenant_module_permission(p_organization_id,'sales','sales.view')
  or private.has_tenant_module_permission(p_organization_id,'pdv','pdv.sales.create')
 ) then raise exception 'Sem permissão para visualizar modelos compatíveis.' using errcode='42501'; end if;
 if coalesce(cardinality(p_product_ids),0)>100 then
   raise exception 'Consulte no máximo 100 produtos por vez.' using errcode='22023'; end if;
 return query
 select e.product_id,e.device_type,e.brand,e.model,e.inherited_from_parent
 from private.effective_device_compatible_models_v1(p_organization_id,p_product_ids) e;
end;$function$;

create or replace function public.get_product_device_compatible_models_v1(
 p_organization_id uuid,p_product_id uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_parent uuid;v_inherit boolean;v_result jsonb;
begin
 if auth.uid() is null or not (
  private.has_tenant_module_permission(p_organization_id,'inventory','inventory.view')
  or private.has_tenant_module_permission(p_organization_id,'inventory','inventory.details.view')
  or private.has_tenant_module_permission(p_organization_id,'inventory','inventory.update')
 ) then raise exception 'Sem permissão para consultar modelos compatíveis.' using errcode='42501'; end if;
 if not exists(select 1 from public.products p where p.id=p_product_id and p.organization_id=p_organization_id)
 then raise exception 'Produto não pertence à empresa.' using errcode='42501'; end if;
 select l.parent_product_id into v_parent
 from public.product_variation_links l
 where l.organization_id=p_organization_id and l.variation_product_id=p_product_id limit 1;
 select (v_parent is not null and coalesce(s.inherit_parent,true)
   and not exists(select 1 from public.product_device_compatible_models own
     where own.organization_id=p_organization_id and own.product_id=p_product_id))
 into v_inherit
 from (select 1) dummy
 left join public.product_device_compatible_settings s
  on s.organization_id=p_organization_id and s.product_id=p_product_id;
 select coalesce(jsonb_agg(jsonb_build_object(
   'device_type',m.device_type,'brand',m.brand,'model',m.model,
   'inherited_from_parent',m.inherited_from_parent
 ) order by m.brand,m.device_type,m.model),'[]'::jsonb)
 into v_result
 from private.effective_device_compatible_models_v1(p_organization_id,array[p_product_id]) m;
 return jsonb_build_object('parent_product_id',v_parent,'inherited',coalesce(v_inherit,false),'models',v_result);
end;$function$;

create or replace function public.replace_product_device_compatible_models_v1(
 p_organization_id uuid,p_product_id uuid,p_models jsonb,
 p_inherit_parent boolean default true
) returns integer language plpgsql volatile security definer set search_path='' as $function$
declare v_parent uuid;v_inherit boolean;v_row jsonb;v_brand text;v_type text;v_model text;v_brand_key text;v_type_key text;v_model_key text;v_count integer;
begin
 if auth.uid() is null or not private.has_tenant_module_permission(p_organization_id,'inventory','inventory.update')
 then raise exception 'Sem permissão para alterar modelos compatíveis.' using errcode='42501'; end if;
 if not exists(select 1 from public.products p where p.id=p_product_id and p.organization_id=p_organization_id)
 then raise exception 'Produto não pertence à empresa.' using errcode='42501'; end if;
 if jsonb_typeof(p_models)<>'array' or jsonb_array_length(p_models)>200 then
   raise exception 'Informe até 200 modelos compatíveis.' using errcode='22023'; end if;
 select l.parent_product_id into v_parent from public.product_variation_links l
 where l.organization_id=p_organization_id and l.variation_product_id=p_product_id limit 1;
 v_inherit:=v_parent is not null and coalesce(p_inherit_parent,true);
 delete from public.product_device_compatible_models
 where organization_id=p_organization_id and product_id=p_product_id;
 if not v_inherit then
   for v_row in select value from jsonb_array_elements(p_models) loop
     if jsonb_typeof(v_row)<>'object' then raise exception 'Modelo compatível inválido.' using errcode='22023'; end if;
     v_type:=regexp_replace(btrim(coalesce(v_row->>'device_type','')),'[[:space:]]+',' ','g');
     v_brand:=regexp_replace(btrim(coalesce(v_row->>'brand','')),'[[:space:]]+',' ','g');
     v_model:=regexp_replace(btrim(coalesce(v_row->>'model','')),'[[:space:]]+',' ','g');
     if v_type='' or v_brand='' or v_model='' or char_length(v_type)>60
       or char_length(v_brand)>80 or char_length(v_model)>120
     then raise exception 'Informe tipo, marca e modelo válidos para cada aparelho compatível.' using errcode='22023'; end if;
     v_type_key:=regexp_replace(upper(v_type),'[^A-Z0-9]+','','g');
     v_brand_key:=regexp_replace(upper(v_brand),'[^A-Z0-9]+','','g');
     v_model_key:=regexp_replace(upper(v_model),'[^A-Z0-9]+','','g');
     if v_type_key='' or v_brand_key='' or v_model_key='' then
       raise exception 'O tipo, a marca e o modelo devem conter letras ou números.' using errcode='22023'; end if;
     insert into public.product_device_compatible_models
       (organization_id,product_id,device_type,brand,model,device_type_key,brand_key,model_key)
     values(p_organization_id,p_product_id,v_type,v_brand,v_model,v_type_key,v_brand_key,v_model_key)
     on conflict(organization_id,product_id,device_type_key,brand_key,model_key) do nothing;
   end loop;
 end if;
 insert into public.product_device_compatible_settings(product_id,organization_id,inherit_parent,updated_by,updated_at)
 values(p_product_id,p_organization_id,v_inherit,auth.uid(),now())
 on conflict(product_id) do update
 set inherit_parent=excluded.inherit_parent,updated_by=excluded.updated_by,updated_at=now();
 select count(*) into v_count from public.product_device_compatible_models
 where organization_id=p_organization_id and product_id=p_product_id;
 return v_count;
end;$function$;

revoke all on function private.effective_device_compatible_models_v1(uuid,uuid[]) from public;
revoke all on function private.product_device_model_search_match_v1(uuid,uuid,text) from public;
revoke all on function public.list_product_device_compatible_models_v1(uuid,uuid[]) from public;
revoke all on function public.get_product_device_compatible_models_v1(uuid,uuid) from public;
revoke all on function public.replace_product_device_compatible_models_v1(uuid,uuid,jsonb,boolean) from public;
grant execute on function public.list_product_device_compatible_models_v1(uuid,uuid[]) to authenticated;
grant execute on function public.get_product_device_compatible_models_v1(uuid,uuid) to authenticated;
grant execute on function public.replace_product_device_compatible_models_v1(uuid,uuid,jsonb,boolean) to authenticated;

-- Continuação: as buscas existentes passam a reconhecer modelo de equipamento compatível.
CREATE OR REPLACE FUNCTION public.search_pdv_products_v1(p_organization_id uuid, p_search text DEFAULT ''::text, p_limit integer DEFAULT 30)
 RETURNS TABLE(product_id uuid, inventory_item_id uuid, name text, sku text, barcode text, price numeric, cover_media_id uuid, quantity numeric, min_quantity numeric, unit text, conversion_factor integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_search text:=btrim(coalesce(p_search,'')); v_limit integer:=least(100,greatest(1,coalesce(p_limit,30)));
begin
 if (select auth.uid()) is null or not private.has_tenant_module_permission(
    p_organization_id,'pdv','pdv.sales.create')
 then raise exception 'Sem permissão para realizar vendas no PDV.' using errcode='42501'; end if;
 return query
 with direct_matches as (
   select p.id
   from public.products p
   where p.organization_id=p_organization_id and p.is_active=true
     and (v_search=''
       or p.name ilike '%'||v_search||'%'
       or coalesce(p.sku,'') ilike '%'||v_search||'%'
       or coalesce(p.barcode,'') ilike '%'||v_search||'%'
       or coalesce(p.manufacturer_code,'') ilike '%'||v_search||'%'
       or coalesce(p.internal_barcode,'') ilike '%'||v_search||'%'
       or exists(select 1 from public.product_related_codes c
         where c.organization_id=p_organization_id and c.product_id=p.id
           and c.is_verified=true and c.code ilike '%'||v_search||'%')
       or private.product_device_model_search_match_v1(p_organization_id,p.id,v_search))
   order by case when p.barcode=v_search and v_search<>'' then 0 else 1 end,p.name
   limit case when v_search='' then v_limit else least(v_limit,15) end
 ), candidates as (
   select d.id,0 as priority from direct_matches d
   union all
   select rel.product_id,1
   from private.find_product_relations_v2(p_organization_id,
     (select coalesce(array_agg(d.id),'{}'::uuid[]) from direct_matches d)) rel
   where v_search<>''
 ), ranked as (
   select c.id,min(c.priority) as priority from candidates c group by c.id
 )
 select p.id,i.id,p.name,p.sku,p.barcode,p.price,p.cover_media_id,
   coalesce(i.quantity,0),coalesce(i.min_quantity,0),coalesce(i.unit,p.commercial_unit,'un'),
   greatest(1,coalesce(i.conversion_factor,1))
 from ranked r
 join public.products p on p.id=r.id and p.organization_id=p_organization_id and p.is_active=true
 left join public.inventory_items i on i.product_id=p.id and i.organization_id=p_organization_id
 order by r.priority,case when p.barcode=v_search and v_search<>'' then 0 else 1 end,p.name,p.id
 limit v_limit;
end;
$function$;

create or replace function public.search_sales_products_v1(
 p_organization_id uuid,p_search text default '',p_limit integer default 80
) returns table(product_id uuid,inventory_item_id uuid,name text,sku text,barcode text,
 price numeric,cover_media_id uuid,quantity numeric,min_quantity numeric,unit text,conversion_factor integer)
language plpgsql stable security definer set search_path='' as $function$
declare v_search text:=btrim(coalesce(p_search,''));v_limit integer:=least(100,greatest(1,coalesce(p_limit,80)));
begin
 if auth.uid() is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.view')
 then raise exception 'Sem permissão para consultar a vitrine.' using errcode='42501'; end if;
 return query
 with direct_matches as (
   select p.id
   from public.products p
   where p.organization_id=p_organization_id and p.is_active
    and (v_search='' or p.name ilike '%'||v_search||'%'
      or coalesce(p.sku,'') ilike '%'||v_search||'%'
      or coalesce(p.barcode,'') ilike '%'||v_search||'%'
      or coalesce(p.manufacturer_code,'') ilike '%'||v_search||'%'
      or coalesce(p.internal_barcode,'') ilike '%'||v_search||'%'
      or exists(select 1 from public.product_related_codes c
        where c.organization_id=p_organization_id and c.product_id=p.id
        and c.is_verified and c.code ilike '%'||v_search||'%')
       or private.product_device_model_search_match_v1(p_organization_id,p.id,v_search))
   order by case when p.barcode=v_search and v_search<>'' then 0 else 1 end,p.name
   limit case when v_search='' then v_limit else least(v_limit,15) end
 ), candidates as (
   select d.id,0 priority from direct_matches d
   union all
   select rel.product_id,1 from private.find_product_relations_v2(p_organization_id,
      (select coalesce(array_agg(d.id),'{}'::uuid[]) from direct_matches d)) rel
   where v_search<>''
 ), ranked as (
   select c.id,min(c.priority) priority from candidates c group by c.id
 )
 select p.id,i.id,p.name,p.sku,p.barcode,p.price,p.cover_media_id,
   coalesce(i.quantity,0),coalesce(i.min_quantity,0),
   coalesce(i.unit,p.commercial_unit,'un'),greatest(1,coalesce(i.conversion_factor,1))
 from ranked r
 join public.products p on p.id=r.id and p.organization_id=p_organization_id and p.is_active
 left join public.inventory_items i on i.product_id=p.id and i.organization_id=p_organization_id
 order by r.priority,case when p.barcode=v_search and v_search<>'' then 0 else 1 end,p.name,p.id
 limit v_limit;
end;$function$;

revoke all on function public.search_pdv_products_v1(uuid,text,integer) from public;
revoke all on function public.search_sales_products_v1(uuid,text,integer) from public;
grant execute on function public.search_pdv_products_v1(uuid,text,integer) to authenticated;
grant execute on function public.search_sales_products_v1(uuid,text,integer) to authenticated;
commit;
