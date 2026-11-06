-- Códigos de referência relacionados a produtos, sem alterar GTIN, SKU ou MPN principal.
create table if not exists public.product_related_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete cascade,
  code text not null check (length(btrim(code)) between 2 and 64),
  relation_type text not null check (relation_type in ('previous','successor','compatible','alternate')),
  source text not null default 'manual' check (source in ('manual','catalog')),
  is_verified boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (organization_id,product_id,code)
);
create index if not exists product_related_codes_lookup_idx
  on public.product_related_codes(organization_id,upper(code));
create index if not exists product_related_codes_product_idx
  on public.product_related_codes(organization_id,product_id);
alter table public.product_related_codes enable row level security;
revoke all on table public.product_related_codes from public,anon,authenticated;
grant select on table public.product_related_codes to authenticated;
drop policy if exists product_related_codes_tenant_select on public.product_related_codes;
create policy product_related_codes_tenant_select on public.product_related_codes
for select to authenticated
using (
  private.has_tenant_module_permission(organization_id,'products','products.view')
  and exists (select 1 from public.products p where p.id=product_id and p.organization_id=organization_id)
);

-- Lista de referências por produto protegida pela política de leitura da empresa.
-- Usa RPC para não depender da exposição automática de novas tabelas ao Data API.
create or replace function public.list_product_related_codes(
  p_organization_id uuid, p_product_id uuid
)
returns table(code text, relation_type text)
language sql stable security invoker set search_path=''
as $function$
  select c.code,c.relation_type
  from public.product_related_codes c
  where c.organization_id=p_organization_id and c.product_id=p_product_id
  order by c.code;
$function$;
revoke all on function public.list_product_related_codes(uuid,uuid) from public,anon;
grant execute on function public.list_product_related_codes(uuid,uuid) to authenticated;

-- Substituição transacional apenas por quem pode criar/editar produtos na empresa.
create or replace function public.replace_product_related_codes(
  p_organization_id uuid,p_product_id uuid,p_codes jsonb
)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_product public.products%rowtype;
  v_code jsonb;
  v_normalized text;
  v_relation text;
  v_seen text[] := '{}';
  v_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  select * into v_product from public.products
  where id=p_product_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Produto não encontrado nesta empresa.' using errcode='P0002'; end if;
  -- A permissão de criação não autoriza editar qualquer produto já existente.
  -- O próprio criador pode anexar os códigos logo após salvar um item novo.
  if not (
    private.has_tenant_module_permission(p_organization_id,'products','products.update')
    or (
      private.has_tenant_module_permission(p_organization_id,'products','products.create')
      and v_product.created_by=auth.uid()
      and v_product.created_at>now()-interval '5 minutes'
    )
  ) then raise exception 'Sem permissão para alterar os códigos do produto.' using errcode='42501'; end if;
  if jsonb_typeof(coalesce(p_codes,'[]'::jsonb)) <> 'array' then
    raise exception 'Lista de códigos inválida.' using errcode='22023';
  end if;
  if jsonb_array_length(coalesce(p_codes,'[]'::jsonb)) > 100 then
    raise exception 'Limite de 100 códigos por produto.' using errcode='22023';
  end if;
  -- Validar toda a lista ANTES de remover os registros anteriores.
  for v_code in select value from jsonb_array_elements(coalesce(p_codes,'[]'::jsonb))
  loop
    v_normalized := upper(btrim(coalesce(v_code->>'code','')));
    v_relation := coalesce(v_code->>'relation_type','');
    if length(v_normalized) < 2 or length(v_normalized) > 64
      or v_normalized !~ '^[A-Z0-9][A-Z0-9 ./_-]*$'
      or v_relation not in ('previous','successor','compatible','alternate') then
      raise exception 'Código ou tipo de relação inválido.' using errcode='22023';
    end if;
    if v_normalized=upper(btrim(coalesce(v_product.manufacturer_code,''))) then
      raise exception 'O código principal já está no campo MPN.' using errcode='22023';
    end if;
    if v_normalized=any(v_seen) then raise exception 'Código repetido na mesma lista.' using errcode='23505'; end if;
    v_seen := array_append(v_seen,v_normalized);
  end loop;
  delete from public.product_related_codes where organization_id=p_organization_id and product_id=p_product_id;
  for v_code in select value from jsonb_array_elements(coalesce(p_codes,'[]'::jsonb))
  loop
    insert into public.product_related_codes(
      organization_id,product_id,code,relation_type,source,is_verified,created_by
    ) values (
      p_organization_id,p_product_id,upper(btrim(v_code->>'code')),v_code->>'relation_type','manual',true,auth.uid()
    );
    v_count := v_count+1;
  end loop;
  return v_count;
end;
$function$;
revoke all on function public.replace_product_related_codes(uuid,uuid,jsonb) from public,anon;
grant execute on function public.replace_product_related_codes(uuid,uuid,jsonb) to authenticated;

-- Búsquedas por código do fabricante ou por código equivalente confirmado.
CREATE OR REPLACE FUNCTION public.search_pdv_products_v1(p_organization_id uuid, p_search text DEFAULT ''::text, p_limit integer DEFAULT 30)
 RETURNS TABLE(product_id uuid, inventory_item_id uuid, name text, sku text, barcode text, price numeric, cover_media_id uuid, quantity numeric, min_quantity numeric, unit text, conversion_factor integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_search text := btrim(coalesce(p_search, ''));
  v_limit integer := least(100, greatest(1, coalesce(p_limit, 30)));
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not private.has_tenant_module_permission(
    p_organization_id,
    'pdv',
    'pdv.sales.create'
  ) then
    raise exception 'Sem permissão para realizar vendas no PDV.' using errcode = '42501';
  end if;

  return query
  select
    product.id,
    item.id,
    product.name,
    product.sku,
    product.barcode,
    product.price,
    product.cover_media_id,
    coalesce(item.quantity, 0),
    coalesce(item.min_quantity, 0),
    coalesce(item.unit, product.commercial_unit, 'un'),
    greatest(1, coalesce(item.conversion_factor, 1))
  from public.products product
  left join public.inventory_items item
    on item.organization_id = product.organization_id
   and item.product_id = product.id
  where product.organization_id = p_organization_id
    and product.is_active = true
    and (
      v_search = ''
      or product.name ilike '%' || v_search || '%'
      or coalesce(product.sku, '') ilike '%' || v_search || '%'
      or coalesce(product.barcode, '') ilike '%' || v_search || '%'
      or coalesce(product.manufacturer_code, '') ilike '%' || v_search || '%'
      or exists (select 1 from public.product_related_codes code where code.organization_id = product.organization_id and code.product_id = product.id and code.is_verified and code.code ilike '%' || v_search || '%')
    )
  order by
    case when coalesce(product.barcode, '') = v_search and v_search <> '' then 0 else 1 end,
    product.name
  limit v_limit;
end;
$function$


CREATE OR REPLACE FUNCTION public.search_service_order_products_v1(p_service_order_id uuid, p_search text DEFAULT ''::text, p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, name text, description text, unit text, price numeric, stock numeric, price_at_completion boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.service_orders%rowtype;
  v_search text:=lower(btrim(coalesce(p_search,'')));
begin
  select * into v_order from public.service_orders where service_orders.id=p_service_order_id;
  if not found or not private.can_view_service_order(p_service_order_id) then
    raise exception 'OS não encontrada ou sem acesso.' using errcode='42501';
  end if;

  return query
  select
    inventory.id,
    inventory.name,
    case
      when inventory.sku is not null and inventory.description is not null then inventory.sku||' • '||inventory.description
      when inventory.sku is not null then inventory.sku
      else inventory.description
    end,
    coalesce(nullif(btrim(inventory.unit),''),'un'),
    case
      when lower(coalesce(inventory.unit,'un'))='cx'
        then coalesce(inventory.sale_price,0)*greatest(1,coalesce(inventory.conversion_factor,1))
      else coalesce(inventory.sale_price,0)
    end,
    case
      when lower(coalesce(inventory.unit,'un'))='cx'
        then inventory.quantity/greatest(1,coalesce(inventory.conversion_factor,1))
      else inventory.quantity
    end,
    false
  from public.inventory_items inventory
  where inventory.organization_id=v_order.organization_id
    and inventory.is_active=true
    and (
      v_search=''
      or lower(inventory.name) like '%'||v_search||'%'
      or lower(coalesce(inventory.sku,'')) like '%'||v_search||'%'
      or exists (
        select 1 from public.products p
        where p.organization_id=inventory.organization_id and p.id=inventory.product_id
          and lower(coalesce(p.manufacturer_code,'')) like '%'||v_search||'%'
      )
      or exists (select 1 from public.product_related_codes code where code.organization_id=inventory.organization_id and code.product_id=inventory.product_id and code.is_verified and lower(code.code) like '%'||v_search||'%')
    )
  order by
    case when v_search<>'' and lower(inventory.name) like v_search||'%' then 0 else 1 end,
    inventory.name
  limit greatest(1,least(coalesce(p_limit,20),50));
end;
$function$

