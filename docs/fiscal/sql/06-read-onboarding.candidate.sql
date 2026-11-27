-- Candidate migration. Read-only onboarding; does not authorize fiscal issuance.
begin;
create table public.fiscal_admin_events(
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references public.fiscal_provider_accounts(id) on delete restrict,
 organization_id uuid not null references public.organizations(id) on delete restrict,
 binding_id uuid not null references public.fiscal_organization_bindings(id) on delete restrict,
 actor_id uuid not null,
 action text not null check(action in ('enable_read')),
 created_at timestamptz not null default now()
);
alter table public.fiscal_admin_events enable row level security;
revoke all on public.fiscal_admin_events from public,anon,authenticated;
grant select,insert on public.fiscal_admin_events to service_role;

create function public.fiscal_enable_read_binding(
 p_account uuid,p_org uuid,p_actor uuid,p_expected_revision bigint,p_visible_cnpjs text[]
) returns uuid language plpgsql security invoker set search_path='' as $$
declare a public.fiscal_provider_accounts%rowtype; org_cnpj text; x text; slot integer; bid uuid; external_id bigint;
begin
 if p_actor is null or not exists(
   select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id
   join public.profiles p on p.id=m.user_id
   where m.user_id=p_actor and m.status='active' and o.status='active' and p.is_active
   and o.settings->>'is_platform_operator'='true'
 ) then raise exception 'fiscal actor unavailable'; end if;
 select * into a from public.fiscal_provider_accounts where id=p_account and provider='fiscontrole' for update;
 if not found or a.session_revision is distinct from p_expected_revision then raise exception 'fiscal session changed'; end if;
 select regexp_replace(coalesce(document,''),'[^0-9]','','g') into org_cnpj from public.organizations
   where id=p_org and status='active' and coalesce(settings->>'is_platform_operator','false')<>'true' for update;
 if not found or org_cnpj !~ '^[0-9]{14}$' then raise exception 'organization CNPJ invalid'; end if;
 if p_visible_cnpjs is null or cardinality(p_visible_cnpjs) not between 1 and 10000
   or exists(select 1 from unnest(p_visible_cnpjs) as v(cnpj) where cnpj is null or cnpj !~ '^[0-9]{14}$')
   or not (org_cnpj=any(p_visible_cnpjs)) then raise exception 'provider access not confirmed'; end if;
 -- Reserve every visible CNPJ, even if not linked. Keep old reservations:
 -- a visibility gap is not evidence that a contractual slot has been freed.
 if (select count(*) from (
   select cnpj from public.fiscal_account_cnpjs where account_id=p_account
   union select unnest(p_visible_cnpjs)
 ) all_cnpjs)>a.cnpj_limit then raise exception 'fiscal account quota exceeded'; end if;
 if exists(select 1 from public.fiscal_organization_bindings
   where cnpj=org_cnpj and (organization_id<>p_org or account_id<>p_account))
 then raise exception 'CNPJ already bound'; end if;
 update public.fiscal_account_cnpjs set verified_at=null
 where account_id=p_account and not(cnpj=any(p_visible_cnpjs));
 for x in select distinct v.cnpj from unnest(p_visible_cnpjs) as v(cnpj) order by v.cnpj loop
   update public.fiscal_account_cnpjs set verified_at=now() where account_id=p_account and cnpj=x;
   if not found then
     select n into slot from generate_series(1,a.cnpj_limit) n
     where not exists(select 1 from public.fiscal_account_cnpjs c where c.account_id=p_account and c.slot_number=n)
     order by n limit 1;
     if slot is null then raise exception 'fiscal account quota exceeded'; end if;
     insert into public.fiscal_account_cnpjs(account_id,account_limit,slot_number,cnpj,verified_at)
       values(p_account,a.cnpj_limit,slot,x,now());
   end if;
 end loop;
 select external_company_id into external_id from public.fiscal_account_cnpjs where account_id=p_account and cnpj=org_cnpj;
 insert into public.fiscal_organization_bindings(organization_id,account_id,cnpj,external_company_id,is_enabled,sync_enabled)
 values(p_org,p_account,org_cnpj,external_id,true,true)
 on conflict(cnpj) do update set is_enabled=true,sync_enabled=true
 where fiscal_organization_bindings.organization_id=p_org and fiscal_organization_bindings.account_id=p_account
 returning id into bid;
 if bid is null then raise exception 'CNPJ binding conflict'; end if;
 update public.fiscal_provider_accounts set is_active=true,inventory_verified_at=now() where id=p_account;
 insert into public.organization_modules(organization_id,module_key,is_enabled,enabled_by,enabled_at)
 values(p_org,'fiscal',true,p_actor,now())
 on conflict(organization_id,module_key) do update set is_enabled=true,enabled_by=p_actor,enabled_at=now(),updated_at=now();
 insert into public.fiscal_admin_events(account_id,organization_id,binding_id,actor_id,action)
 values(p_account,p_org,bid,p_actor,'enable_read');
 return bid;
end;
$$;
revoke all on function public.fiscal_enable_read_binding(uuid,uuid,uuid,bigint,text[]) from public,anon,authenticated;
grant execute on function public.fiscal_enable_read_binding(uuid,uuid,uuid,bigint,text[]) to service_role;
commit;
