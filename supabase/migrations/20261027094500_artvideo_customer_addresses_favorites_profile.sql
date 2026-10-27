-- Customer-only saved addresses and favorites; isolated by authenticated user.
create table if not exists public.artvideo_customer_addresses (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null default public.artvideo_organization_id() references public.organizations(id),
 user_id uuid not null references auth.users(id) on delete cascade,
 label text not null default 'Casa',
 postal_code text not null,
 street text not null,
 number text not null,
 complement text,
 district text not null,
 city text not null,
 state text not null,
 is_default boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint artvideo_customer_address_postcode_check check (postal_code ~ '^[0-9]{8}$'),
 constraint artvideo_customer_address_state_check check (state ~ '^[A-Z]{2}$')
);
create index if not exists artvideo_customer_addresses_owner_idx on public.artvideo_customer_addresses(user_id, created_at desc);
create unique index if not exists artvideo_customer_one_default_address_idx on public.artvideo_customer_addresses(user_id) where is_default;

create table if not exists public.artvideo_customer_favorites (
 organization_id uuid not null default public.artvideo_organization_id() references public.organizations(id),
 user_id uuid not null references auth.users(id) on delete cascade,
 product_id uuid not null references public.products(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(user_id,product_id)
);
create index if not exists artvideo_customer_favorites_user_idx on public.artvideo_customer_favorites(user_id,created_at desc);
create or replace function public.artvideo_customer_favorite_validate_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.organization_id <> public.artvideo_organization_id()
    or not exists(select 1 from public.products p where p.id=new.product_id and p.organization_id=new.organization_id)
 then raise exception 'Produto indisponivel.' using errcode='23514'; end if;
 return new;
end $$;
drop trigger if exists artvideo_customer_favorite_validate_trigger on public.artvideo_customer_favorites;
create trigger artvideo_customer_favorite_validate_trigger before insert or update on public.artvideo_customer_favorites
for each row execute function public.artvideo_customer_favorite_validate_v1();

alter table public.artvideo_customer_addresses enable row level security;
alter table public.artvideo_customer_favorites enable row level security;
drop policy if exists artvideo_site_address_owner on public.artvideo_customer_addresses;
create policy artvideo_site_address_owner on public.artvideo_customer_addresses for all to authenticated
using ((select auth.uid())=user_id and organization_id=public.artvideo_organization_id())
with check ((select auth.uid())=user_id and organization_id=public.artvideo_organization_id());
drop policy if exists artvideo_site_favorite_owner on public.artvideo_customer_favorites;
create policy artvideo_site_favorite_owner on public.artvideo_customer_favorites for all to authenticated
using ((select auth.uid())=user_id and organization_id=public.artvideo_organization_id())
with check ((select auth.uid())=user_id and organization_id=public.artvideo_organization_id());
grant select,insert,update,delete on public.artvideo_customer_addresses to authenticated;
grant select,insert,delete on public.artvideo_customer_favorites to authenticated;
revoke all on public.artvideo_customer_addresses,public.artvideo_customer_favorites from anon;

create or replace function public.artvideo_customer_update_profile_v1(p_name text,p_phone text,p_cpf text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid:=auth.uid();v_org uuid:=public.artvideo_organization_id();
 v_name text:=btrim(coalesce(p_name,''));v_phone text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
 v_cpf text:=regexp_replace(coalesce(p_cpf,''),'[^0-9]','','g');
 v_current public.artvideo_customer_accounts%rowtype;
 v_changed boolean;v_candidate uuid;v_matches integer;
begin
 if v_uid is null or not exists(select 1 from auth.users u where u.id=v_uid and u.email_confirmed_at is not null)
 then raise exception 'Confirme seu e-mail antes de atualizar os dados.' using errcode='42501'; end if;
 if length(v_name)<3 or length(v_name)>120 then raise exception 'Informe o nome completo.'; end if;
 if length(v_phone) not in (10,11) then raise exception 'Informe um WhatsApp com DDD valido.'; end if;
 if not public.artvideo_valid_cpf_v1(v_cpf) then raise exception 'Informe um CPF valido.'; end if;
 select * into v_current from public.artvideo_customer_accounts a
 where a.user_id=v_uid and a.organization_id=v_org for update;
 if not found then raise exception 'Conta nao encontrada.'; end if;
 v_changed:=v_cpf is distinct from v_current.cpf
   or public.artvideo_first_name_key_v1(v_name) is distinct from public.artvideo_first_name_key_v1(v_current.full_name);
 if v_changed then
   select count(*),min(e.id::text)::uuid into v_matches,v_candidate
   from public.entities e where e.organization_id=v_org and e.document=v_cpf;
   if v_matches<>1 then v_candidate:=null; end if;
 end if;
 update public.artvideo_customer_accounts a set full_name=v_name,phone=v_phone,cpf=v_cpf,
 entity_id=case when v_changed then null else a.entity_id end,
 review_entity_id=case when v_changed then v_candidate else a.review_entity_id end,
 review_reason=case when v_changed then 'profile_changed' else a.review_reason end,
 link_status=case when v_changed then 'pending_review' else a.link_status end,
 reviewed_at=case when v_changed then null else a.reviewed_at end,
 reviewed_by=case when v_changed then null else a.reviewed_by end,
 updated_at=now()
 where a.user_id=v_uid and a.organization_id=v_org;
 return jsonb_build_object('status','saved','pending_review',v_changed);
end $$;
revoke all on function public.artvideo_customer_update_profile_v1(text,text,text) from public,anon;
grant execute on function public.artvideo_customer_update_profile_v1(text,text,text) to authenticated;
