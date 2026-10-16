begin;

-- Leitura pública, restrita aos produtos publicados da Artvideo.
-- Estoque e fotos são consultados pela função, sem abrir as tabelas internas.
create table if not exists public.artvideo_product_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.artvideo_organization_id(),
  product_id uuid not null references public.products(id) on delete cascade,
  author_name text not null,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(btrim(body)) between 10 and 1500),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  verified_purchase boolean not null default false,
  created_at timestamptz not null default now(),
  constraint artvideo_product_reviews_org check (organization_id = public.artvideo_organization_id())
);

create index if not exists artvideo_product_reviews_approved_idx
  on public.artvideo_product_reviews (product_id,created_at desc)
  where status='approved';

alter table public.artvideo_product_reviews enable row level security;
revoke all on public.artvideo_product_reviews from public, anon, authenticated;

drop policy if exists artvideo_product_reviews_public_read on public.artvideo_product_reviews;
create policy artvideo_product_reviews_public_read
on public.artvideo_product_reviews for select to anon,authenticated
using (status='approved'
  and organization_id=public.artvideo_organization_id()
  and exists (select 1 from public.products p
    where p.id=product_id and p.organization_id=organization_id
      and p.is_active=true and p.show_in_catalog=true));

grant select on public.artvideo_product_reviews to anon,authenticated;
-- Aprovação e inserção só por operações do servidor. Avaliações não são inventadas
-- nem liberadas publicamente sem o fluxo de compra confirmada.

create or replace function public.artvideo_product_storefront_v1(p_product_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path=''
as $$
declare
  v_product public.products%rowtype;
  v_gallery jsonb := '[]'::jsonb;
  v_reviews jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_avg numeric := 0;
  v_available numeric := 0;
  v_factor numeric := 1;
begin
  select * into v_product from public.products
  where id=p_product_id and organization_id=public.artvideo_organization_id()
    and is_active=true and show_in_catalog=true;
  if not found then return null; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object('media_id',pm.media_id,'bucket',m.bucket_id,
      'path',m.storage_path,'alt',m.alt_text)
    order by pm.sort_order,pm.media_id),'[]'::jsonb)
  into v_gallery
  from public.product_media pm
  join public.media m on m.id=pm.media_id and m.organization_id=pm.organization_id
  where pm.organization_id=v_product.organization_id and pm.product_id=v_product.id
    and m.bucket_id='product-images';

  select greatest(0,coalesce(floor(i.quantity
    / (case when v_product.commercial_unit='cx'
      then greatest(1,coalesce(i.conversion_factor,1)) else 1 end)),0))
  into v_available
  from public.inventory_items i
  where i.product_id=v_product.id and i.organization_id=v_product.organization_id
    and i.is_active=true
  limit 1;

  select count(*)::int,coalesce(round(avg(r.rating)::numeric,1),0)
  into v_count,v_avg from public.artvideo_product_reviews r
  where r.product_id=v_product.id and r.organization_id=v_product.organization_id
    and r.status='approved';

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,'author',r.author_name,'rating',r.rating,'body',r.body,
      'verified_purchase',r.verified_purchase,'created_at',r.created_at)
    order by r.created_at desc),'[]'::jsonb)
  into v_reviews
  from (select * from public.artvideo_product_reviews
    where product_id=v_product.id and status='approved'
    order by created_at desc limit 30) r;

  return jsonb_build_object(
    'stock',coalesce(v_available,0),'gallery',v_gallery,
    'rating',v_avg,'review_count',v_count,'reviews',v_reviews,
    'weight_grams',v_product.gross_weight_grams,
    'height_mm',v_product.height_mm,'width_mm',v_product.width_mm,
    'length_mm',v_product.length_mm);
end;
$$;
revoke all on function public.artvideo_product_storefront_v1(uuid) from public;
grant execute on function public.artvideo_product_storefront_v1(uuid) to anon,authenticated;

commit;
