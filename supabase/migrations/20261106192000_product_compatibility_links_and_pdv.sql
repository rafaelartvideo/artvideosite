-- Compatibilidade entre dois cadastros de produtos, separada dos códigos alternativos.
-- Pares não direcionais: A-B é a mesma relação que B-A. Somente produtos da mesma empresa.
begin;

create table if not exists public.product_compatibility_links (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id_a uuid not null references public.products(id) on delete cascade,
  product_id_b uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (organization_id,product_id_a,product_id_b),
  constraint product_compatibility_ordered_pair check (product_id_a < product_id_b)
);
create index if not exists product_compatibility_b_lookup
  on public.product_compatibility_links(organization_id,product_id_b,product_id_a);
alter table public.product_compatibility_links enable row level security;
-- Nenhum cliente pode editar/ler esta tabela diretamente; somente RPCs com validação.
revoke all on public.product_compatibility_links from public,anon,authenticated;

create or replace function public.list_product_compatibility_ids_v1(
  p_organization_id uuid,p_product_id uuid
) returns table(product_id uuid)
language plpgsql stable security definer set search_path=''
as $function$
begin
  if (select auth.uid()) is null
    or not private.has_tenant_module_permission(p_organization_id,'products','products.view')
    or not exists (select 1 from public.products p where p.id=p_product_id and p.organization_id=p_organization_id)
  then raise exception 'Produto indisponível ou sem permissão para consultar compatibilidades.' using errcode='42501'; end if;
  return query
    select case when link.product_id_a=p_product_id then link.product_id_b else link.product_id_a end
    from public.product_compatibility_links link
    where link.organization_id=p_organization_id
      and (link.product_id_a=p_product_id or link.product_id_b=p_product_id)
    order by 1;
end;
$function$;
revoke all on function public.list_product_compatibility_ids_v1(uuid,uuid) from public,anon;
grant execute on function public.list_product_compatibility_ids_v1(uuid,uuid) to authenticated;

create or replace function public.replace_product_compatibilities_v1(
  p_organization_id uuid,p_product_id uuid,p_compatible_ids uuid[]
) returns integer
language plpgsql security definer set search_path=''
as $function$
declare
  v_product public.products%rowtype;
  v_ids uuid[] := coalesce(p_compatible_ids,'{}'::uuid[]);
  v_distinct_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  select * into v_product from public.products
    where organization_id=p_organization_id and id=p_product_id for update;
  if not found then raise exception 'Produto não encontrado na empresa.' using errcode='P0002'; end if;
  -- A criação recente permite salvar os vínculos junto do cadastro, como nos códigos.
  if not (
    private.has_tenant_module_permission(p_organization_id,'products','products.update')
    or (
      private.has_tenant_module_permission(p_organization_id,'products','products.create')
      and v_product.created_by=(select auth.uid())
      and v_product.created_at > now()-interval '5 minutes'
    )
  ) then raise exception 'Sem permissão para editar compatibilidade dos produtos.' using errcode='42501'; end if;
  if cardinality(v_ids)>60 then
    raise exception 'Limite de 60 produtos compatíveis por item.' using errcode='22023'; end if;
  if exists(select 1 from unnest(v_ids) x where x is null or x=p_product_id)
  then raise exception 'Produto não pode ser compatível consigo mesmo.' using errcode='22023'; end if;
  select count(distinct x) into v_distinct_count from unnest(v_ids) x;
  if v_distinct_count<>cardinality(v_ids) then
    raise exception 'Produtos compatíveis repetidos.' using errcode='22023'; end if;
  if exists(
    select 1 from unnest(v_ids) x
    where not exists(select 1 from public.products p
      where p.id=x and p.organization_id=p_organization_id)
  ) then raise exception 'Todos os produtos compatíveis devem pertencer à mesma empresa.' using errcode='42501'; end if;

  -- Validação completa antes de apagar links; exclusão e inserção são atômicas.
  delete from public.product_compatibility_links
    where organization_id=p_organization_id
      and (product_id_a=p_product_id or product_id_b=p_product_id);
  insert into public.product_compatibility_links
    (organization_id,product_id_a,product_id_b,created_by)
  select p_organization_id,least(p_product_id,x),greatest(p_product_id,x),(select auth.uid())
  from unnest(v_ids) x;
  return cardinality(v_ids);
end;
$function$;
revoke all on function public.replace_product_compatibilities_v1(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.replace_product_compatibilities_v1(uuid,uuid,uuid[]) to authenticated;

-- Uma consulta única para as alternativas dos produtos encontrados no PDV.
-- Produtos inativos não são ofertados; resultado inclui preço e saldo atuais.
create or replace function public.list_pdv_product_compatibilities_v1(
  p_organization_id uuid,p_source_product_ids uuid[]
) returns table(
  source_product_id uuid,product_id uuid,inventory_item_id uuid,name text,
  sku text,barcode text,price numeric,cover_media_id uuid,quantity numeric,
  min_quantity numeric,unit text,conversion_factor integer
)
language plpgsql stable security definer set search_path=''
as $function$
begin
  if (select auth.uid()) is null
    or not private.has_tenant_module_permission(p_organization_id,'pdv','pdv.sales.create')
  then raise exception 'Sem permissão para consultar produtos compatíveis no PDV.' using errcode='42501'; end if;
  return query
  select source.id, alternatives.product_id, alternatives.inventory_item_id,
    alternatives.name,alternatives.sku,alternatives.barcode,alternatives.price,
    alternatives.cover_media_id,alternatives.quantity,alternatives.min_quantity,
    alternatives.unit,alternatives.conversion_factor
  from (select distinct x.id from unnest((coalesce(p_source_product_ids,'{}'::uuid[]))[1:30]) x(id)) source
  join public.products original on original.id=source.id and original.organization_id=p_organization_id
  cross join lateral (
    select p.id as product_id,stock.id as inventory_item_id,p.name,p.sku,p.barcode,
      p.price,p.cover_media_id,coalesce(stock.quantity,0) as quantity,
      coalesce(stock.min_quantity,0) as min_quantity,
      coalesce(stock.unit,p.commercial_unit,'un') as unit,
      greatest(1,coalesce(stock.conversion_factor,1)) as conversion_factor
    from public.product_compatibility_links link
    join public.products p
      on p.organization_id=link.organization_id
      and p.id=(case when link.product_id_a=source.id then link.product_id_b else link.product_id_a end)
    left join public.inventory_items stock
      on stock.product_id=p.id and stock.organization_id=p.organization_id
    where link.organization_id=p_organization_id
      and (link.product_id_a=source.id or link.product_id_b=source.id)
      and p.is_active=true
    order by case when coalesce(stock.quantity,0)>0 then 0 else 1 end,
      p.name,p.id
    limit 5
  ) alternatives;
end;
$function$;
revoke all on function public.list_pdv_product_compatibilities_v1(uuid,uuid[]) from public,anon;
grant execute on function public.list_pdv_product_compatibilities_v1(uuid,uuid[]) to authenticated;
commit;
