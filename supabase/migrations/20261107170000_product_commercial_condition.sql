-- Condição por produto e por SKU/variação, com padrão Novo e preservação de registros anteriores.
begin;
alter table public.products add column if not exists product_condition text not null default 'new';
alter table public.products drop constraint if exists products_product_condition_check;
alter table public.products add constraint products_product_condition_check check(product_condition in ('new','used','refurbished'));
CREATE OR REPLACE FUNCTION public.save_inventory_item_unified_v6(p_organization_id uuid, p_product_id uuid, p_product jsonb, p_inventory jsonb, p_initial_quantity numeric DEFAULT 0, p_initial_unit_cost numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_product_id uuid;
  v_characteristics jsonb := '[]'::jsonb;
  v_days integer;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;
  if p_product ? 'sale_window_days' then
    if nullif(p_product->>'sale_window_days','') is not null then
      v_days:=(p_product->>'sale_window_days')::integer;
      if v_days not between 1 and 3650 then
        raise exception 'O prazo de venda deve ser de 1 a 3650 dias.';
      end if;
    end if;
    -- NULL desabilita: sentinela 0 é convertida em NULL pelo gatilho.
    perform set_config('app.inventory_sale_window_days',coalesce(v_days,0)::text,true);
  end if;
  v_product_id := public.save_inventory_item_unified_v5(
    p_organization_id,p_product_id,p_product,p_inventory,p_initial_quantity,p_initial_unit_cost);
  if jsonb_typeof(p_product->'site_characteristics')='array' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'label',left(btrim(coalesce(entry.value->>'label','')),80),
      'value',left(btrim(coalesce(entry.value->>'value','')),240))), '[]'::jsonb)
    into v_characteristics
    from (select value from jsonb_array_elements(p_product->'site_characteristics') limit 20) entry
    where btrim(coalesce(entry.value->>'label','')) <> ''
      and btrim(coalesce(entry.value->>'value','')) <> '';
  end if;
  update public.products product
  set product_condition=case when p_product ? 'product_condition' then coalesce(nullif(p_product->>'product_condition',''),'new') else product.product_condition end,
      internal_barcode=case when p_product ? 'internal_barcode'
        then nullif(btrim(coalesce(p_product->>'internal_barcode','')),'')
        else product.internal_barcode end,
      site_characteristics=v_characteristics,
      sale_window_days=case when p_product ? 'sale_window_days' then v_days else product.sale_window_days end,
      updated_at=now()
  where product.organization_id=p_organization_id and product.id=v_product_id;
  perform set_config('app.inventory_sale_window_days','',true);
  return v_product_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.create_product_variation_combinations_v1(p_organization_id uuid, p_parent_product_id uuid, p_combinations jsonb)
 RETURNS TABLE(product_id uuid, variation_label text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 v_condition text;
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
      or (select count(*) from jsonb_object_keys(v_attributes))>5
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
   -- O código é livre: apenas evita reutilizar o mesmo identificador de outro produto.
   if v_barcode is not null and
       exists(select 1 from public.products p where p.organization_id=p_organization_id and p.barcode=v_barcode)
   then raise exception 'Código de barras já utilizado por outro produto.' using errcode='22023'; end if;
   v_price:=coalesce(nullif(v_row->>'price','')::numeric,v_parent.price);
   v_qty:=coalesce(nullif(v_row->>'quantity','')::numeric,0);
   v_condition:=coalesce(nullif(v_row->>'product_condition',''),v_parent.product_condition,'new');
   if v_condition not in ('new','used','refurbished') then raise exception 'Condição de variação inválida.' using errcode='22023'; end if;
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
       'product_condition',coalesce(nullif(v_row->>'product_condition',''),v_parent.product_condition,'new'),
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
commit;
