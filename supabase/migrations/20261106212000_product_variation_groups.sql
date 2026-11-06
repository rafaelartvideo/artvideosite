-- Agrupamento opcional de cadastros distintos em uma família de variações.
-- Cada produto/variação continua tendo inventário, SKU, preço e histórico separados.
begin;

create table if not exists public.product_variation_links (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_product_id uuid not null references public.products(id) on delete cascade,
  variation_product_id uuid not null references public.products(id) on delete cascade,
  variation_label text not null check (length(btrim(variation_label)) between 1 and 100),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key(organization_id,parent_product_id,variation_product_id),
  unique(organization_id,variation_product_id),
  constraint product_variations_no_self_link check(parent_product_id<>variation_product_id)
);
create index if not exists product_variations_parent_idx
  on public.product_variation_links(organization_id,parent_product_id);
alter table public.product_variation_links enable row level security;
revoke all on public.product_variation_links from public,anon,authenticated;

create or replace function public.list_product_variations_v1(
  p_organization_id uuid,p_product_id uuid
) returns table(
  product_id uuid,parent_product_id uuid,is_parent boolean,variation_label text,
  name text,sku text,barcode text,price numeric,cover_media_id uuid,
  quantity numeric,unit text,conversion_factor integer,is_active boolean
) language plpgsql stable security definer set search_path=''
as $function$
declare v_parent_id uuid;
begin
  if (select auth.uid()) is null
    or not (
      private.has_tenant_module_permission(p_organization_id,'products','products.view')
      or private.has_tenant_module_permission(p_organization_id,'inventory','inventory.details.view')
    )
    or not exists (select 1 from public.products p
      where p.id=p_product_id and p.organization_id=p_organization_id)
  then raise exception 'Sem permissão para consultar variações desta empresa.' using errcode='42501'; end if;

  select link.parent_product_id into v_parent_id
  from public.product_variation_links link
  where link.organization_id=p_organization_id and link.variation_product_id=p_product_id;
  v_parent_id:=coalesce(v_parent_id,p_product_id);
  -- Produto isolado sem variações não retorna grupos fictícios.
  if not exists (select 1 from public.product_variation_links link
    where link.organization_id=p_organization_id and link.parent_product_id=v_parent_id)
  then return; end if;

  return query
  select p.id,v_parent_id,p.id=v_parent_id,
    coalesce(link.variation_label,'Principal')::text,p.name,p.sku,p.barcode,
    p.price,p.cover_media_id,coalesce(i.quantity,0),
    coalesce(i.unit,p.commercial_unit,'un'),
    greatest(1,coalesce(i.conversion_factor,1)),p.is_active
  from public.products p
  left join public.product_variation_links link
    on link.organization_id=p_organization_id
    and link.parent_product_id=v_parent_id and link.variation_product_id=p.id
  left join public.inventory_items i
    on i.product_id=p.id and i.organization_id=p_organization_id
  where p.organization_id=p_organization_id
    and (p.id=v_parent_id or link.variation_product_id is not null)
  order by (p.id=v_parent_id) desc,link.variation_label,p.name;
end;
$function$;
revoke all on function public.list_product_variations_v1(uuid,uuid) from public,anon;
grant execute on function public.list_product_variations_v1(uuid,uuid) to authenticated;

create or replace function public.replace_product_variations_v1(
  p_organization_id uuid,p_parent_product_id uuid,p_variations jsonb
) returns integer
language plpgsql security definer set search_path=''
as $function$
declare v_count integer;v_item jsonb;v_child uuid;v_label text;
begin
  if (select auth.uid()) is null
    or not private.has_tenant_module_permission(p_organization_id,'products','products.update')
  then raise exception 'Sem permissão para editar variações.' using errcode='42501'; end if;

  -- Impede edição simultânea do mesmo agrupamento e mantém operação atômica.
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||p_parent_product_id::text,0));
  if not exists(select 1 from public.products p
      where p.id=p_parent_product_id and p.organization_id=p_organization_id)
  then raise exception 'Produto principal não pertence à empresa.' using errcode='42501'; end if;
  if exists(select 1 from public.product_variation_links
      where organization_id=p_organization_id and variation_product_id=p_parent_product_id)
  then raise exception 'Uma variação não pode ser produto principal de outro grupo.' using errcode='22023'; end if;
  if jsonb_typeof(p_variations) is distinct from 'array' then
    raise exception 'Informe uma lista de variações.' using errcode='22023'; end if;
  v_count:=jsonb_array_length(p_variations);
  if v_count>30 then raise exception 'Máximo de 30 variações por produto.' using errcode='22023'; end if;

  for v_item in select value from jsonb_array_elements(p_variations) loop
    begin v_child:=(v_item->>'product_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Identificador de variação inválido.' using errcode='22023';
    end;
    v_label:=btrim(coalesce(v_item->>'label',''));
    if v_child is null or v_child=p_parent_product_id or length(v_label) not between 1 and 100 then
      raise exception 'Informe outro produto e uma identificação de 1 a 100 caracteres.' using errcode='22023'; end if;
    if not exists(select 1 from public.products p
      where p.id=v_child and p.organization_id=p_organization_id)
    then raise exception 'A variação precisa pertencer à mesma empresa.' using errcode='42501'; end if;
    if exists(select 1 from public.product_variation_links l
      where l.organization_id=p_organization_id and l.parent_product_id=v_child)
    then raise exception 'Um produto principal de outro grupo não pode ser uma variação.' using errcode='22023'; end if;
    if exists(select 1 from public.product_variation_links l
      where l.organization_id=p_organization_id and l.variation_product_id=v_child
        and l.parent_product_id<>p_parent_product_id)
    then raise exception 'Este produto já é variação de outro produto principal.' using errcode='22023'; end if;
  end loop;
  if (select count(distinct x.product_id) from (
      select (value->>'product_id')::uuid product_id from jsonb_array_elements(p_variations)
    ) x)<>v_count
  then raise exception 'Não repita produtos na lista de variações.' using errcode='22023'; end if;

  delete from public.product_variation_links
    where organization_id=p_organization_id and parent_product_id=p_parent_product_id;
  insert into public.product_variation_links
    (organization_id,parent_product_id,variation_product_id,variation_label)
  select p_organization_id,p_parent_product_id,
    (value->>'product_id')::uuid,btrim(value->>'label')
  from jsonb_array_elements(p_variations);
  return v_count;
end;
$function$;
revoke all on function public.replace_product_variations_v1(uuid,uuid,jsonb) from public,anon;
grant execute on function public.replace_product_variations_v1(uuid,uuid,jsonb) to authenticated;

commit;
