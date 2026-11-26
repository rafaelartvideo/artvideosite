-- Sequência por empresa, compartilhada por produtos e variações.
begin;
create table if not exists private.inventory_sku_counters (
  organization_id uuid primary key,
  last_value numeric not null check (last_value >= 0)
);
alter table private.inventory_sku_counters enable row level security;
revoke all on private.inventory_sku_counters from public, anon, authenticated;

create or replace function private.next_inventory_sku_v1(p_org uuid)
returns text language plpgsql set search_path='' as $$
declare v_next numeric; v_code text;
begin
  perform pg_advisory_xact_lock(hashtextextended('inventory-sku:'||p_org::text,0));
  if not exists(select 1 from private.inventory_sku_counters where organization_id=p_org) then
  insert into private.inventory_sku_counters(organization_id,last_value)
  select p_org,coalesce(max(case when btrim(sku) ~ '^[0-9]{1,30}$' then btrim(sku)::numeric end),0)
  from (select sku from public.products where organization_id=p_org
        union all select sku from public.inventory_items where organization_id=p_org) existing
  on conflict (organization_id) do nothing;
  end if;
  loop
    update private.inventory_sku_counters set last_value=last_value+1
    where organization_id=p_org returning last_value into v_next;
    v_code:=v_next::text;
    exit when not exists(select 1 from public.products where organization_id=p_org and btrim(sku)=v_code)
      and not exists(select 1 from public.inventory_items where organization_id=p_org and btrim(sku)=v_code);
  end loop;
  return v_code;
end $$;
revoke all on function private.next_inventory_sku_v1(uuid) from public,anon,authenticated;

create or replace function private.assert_inventory_identifier_v1(p_org uuid,p_id uuid,p_code text,p_label text)
returns void language plpgsql set search_path='' as $$
declare v_code text:=nullif(upper(btrim(p_code)),''); v_name text;
begin
  if v_code is null then return; end if;
  select p.name into v_name from public.products p
  where p.organization_id=p_org and p.id is distinct from p_id
    and v_code in (upper(btrim(p.barcode)),upper(btrim(p.manufacturer_code)),upper(btrim(p.internal_barcode)))
  limit 1;
  if found then raise exception '% já cadastrado em %.',p_label,v_name using errcode='23505'; end if;
end $$;
revoke all on function private.assert_inventory_identifier_v1(uuid,uuid,text,text) from public,anon,authenticated;

create or replace function public.save_inventory_item_unified_v7(
  p_organization_id uuid, p_product_id uuid, p_product jsonb, p_inventory jsonb,
  p_initial_quantity numeric default 0, p_initial_unit_cost numeric default null
)
returns uuid language plpgsql security definer set search_path='' as $function$
declare
  v_product_id uuid;
  v_subcategory_id uuid;
  v_category_id uuid;
  v_old public.products%rowtype;
  v_sku text;
  v_kind text;
  v_value text;
  v_duplicate text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;

  if not (
    (p_product_id is null and (private.has_tenant_module_permission(p_organization_id,'products','products.create') or private.has_tenant_module_permission(p_organization_id,'inventory','inventory.create')))
    or (p_product_id is not null and (private.has_tenant_module_permission(p_organization_id,'products','products.update') or private.has_tenant_module_permission(p_organization_id,'inventory','inventory.update')))
  ) then raise exception 'Sem permissão para salvar produto.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('inventory-sku:'||p_organization_id::text,0));
  if p_product_id is not null then
    select * into v_old from public.products where organization_id=p_organization_id and id=p_product_id;
    if not found then raise exception 'Produto não encontrado.' using errcode='42501'; end if;
    v_sku:=nullif(btrim(v_old.sku),'');
    if v_sku is null then
      select nullif(btrim(sku),'') into v_sku from public.inventory_items
      where organization_id=p_organization_id and product_id=p_product_id limit 1;
    end if;
  end if;
  if v_sku is null then v_sku:=private.next_inventory_sku_v1(p_organization_id); end if;
  p_product:=jsonb_set(coalesce(p_product,'{}'::jsonb),'{sku}',to_jsonb(v_sku),true);
  foreach v_kind in array array['barcode','manufacturer_code','internal_barcode'] loop
    v_value:=p_product->>v_kind;
    if nullif(btrim(v_value),'') is not null and
      (p_product_id is null or upper(btrim(v_value)) is distinct from upper(btrim(to_jsonb(v_old)->>v_kind))) then
      perform private.assert_inventory_identifier_v1(p_organization_id,p_product_id,v_value,
        case v_kind when 'barcode' then 'GTIN' when 'manufacturer_code' then 'Código do fabricante' else 'Código interno' end);
    end if;
  end loop;
  if nullif(btrim(p_product->>'model'),'') is not null and (
    p_product_id is null or upper(btrim(p_product->>'model')) is distinct from upper(btrim(v_old.model))
    or nullif(p_product->>'brand_id','')::uuid is distinct from v_old.brand_id
    or nullif(p_product->>'category_id','')::uuid is distinct from v_old.category_id
    or coalesce(p_product->>'product_condition','new') is distinct from coalesce(v_old.product_condition,'new')
  ) then
    select p.name into v_duplicate from public.products p where p.organization_id=p_organization_id
      and p.id is distinct from p_product_id
      and upper(btrim(p.model))=upper(btrim(p_product->>'model'))
      and p.brand_id is not distinct from nullif(p_product->>'brand_id','')::uuid
      and p.category_id is not distinct from nullif(p_product->>'category_id','')::uuid
      and coalesce(p.product_condition,'new')=coalesce(p_product->>'product_condition','new')
    limit 1;
    if found then raise exception 'Modelo já cadastrado em %. Use o cadastro existente ou crie uma variação.',v_duplicate using errcode='23505'; end if;
  end if;

  if p_product ? 'subcategory_id' and nullif(p_product->>'subcategory_id','') is not null then
    v_subcategory_id := (p_product->>'subcategory_id')::uuid;
    v_category_id := nullif(p_product->>'category_id','')::uuid;
    if v_category_id is null or not exists (
      select 1 from public.product_subcategories sub
      where sub.id=v_subcategory_id and sub.organization_id=p_organization_id
        and sub.category_id=v_category_id and sub.is_active
    ) then
      raise exception 'A subcategoria precisa pertencer à categoria selecionada na empresa.' using errcode='23514';
    end if;
  end if;

  v_product_id := public.save_inventory_item_unified_v6(
    p_organization_id,p_product_id,p_product,p_inventory,p_initial_quantity,p_initial_unit_cost);
  update public.products
  set subcategory_id=v_subcategory_id, updated_at=now()
  where organization_id=p_organization_id and id=v_product_id;
  return v_product_id;
end
$function$;
revoke all on function public.save_inventory_item_unified_v7(uuid,uuid,jsonb,jsonb,numeric,numeric) from public,anon;
grant execute on function public.save_inventory_item_unified_v7(uuid,uuid,jsonb,jsonb,numeric,numeric) to authenticated;
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
 v_child_inventory_id uuid;
 v_supplier_mode text;
 v_supplier_links jsonb;
 v_supplier_ids uuid[];
 v_count integer;
 v_seen_labels text[]:='{}';
 v_seen_barcodes text[]:='{}';
 v_slug text;
begin
 if (select auth.uid()) is null or not (
   private.has_tenant_module_permission(p_organization_id,'products','products.create')
   or private.has_tenant_module_permission(p_organization_id,'inventory','inventory.create')
 ) or not (
   private.has_tenant_module_permission(p_organization_id,'products','products.update')
   or private.has_tenant_module_permission(p_organization_id,'inventory','inventory.update')
 ) then raise exception 'Sem permissão para cadastrar variações nesta empresa.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('inventory-sku:'||p_organization_id::text,0));
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
   if v_barcode is not null then
     if upper(v_barcode)=any(v_seen_barcodes) then
       raise exception 'Código de barras repetido entre variações.' using errcode='23505';
     end if;
     perform private.assert_inventory_identifier_v1(p_organization_id,null,v_barcode,'GTIN da variação');
     v_seen_barcodes:=array_append(v_seen_barcodes,upper(v_barcode));
   end if;
   v_price:=coalesce(nullif(v_row->>'price','')::numeric,v_parent.price);
   v_qty:=coalesce(nullif(v_row->>'quantity','')::numeric,0);
   v_condition:=coalesce(nullif(v_row->>'product_condition',''),v_parent.product_condition,'new');
   v_supplier_mode:=coalesce(nullif(v_row->>'supplier_mode',''),'inherit');
   if v_supplier_mode not in ('inherit','custom')
   then raise exception 'Modo de fornecedores da variação inválido.' using errcode='22023'; end if;
   if v_supplier_mode='custom' then
     if not private.has_effective_organization_permission(p_organization_id,'inventory.suppliers.manage')
     then raise exception 'Sem permissão para escolher fornecedores próprios da variação.' using errcode='42501'; end if;
     v_supplier_links:=coalesce(v_row->'supplier_links','[]'::jsonb);
     if jsonb_typeof(v_supplier_links) <> 'array' or jsonb_array_length(v_supplier_links)>50
     then raise exception 'Lista de fornecedores da variação inválida.' using errcode='22023'; end if;
   end if;
   if v_condition not in ('new','used','refurbished') then raise exception 'Condição de variação inválida.' using errcode='22023'; end if;
   if v_price is not null and v_price<0 or v_qty<0 or v_qty>100000000
   then raise exception 'Preço ou saldo inicial inválido.' using errcode='22023'; end if;
 end loop;
 for v_row in select value from jsonb_array_elements(p_combinations) loop
   v_label:=btrim(v_row->>'label');
   v_sku:=private.next_inventory_sku_v1(p_organization_id);
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
   -- Cada combinação cria seu próprio estoque. Os fornecedores são vinculados
   -- na mesma transação: todos os do principal ou somente os escolhidos.
   select item.id into v_child_inventory_id from public.inventory_items item
    where item.organization_id=p_organization_id and item.product_id=v_created
    limit 1;
   if v_child_inventory_id is null
   then raise exception 'Estoque da variação não localizado.' using errcode='P0002'; end if;

   v_supplier_mode:=coalesce(nullif(v_row->>'supplier_mode',''),'inherit');
   if v_supplier_mode='custom' then
     v_supplier_links:=coalesce(v_row->'supplier_links','[]'::jsonb);
     select coalesce(array_agg(distinct (link.value->>'entity_id')::uuid),'{}'::uuid[])
       into v_supplier_ids
       from jsonb_array_elements(v_supplier_links) link;
     perform public.sync_inventory_item_suppliers(p_organization_id,v_child_inventory_id,v_supplier_ids);
     update public.entity_supplier_items target
        set supplier_reference=nullif(left(btrim(coalesce(source.value->>'supplier_reference','')),160),'')
       from jsonb_array_elements(v_supplier_links) source
      where target.organization_id=p_organization_id
        and target.inventory_item_id=v_child_inventory_id
        and target.entity_id=(source.value->>'entity_id')::uuid;
   elsif v_inventory.id is not null then
     insert into public.entity_supplier_items (
       organization_id,entity_id,inventory_item_id,supplier_reference,created_by)
     select p_organization_id, parent_link.entity_id, v_child_inventory_id,
            parent_link.supplier_reference, (select auth.uid())
       from public.entity_supplier_items parent_link
      where parent_link.organization_id=p_organization_id
        and parent_link.inventory_item_id=v_inventory.id
     on conflict (organization_id,entity_id,inventory_item_id) do nothing;
   end if;
   product_id:=v_created;
   variation_label:=v_label;
   return next;
 end loop;
end;
$function$
;
commit;
