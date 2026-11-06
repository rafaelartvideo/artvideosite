-- Similaridade comercial independente de compatibilidade tecnica e de variantes.
begin;
create table if not exists public.product_similar_links (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id_a uuid not null references public.products(id) on delete cascade,
  product_id_b uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (organization_id, product_id_a, product_id_b),
  constraint product_similar_ordered_pair check (product_id_a < product_id_b)
);
create index if not exists product_similar_links_reverse_idx on public.product_similar_links
(organization_id, product_id_b, product_id_a);
alter table public.product_similar_links enable row level security;
revoke all on public.product_similar_links from public,anon,authenticated;

create or replace function public.list_product_similar_ids_v1(
  p_organization_id uuid, p_product_id uuid
) returns table(product_id uuid) language plpgsql stable security definer set search_path=''
as $function$
begin
 if (select auth.uid()) is null or not (
   private.has_tenant_module_permission(p_organization_id,'products','products.view')
   or private.has_tenant_module_permission(p_organization_id,'inventory','inventory.details.view')
   or private.has_tenant_module_permission(p_organization_id,'inventory','inventory.update')
 ) or not exists (select 1 from public.products p where p.id=p_product_id and p.organization_id=p_organization_id)
 then raise exception 'Sem acesso aos similares desta empresa.' using errcode='42501'; end if;
 return query
 select case when l.product_id_a=p_product_id then l.product_id_b else l.product_id_a end
 from public.product_similar_links l
 where l.organization_id=p_organization_id and (l.product_id_a=p_product_id or l.product_id_b=p_product_id)
 order by 1;
end;
$function$;
revoke all on function public.list_product_similar_ids_v1(uuid,uuid) from public,anon;
grant execute on function public.list_product_similar_ids_v1(uuid,uuid) to authenticated;

create or replace function public.replace_product_similar_ids_v1(
 p_organization_id uuid, p_product_id uuid, p_similar_ids uuid[]
) returns integer language plpgsql security definer set search_path=''
as $function$
declare v_product public.products%rowtype; v_ids uuid[]:=coalesce(p_similar_ids,'{}'::uuid[]);
begin
 if (select auth.uid()) is null then raise exception 'Usuario nao autenticado.' using errcode='42501'; end if;
 select * into v_product from public.products
 where organization_id=p_organization_id and id=p_product_id for update;
 if not found then raise exception 'Produto nao encontrado.' using errcode='P0002'; end if;
 if not (private.has_tenant_module_permission(p_organization_id,'products','products.update')
   or private.has_tenant_module_permission(p_organization_id,'inventory','inventory.update')
   or (private.has_tenant_module_permission(p_organization_id,'products','products.create')
      and v_product.created_by=(select auth.uid()) and v_product.created_at>now()-interval '5 minutes'))
 then raise exception 'Sem permissao para editar similares.' using errcode='42501'; end if;
 if cardinality(v_ids)>60 or (select count(distinct x) from unnest(v_ids) x)<>cardinality(v_ids)
 then raise exception 'Lista de similares invalida ou repetida.' using errcode='22023'; end if;
 if exists (select 1 from unnest(v_ids) x where x is null or x=p_product_id
  or not exists (select 1 from public.products p where p.id=x and p.organization_id=p_organization_id))
 then raise exception 'Os similares devem ser outros produtos da mesma empresa.' using errcode='22023'; end if;
 delete from public.product_similar_links
 where organization_id=p_organization_id and (product_id_a=p_product_id or product_id_b=p_product_id);
 insert into public.product_similar_links(organization_id,product_id_a,product_id_b,created_by)
 select p_organization_id,least(p_product_id,x),greatest(p_product_id,x),(select auth.uid()) from unnest(v_ids) x;
 return cardinality(v_ids);
end;
$function$;
revoke all on function public.replace_product_similar_ids_v1(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.replace_product_similar_ids_v1(uuid,uuid,uuid[]) to authenticated;
commit;