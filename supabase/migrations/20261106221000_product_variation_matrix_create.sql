-- Variações por atributos. Cadastro em lote atômico, usando a mesma rotina de produto/estoque.
-- O produto principal continua vendável por compatibilidade com o catálogo existente.
begin;
alter table public.product_variation_links
  add column if not exists variation_attributes jsonb not null default '{}'::jsonb;
alter table public.product_variation_links
  add constraint product_variation_attributes_is_object
  check (jsonb_typeof(variation_attributes)='object');

create or replace function public.create_product_variation_combinations_v1(
 p_organization_id uuid, p_parent_product_id uuid, p_combinations jsonb
) returns table(product_id uuid, variation_label text)
language plpgsql security definer set search_path=''
as $function$
declare
 v_parent public.products%rowtype;
 v_inventory public.inventory_items%rowtype;
 v_row jsonb;
 v_attributes jsonb;
 v_label text;
 v_sku text;
 v_barcode text;
 v_price numeric;
 v_qty numeric;
 v_created uuid;
 v_count integer;
 v_seen_labels text[]:='{}';
 v_seen_skus text[]:='{}';
 v_slug text;
begin
 if (select auth.uid()) is null or not (
   private.has_tenant_module_permission(p_organization_id,'products','products.create')
   or private.has_tenant_module_permission(p_organization_id,'inventory','inventory.create')
 ) or not (
   private.has_tenant_module_permission(p_organization_id,'products','products.update')
   or private.has_tenant_module_permission(p_organization_id,'inventory','inventory.update')
 ) then raise exception 'Sem permissão para cadastrar variações nesta empresa.' using errcode='42501'; end if;
 select * into v_parent from public.products p
 where p.id=p_parent_product_id and p.organization_id=p_organization_id for update;
 if not found then raise exception 'Produto principal não encontrado.' using errcode='P0002'; end if;
 if exists(select 1 from public.product_variation_links
  where organization_id=p_organization_id and variation_product_id=p_parent_product_id)
 then raise exception 'Uma variação não pode ser produto principal.' using errcode='22023'; end if;
 select * into v_inventory from public.inventory_items
 where organization_id=p_organization_id and product_id=p_parent_product_id limit 1;
 if jsonb_typeof(p_combinations) is distinct from 'array'
 then raise exception 'Envie uma lista de combinações.' using errcode='22023'; end if;
 v_count:=jsonb_array_length(p_combinations);
 if v_count<1 or v_count>30
 then raise exception 'Escolha de 1 a 30 combinações.' using errcode='22023'; end if;
 if (select count(*) from public.product_variation_links
   where organization_id=p_organization_id and parent_product_id=p_parent_product_id)+v_count>30
 then raise exception 'Limite de 30 variações vinculadas a este produto.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||p_parent_product_id::text,0));
 -- Validar todos os itens antes de gravar qualquer produto.
 for v_row in select value from jsonb_array_elements(p_combinations) loop
   v_label:=btrim(coalesce(v_row->>'label',''));
   v_sku:=nullif(btrim(coalesce(v_row->>'sku','')),'');
   v_barcode:=nullif(btrim(coalesce(v_row->>'barcode','')),'');
   v_attributes:=coalesce(v_row->'attributes','{}'::jsonb);
   if length(v_label) not between 1 and 100 or jsonb_typeof(v_attributes)<>'object'
      or (select count(*) from jsonb_object_keys(v_attributes))>3
   then raise exception 'Identificação ou atributos de variação inválidos.' using errcode='22023'; end if;
   if upper(v_label)=any(v_seen_labels) or exists(select 1 from public.product_variation_links l
       where l.organization_id=p_organization_id and l.parent_product_id=p_parent_product_id
       and upper(l.variation_label)=upper(v_label))
   then raise exception 'Variação repetida: %',v_label using errcode='23505'; end if;
   v_seen_labels:=array_append(v_seen_labels,upper(v_label));
   if v_sku is null or length(v_sku)>100 or upper(v_sku)=any(v_seen_skus)
      or exists(select 1 from public.products p
        where p.organization_id=p_organization_id and upper(p.sku)=upper(v_sku))
   then raise exception 'SKU ausente, repetido ou inválido na variação %.',v_label using errcode='22023'; end if;
   v_seen_skus:=array_append(v_seen_skus,upper(v_sku));
   if v_barcode is not null and (length(v_barcode) not between 4 and 32 or
       exists(select 1 from public.products p where p.organization_id=p_organization_id and p.barcode=v_barcode))
   then raise exception 'Código de barras repetido ou inválido.' using errcode='22023'; end if;
   v_price:=coalesce(nullif(v_row->>'price','')::numeric,v_parent.price);
   v_qty:=coalesce(nullif(v_row->>'quantity','')::numeric,0);
   if v_price is not null and v_price<0 or v_qty<0 or v_qty>100000000
   then raise exception 'Preço ou saldo inicial inválido.' using errcode='22023'; end if;
 end loop;
 for v_row in select value from jsonb_array_elements(p_combinations) loop
   v_label:=btrim(v_row->>'label');
   v_sku:=btrim(v_row->>'sku');
   v_barcode:=nullif(btrim(coalesce(v_row->>'barcode','')),'');
   v_attributes:=coalesce(v_row->'attributes','{}'::jsonb);
   v_price:=coalesce(nullif(v_row->>'price','')::numeric,v_parent.price);
   v_qty:=coalesce(nullif(v_row->>'quantity','')::numeric,0);
   v_slug:=left(coalesce(v_parent.slug,'produto'),90)||'-v-'||substring(replace(gen_random_uuid()::text,'-',''),1,12);
   v_created:=public.save_inventory_item_unified_v6(
     p_organization_id, null,
     jsonb_build_object(
       'name',left(v_parent.name||' - '||v_label,200),
       'slug',v_slug,'sku',v_sku,'barcode',v_barcode,'price',v_price,
       'description',v_parent.description,'model',v_parent.model,
       'brand_id',v_parent.brand_id,'category_id',v_parent.category_id,
       'commercial_unit',v_parent.commercial_unit,
       'cover_media_id',v_parent.cover_media_id,
       'is_active',v_parent.is_active,'show_in_catalog',false,
       'site_characteristics',coalesce(v_parent.site_characteristics,'[]'::jsonb),
       'updated_by',(select auth.uid())
     ),
     jsonb_build_object(
       'unit',coalesce(v_inventory.unit,v_parent.commercial_unit,'un'),
       'conversion_factor',greatest(1,coalesce(v_inventory.conversion_factor,1)),
       'min_quantity',0
     ),
     v_qty,null
   );
   insert into public.product_variation_links(
     organization_id,parent_product_id,variation_product_id,variation_label,variation_attributes,created_by)
   values(p_organization_id,p_parent_product_id,v_created,v_label,v_attributes,(select auth.uid()));
   product_id:=v_created;
   variation_label:=v_label;
   return next;
 end loop;
end;
$function$;
revoke all on function public.create_product_variation_combinations_v1(uuid,uuid,jsonb) from public,anon;
grant execute on function public.create_product_variation_combinations_v1(uuid,uuid,jsonb) to authenticated;

-- Preserve structured attributes when someone changes existing manual links.
create or replace function public.replace_product_variations_v1(
  p_organization_id uuid,p_parent_product_id uuid,p_variations jsonb
) returns integer language plpgsql security definer set search_path=''
as $function$
declare v_count integer; v_item jsonb; v_child uuid; v_label text; v_old jsonb;
begin
 if (select auth.uid()) is null or not (
   private.has_tenant_module_permission(p_organization_id,'products','products.update')
   or private.has_tenant_module_permission(p_organization_id,'inventory','inventory.update'))
 then raise exception 'Sem permissão para editar variações.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||p_parent_product_id::text,0));
 if not exists(select 1 from public.products p
    where p.id=p_parent_product_id and p.organization_id=p_organization_id)
 then raise exception 'Produto principal não pertence à empresa.' using errcode='42501'; end if;
 if exists(select 1 from public.product_variation_links
    where organization_id=p_organization_id and variation_product_id=p_parent_product_id)
 then raise exception 'Uma variação não pode ser produto principal.' using errcode='22023'; end if;
 if jsonb_typeof(p_variations) is distinct from 'array'
 then raise exception 'Informe uma lista de variações.' using errcode='22023'; end if;
 v_count:=jsonb_array_length(p_variations);
 if v_count>30 then raise exception 'Máximo de 30 variações.' using errcode='22023'; end if;
 for v_item in select value from jsonb_array_elements(p_variations) loop
   v_child:=nullif(v_item->>'product_id','')::uuid;
   v_label:=btrim(coalesce(v_item->>'label',''));
   if v_child is null or v_child=p_parent_product_id or length(v_label) not between 1 and 100
   then raise exception 'Variação inválida.' using errcode='22023'; end if;
   if not exists(select 1 from public.products p where p.id=v_child and p.organization_id=p_organization_id)
   then raise exception 'Variação de outra empresa.' using errcode='42501'; end if;
   if exists(select 1 from public.product_variation_links l where l.organization_id=p_organization_id
     and l.parent_product_id=v_child)
   then raise exception 'Um produto principal não pode ser uma variação.' using errcode='22023'; end if;
   if exists(select 1 from public.product_variation_links l where l.organization_id=p_organization_id
      and l.variation_product_id=v_child and l.parent_product_id<>p_parent_product_id)
   then raise exception 'Este item pertence a outro grupo.' using errcode='22023'; end if;
 end loop;
 if (select count(distinct (value->>'product_id')) from jsonb_array_elements(p_variations))<>v_count
 then raise exception 'Não repita variações.' using errcode='22023'; end if;
 select coalesce(jsonb_object_agg(variation_product_id::text,variation_attributes),'{}'::jsonb)
 into v_old from public.product_variation_links
 where organization_id=p_organization_id and parent_product_id=p_parent_product_id;
 delete from public.product_variation_links
 where organization_id=p_organization_id and parent_product_id=p_parent_product_id;
 insert into public.product_variation_links(
   organization_id,parent_product_id,variation_product_id,variation_label,variation_attributes)
 select p_organization_id,p_parent_product_id,(value->>'product_id')::uuid,btrim(value->>'label'),
   coalesce(v_old->(value->>'product_id'),'{}'::jsonb)
 from jsonb_array_elements(p_variations);
 return v_count;
end;
$function$;
revoke all on function public.replace_product_variations_v1(uuid,uuid,jsonb) from public,anon;
grant execute on function public.replace_product_variations_v1(uuid,uuid,jsonb) to authenticated;
commit;