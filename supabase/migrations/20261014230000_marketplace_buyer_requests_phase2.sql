
-- Marketplace fase 2: contas de compradores e pedidos de serviços.
-- Dados de contato ficam separados dos pedidos; somente o titular os acessa.
begin;

create table if not exists public.marketplace_buyers (
 user_id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
 phone text not null default '' check (char_length(phone) <= 30),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_service_requests (
 id uuid primary key default gen_random_uuid(),
 buyer_id uuid not null references public.marketplace_buyers(user_id) on delete restrict,
 listing_id uuid references public.marketplace_listings(id) on delete set null,
 category_id uuid references public.marketplace_categories(id) on delete set null,
 title text not null check (char_length(btrim(title)) between 8 and 160),
 description text not null check (char_length(btrim(description)) between 30 and 3000),
 city text not null check (char_length(btrim(city)) between 2 and 120),
 state text not null check (state ~ '^[A-Z]{2}$'),
 preferred_date date,
 status text not null default 'open' check (status in ('open','cancelled','closed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists marketplace_requests_buyer_created_idx on public.marketplace_service_requests(buyer_id,created_at desc);
create index if not exists marketplace_requests_state_status_idx on public.marketplace_service_requests(state,status,created_at desc);

-- Confirma que o anúncio específico é um serviço realmente publicado.
create or replace function private.marketplace_request_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
   if new.buyer_id is distinct from old.buyer_id
      or new.listing_id is distinct from old.listing_id then
     raise exception 'Nao e possivel alterar o titular ou anuncio vinculado.' using errcode='42501';
   end if;
   if old.status<>'open' then
     raise exception 'Um pedido encerrado nao pode ser alterado.' using errcode='42501';
   end if;
 end if;
 if new.listing_id is not null and not exists(
   select 1 from public.marketplace_listings l
   where l.id=new.listing_id and l.status='approved' and l.source_kind='service'
     and private.marketplace_is_public(l.organization_id)
 ) then
   raise exception 'Este anuncio de servico nao esta disponivel.' using errcode='23514';
 end if;
 if tg_op='INSERT' and new.status <> 'open' then
   raise exception 'Um pedido deve comecar aberto.' using errcode='23514';
 end if;
 new.updated_at=now();
 return new;
end;
$$;
drop trigger if exists marketplace_request_guard on public.marketplace_service_requests;
create trigger marketplace_request_guard before insert or update on public.marketplace_service_requests
for each row execute function private.marketplace_request_guard();

-- Apenas organizações ativas, com loja aprovada e permissão de anúncios,
-- podem consultar oportunidades do seu estado. Nunca acessam os contatos.
create or replace function private.marketplace_can_view_request(p_state text)
returns boolean language sql stable security definer set search_path='' as $$
 select private.has_platform_permission('platform.marketplace.manage')
 or exists(
   select 1 from public.marketplace_stores s
   where s.status='approved' and upper(s.state)=upper(p_state)
     and private.marketplace_org_enabled(s.organization_id)
     and private.has_tenant_module_permission(
       s.organization_id, 'marketplace', 'marketplace.listings.manage'
     )
 );
$$;

alter table public.marketplace_buyers enable row level security;
alter table public.marketplace_service_requests enable row level security;
revoke all on public.marketplace_buyers from anon;
revoke all on public.marketplace_service_requests from anon;
grant select,insert,update on public.marketplace_buyers to authenticated;
grant select,insert,update on public.marketplace_service_requests to authenticated;

create policy marketplace_buyers_owner_select on public.marketplace_buyers
for select to authenticated using ((select auth.uid())=user_id);
create policy marketplace_buyers_owner_insert on public.marketplace_buyers
for insert to authenticated with check ((select auth.uid())=user_id);
create policy marketplace_buyers_owner_update on public.marketplace_buyers
for update to authenticated using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id);

create policy marketplace_requests_owner_or_staff_select on public.marketplace_service_requests
for select to authenticated using (
 (select auth.uid())=buyer_id
 or (status='open' and private.marketplace_can_view_request(state))
);
create policy marketplace_requests_owner_insert on public.marketplace_service_requests
for insert to authenticated with check (
 (select auth.uid())=buyer_id and status='open'
);
create policy marketplace_requests_owner_update on public.marketplace_service_requests
for update to authenticated using ((select auth.uid())=buyer_id)
with check ((select auth.uid())=buyer_id and status in ('open','cancelled'));

commit;
