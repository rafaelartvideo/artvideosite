-- Marketplace Union: lojas somente de empresas ja cadastradas e habilitadas.
-- Etapa 1: lojas, categorias, anuncios vinculados aos cadastros internos e moderacao.
begin;

insert into public.permissions (key,label,description,module_name,sort_order) values
 ('marketplace.store.manage','Gerenciar loja','Editar o perfil comercial da loja da empresa.','Marketplace Union — Loja',5031),
 ('marketplace.listings.manage','Gerenciar anuncios','Criar, editar, pausar e enviar anuncios para aprovacao.','Marketplace Union — Anuncios',5032),
 ('platform.marketplace.manage','Moderar marketplace','Aprovar lojas e anuncios de todas as empresas participantes.','Marketplace Union — Administracao',5033)
on conflict (key) do update set label=excluded.label,description=excluded.description,module_name=excluded.module_name,sort_order=excluded.sort_order;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,newperm.id
from public.role_permissions rp
join public.permissions base on base.id=rp.permission_id
join public.permissions newperm on (
 (base.key='marketplace.view' and newperm.key in ('marketplace.store.manage','marketplace.listings.manage'))
 or (base.key='organizations.edit' and newperm.key='platform.marketplace.manage')
)
on conflict (role_id,permission_id) do nothing;

create table if not exists public.marketplace_stores (
 organization_id uuid primary key references public.organizations(id) on delete restrict,
 slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
 display_name text not null check(length(btrim(display_name)) between 2 and 120),
 description text not null default '',
 city text not null default '',
 state text not null default '',
 logo_url text,
 banner_url text,
 status text not null default 'pending' check(status in ('pending','approved','suspended')),
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_categories (
 id uuid primary key default gen_random_uuid(),
 name text not null unique,
 slug text not null unique check(slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
 parent_id uuid references public.marketplace_categories(id) on delete restrict,
 is_active boolean not null default true,
 sort_order integer not null default 0
);
create index if not exists marketplace_categories_parent_idx on public.marketplace_categories(parent_id,sort_order);

create table if not exists public.marketplace_listings (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.marketplace_stores(organization_id) on delete restrict,
 source_kind text not null check(source_kind in ('service','product')),
 source_id uuid not null,
 category_id uuid references public.marketplace_categories(id) on delete set null,
 title text not null check(length(btrim(title)) between 3 and 180),
 description text not null default '',
 price_type text not null default 'quote' check(price_type in ('fixed','quote','appointment')),
 price numeric(12,2) check(price is null or price >= 0),
 cover_image_url text,
 status text not null default 'draft' check(status in ('draft','pending','approved','rejected','paused')),
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,source_kind,source_id),
 constraint marketplace_listings_fixed_price check(price_type<>'fixed' or price is not null)
);
create index if not exists marketplace_listings_public_idx on public.marketplace_listings(status,category_id,created_at desc);
create index if not exists marketplace_listings_org_idx on public.marketplace_listings(organization_id,status,created_at desc);

-- Nunca criar lojas nem anuncios para empresas sem o modulo explicitamente ativo.
create or replace function private.marketplace_org_enabled(p_org uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists (
  select 1 from public.organizations o
  join public.organization_modules m on m.organization_id=o.id and m.module_key='marketplace' and m.is_enabled
  where o.id=p_org and o.status='active'
 );
$$;

create or replace function private.marketplace_is_public(p_org uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.marketplace_org_enabled(p_org) and exists(
  select 1 from public.marketplace_stores s where s.organization_id=p_org and s.status='approved'
 );
$$;

-- As chaves genericamente vinculadas ao catalogo nao podem apontar para outra empresa.
create or replace function private.marketplace_listing_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_platform boolean;
  v_source_ok boolean;
begin
 v_platform := private.has_platform_permission('platform.marketplace.manage');
 if not private.marketplace_org_enabled(new.organization_id) then
  raise exception 'O marketplace nao esta habilitado para esta empresa.' using errcode='42501';
 end if;
 if new.source_kind='service' then
  select exists(select 1 from public.general_services x where x.id=new.source_id and x.organization_id=new.organization_id and x.is_active) into v_source_ok;
 else
  select exists(select 1 from public.products x where x.id=new.source_id and x.organization_id=new.organization_id and x.is_active) into v_source_ok;
 end if;
 if not v_source_ok then
  raise exception 'Item de origem inexistente, inativo ou de outra empresa.' using errcode='23514';
 end if;
 if tg_op='INSERT' then
  if not v_platform and new.status not in ('draft','pending') then
   raise exception 'O fornecedor nao pode aprovar o proprio anuncio.' using errcode='42501';
  end if;
 else
  if new.organization_id is distinct from old.organization_id
     or new.source_kind is distinct from old.source_kind
     or new.source_id is distinct from old.source_id then
    raise exception 'A origem do anuncio nao pode ser alterada.' using errcode='42501';
  end if;
  if not v_platform then
   if new.status in ('approved','rejected') and new.status is distinct from old.status then
    raise exception 'Aprovacao e rejeicao sao exclusivas da Union.' using errcode='42501';
   end if;
   if old.status='approved' and (
    new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.category_id is distinct from old.category_id
    or new.price_type is distinct from old.price_type
    or new.price is distinct from old.price
    or new.cover_image_url is distinct from old.cover_image_url
   ) then
    new.status:='pending';
   end if;
   if new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Revisao exclusiva da Union.' using errcode='42501';
   end if;
  end if;
 end if;
 if new.status='approved' and not private.marketplace_is_public(new.organization_id) then
   raise exception 'A loja precisa estar aprovada para publicar anuncios.' using errcode='23514';
 end if;
 if v_platform and new.status='approved' and (tg_op='INSERT' or new.status is distinct from old.status) then
  new.reviewed_at:=now();
 end if;
 new.updated_at:=now();
 return new;
end;
$$;

create or replace function private.marketplace_store_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_platform boolean;
begin
 v_platform := private.has_platform_permission('platform.marketplace.manage');
 if not private.marketplace_org_enabled(new.organization_id) then
  raise exception 'Marketplace nao habilitado para esta empresa.' using errcode='42501';
 end if;
 if tg_op='UPDATE' then
  if new.organization_id is distinct from old.organization_id then
   raise exception 'Nao e possivel transferir uma loja.' using errcode='42501';
  end if;
  if not v_platform and (new.status is distinct from old.status or new.reviewed_at is distinct from old.reviewed_at) then
   raise exception 'A aprovacao da loja cabe somente a Union.' using errcode='42501';
  end if;
 elsif not v_platform and new.status <> 'pending' then
  raise exception 'A loja deve ser submetida para aprovacao.' using errcode='42501';
 end if;
 if v_platform and new.status='approved' and (tg_op='INSERT' or new.status is distinct from old.status) then
  new.reviewed_at:=now();
 end if;
 new.updated_at:=now();
 return new;
end;
$$;

create trigger marketplace_store_guard before insert or update on public.marketplace_stores
for each row execute function private.marketplace_store_guard();
create trigger marketplace_listing_guard before insert or update on public.marketplace_listings
for each row execute function private.marketplace_listing_guard();

alter table public.marketplace_stores enable row level security;
alter table public.marketplace_categories enable row level security;
alter table public.marketplace_listings enable row level security;

create policy marketplace_stores_public_read on public.marketplace_stores for select to anon,authenticated
using (status='approved' and private.marketplace_org_enabled(organization_id));
create policy marketplace_stores_staff_read on public.marketplace_stores for select to authenticated
using (
 private.has_tenant_module_permission(organization_id,'marketplace','marketplace.view')
 or private.has_platform_permission('platform.marketplace.manage')
);
create policy marketplace_stores_insert on public.marketplace_stores for insert to authenticated
with check (
 private.has_tenant_module_permission(organization_id,'marketplace','marketplace.store.manage')
 or private.has_platform_permission('platform.marketplace.manage')
);
create policy marketplace_stores_update on public.marketplace_stores for update to authenticated
using (
 private.has_tenant_module_permission(organization_id,'marketplace','marketplace.store.manage')
 or private.has_platform_permission('platform.marketplace.manage')
)
with check (
 private.has_tenant_module_permission(organization_id,'marketplace','marketplace.store.manage')
 or private.has_platform_permission('platform.marketplace.manage')
);
create policy marketplace_categories_public_read on public.marketplace_categories for select to anon,authenticated
using (is_active);
create policy marketplace_categories_staff_read on public.marketplace_categories for select to authenticated
using (private.has_platform_permission('platform.marketplace.manage'));
create policy marketplace_categories_insert on public.marketplace_categories for insert to authenticated
with check(private.has_platform_permission('platform.marketplace.manage'));
create policy marketplace_categories_update on public.marketplace_categories for update to authenticated
using(private.has_platform_permission('platform.marketplace.manage'))
with check(private.has_platform_permission('platform.marketplace.manage'));
create policy marketplace_listings_public_read on public.marketplace_listings for select to anon,authenticated
using (status='approved' and private.marketplace_is_public(organization_id));
create policy marketplace_listings_staff_read on public.marketplace_listings for select to authenticated
using (
 private.has_tenant_module_permission(organization_id,'marketplace','marketplace.view')
 or private.has_platform_permission('platform.marketplace.manage')
);
create policy marketplace_listings_insert on public.marketplace_listings for insert to authenticated
with check(
 private.has_tenant_module_permission(organization_id,'marketplace','marketplace.listings.manage')
 or private.has_platform_permission('platform.marketplace.manage')
);
create policy marketplace_listings_update on public.marketplace_listings for update to authenticated
using(
 private.has_tenant_module_permission(organization_id,'marketplace','marketplace.listings.manage')
 or private.has_platform_permission('platform.marketplace.manage')
)
with check(
 private.has_tenant_module_permission(organization_id,'marketplace','marketplace.listings.manage')
 or private.has_platform_permission('platform.marketplace.manage')
);
grant select on public.marketplace_stores,public.marketplace_categories,public.marketplace_listings to anon;
grant select,insert,update on public.marketplace_stores,public.marketplace_categories,public.marketplace_listings to authenticated;
revoke all on function private.marketplace_org_enabled(uuid),private.marketplace_is_public(uuid) from public;
grant execute on function private.marketplace_org_enabled(uuid),private.marketplace_is_public(uuid) to anon,authenticated;
revoke all on function private.marketplace_listing_guard(),private.marketplace_store_guard() from public;

-- Nao ativar o marketplace automaticamente por aderir a um plano.
-- A Union libera cada empresa explicitamente no cadastro de modulos.
update public.platform_billing_plan_modules set is_included=false
where module_key='marketplace' and is_included;
update public.organization_modules m set is_enabled=false,updated_at=now()
where m.module_key='marketplace' and m.is_enabled
and exists(select 1 from public.organizations o where o.id=m.organization_id and o.organization_type='partner')
and not exists(select 1 from public.marketplace_stores s where s.organization_id=m.organization_id);

-- Categorias globais: apenas a Union podera adicionar ou editar as categorias.
insert into public.marketplace_categories(name,slug,sort_order) values
 ('Assistencia tecnica','assistencia-tecnica',10),
 ('Casa e manutencao','casa-e-manutencao',20),
 ('Informatica e tecnologia','informatica-e-tecnologia',30),
 ('Servicos profissionais','servicos-profissionais',40),
 ('Beleza e bem-estar','beleza-e-bem-estar',50),
 ('Produtos','produtos',60)
on conflict (slug) do nothing;
commit;