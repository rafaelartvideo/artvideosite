
-- Website identity review: CPF + normalized first name; never authorizes service-order access.
alter table public.artvideo_customer_accounts
  add column if not exists cpf text,
  add column if not exists link_status text not null default 'needs_cpf',
  add column if not exists review_entity_id uuid references public.entities(id) on delete set null,
  add column if not exists review_reason text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.artvideo_customer_accounts drop constraint if exists artvideo_customer_account_link_status_check;
alter table public.artvideo_customer_accounts add constraint artvideo_customer_account_link_status_check
 check (link_status in ('needs_cpf','matched','created','pending_review','approved','rejected'));
create index if not exists artvideo_customer_accounts_review_idx
 on public.artvideo_customer_accounts(organization_id,link_status,created_at desc)
 where link_status='pending_review';

comment on column public.artvideo_customer_accounts.entity_id is
 'CPF + first-name association with CRM; NOT proof of identity and NOT authorization to OS/history.';
comment on column public.artvideo_customer_accounts.link_status is
 'Profile association state. pending_review requires staff validation; never grants access to CRM histories.';

-- Accent/case-insensitive first token comparison.
create or replace function public.artvideo_first_name_key_v1(p_name text)
returns text language sql immutable set search_path=''
as $$
  select translate(
    lower(split_part(btrim(regexp_replace(coalesce(p_name,''),'\\s+',' ','g')),' ',1)),
    'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
    'aaaaaaeeeeiiiiooooouuuucnyy'
  );
$$;
revoke all on function public.artvideo_first_name_key_v1(text) from public,anon;
grant execute on function public.artvideo_first_name_key_v1(text) to authenticated;

create or replace function public.artvideo_valid_cpf_v1(p_cpf text)
returns boolean language plpgsql immutable set search_path=''
as $$
declare d text:=regexp_replace(coalesce(p_cpf,''),'[^0-9]','','g');
 t int; i int; c int;
begin
 if length(d)<>11 or d ~ '^([0-9])\\1{10}$' then return false; end if;
 t:=0;
 for i in 1..9 loop t:=t+(substr(d,i,1)::int)*(11-i); end loop;
 c:=(t*10)%11;
 if c=10 then c:=0; end if;
 if c<>substr(d,10,1)::int then return false; end if;
 t:=0;
 for i in 1..10 loop t:=t+(substr(d,i,1)::int)*(12-i); end loop;
 c:=(t*10)%11;
 if c=10 then c:=0; end if;
 return c=substr(d,11,1)::int;
end $$;
revoke all on function public.artvideo_valid_cpf_v1(text) from public,anon;
grant execute on function public.artvideo_valid_cpf_v1(text) to authenticated;

create or replace function public.artvideo_customer_activate_v2(
  p_full_name text default null,
  p_phone text default null,
  p_cpf text default null
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_uid uuid:=auth.uid(); v_org uuid; v_email text; v_confirmed timestamptz; v_meta jsonb;
 v_cpf text; v_name text; v_phone text; v_account public.artvideo_customer_accounts%rowtype;
 v_matches integer; v_candidate public.entities%rowtype; v_entity uuid;
 v_reason text; v_status text;
begin
 if v_uid is null then raise exception 'Sessao nao autenticada.' using errcode='42501'; end if;
 select lower(btrim(u.email)),u.email_confirmed_at,u.raw_user_meta_data
 into v_email,v_confirmed,v_meta from auth.users u where u.id=v_uid;
 if v_email is null or v_confirmed is null then return jsonb_build_object('status','verify_email'); end if;
 v_org:=public.artvideo_organization_id();
 if v_org is null then raise exception 'Loja indisponivel.'; end if;

 select a.* into v_account from public.artvideo_customer_accounts a
 where a.user_id=v_uid for update;
 if found then
   if v_account.organization_id<>v_org then return jsonb_build_object('status','needs_review'); end if;
   if v_account.cpf is not null and v_account.link_status <> 'needs_cpf' then
     return jsonb_build_object('status','linked','match_status',v_account.link_status);
   end if;
 end if;

 v_name:=left(btrim(coalesce(nullif(btrim(p_full_name),''),nullif(btrim(v_account.full_name),''),v_meta->>'full_name','')),120);
 if length(v_name)<3 then return jsonb_build_object('status','needs_name'); end if;
 v_cpf:=regexp_replace(coalesce(nullif(p_cpf,''),nullif(v_account.cpf,''),v_meta->>'cpf',''),'[^0-9]','','g');
 if v_cpf='' then return jsonb_build_object('status','needs_cpf'); end if;
 if not public.artvideo_valid_cpf_v1(v_cpf) then return jsonb_build_object('status','invalid_cpf'); end if;
 v_phone:=nullif(regexp_replace(coalesce(p_phone,v_account.phone,v_meta->>'phone',''),'[^0-9]','','g'),'');
 if v_phone is not null and length(v_phone) not between 10 and 13 then
   return jsonb_build_object('status','invalid_phone');
 end if;
 -- Prevent concurrent creation/linkage of the same CPF.
 perform pg_advisory_xact_lock(hashtextextended(v_org::text||':cpf:'||v_cpf,0));

 select count(*) into v_matches from public.entities e
 where e.organization_id=v_org and regexp_replace(coalesce(e.document,''),'[^0-9]','','g')=v_cpf;

 if v_matches>1 then
   v_status:='pending_review'; v_reason:='multiple_matches';
 elsif v_matches=1 then
   select e.* into v_candidate from public.entities e
   where e.organization_id=v_org and regexp_replace(coalesce(e.document,''),'[^0-9]','','g')=v_cpf
   limit 1;
   v_entity:=v_candidate.id;
   if public.artvideo_first_name_key_v1(v_name)<>public.artvideo_first_name_key_v1(v_candidate.name) then
     v_status:='pending_review'; v_reason:='name_mismatch';
   elsif not v_candidate.is_active or not exists(
     select 1 from public.entity_roles r where r.entity_id=v_entity and r.role='customer' and r.is_active
   ) then
     v_status:='pending_review'; v_reason:='inactive_or_not_customer';
   elsif v_candidate.email is not null and nullif(btrim(v_candidate.email),'') is not null
         and lower(btrim(v_candidate.email))<>v_email then
     v_status:='pending_review'; v_reason:='email_mismatch';
   elsif exists(select 1 from public.artvideo_customer_accounts a
                where a.entity_id=v_entity and a.user_id<>v_uid) then
     v_status:='pending_review'; v_reason:='already_linked';
   else
     v_status:='matched';
   end if;
 else
   -- Refuse to create another CRM entry when a different CPF already owns this email.
   if exists(select 1 from public.entities e
     where e.organization_id=v_org and lower(btrim(e.email))=v_email
       and coalesce(regexp_replace(e.document,'[^0-9]','','g'),'')<>v_cpf) then
     v_status:='pending_review'; v_reason:='email_conflict';
   else
     -- New verified site signups create one normal CRM customer with source Site.
     v_entity:=gen_random_uuid();
     insert into public.customers
       (id,organization_id,customer_type,full_name,document,email,phone,whatsapp)
     values(v_entity,v_org,'PF',v_name,v_cpf,v_email,v_phone,v_phone);
     update public.entities set registration_source='site'
       where id=v_entity and organization_id=v_org;
     v_status:='created';
   end if;
 end if;

 if v_status='pending_review' then
   insert into public.artvideo_customer_accounts
    (user_id,organization_id,entity_id,review_entity_id,review_reason,cpf,full_name,phone,link_status)
   values(v_uid,v_org,null,v_entity,v_reason,v_cpf,v_name,v_phone,v_status)
   on conflict(user_id) do update
     set entity_id=null,review_entity_id=excluded.review_entity_id,review_reason=excluded.review_reason,
       cpf=excluded.cpf,full_name=excluded.full_name,phone=excluded.phone,
       link_status=excluded.link_status,updated_at=now();
 else
   insert into public.artvideo_customer_accounts
    (user_id,organization_id,entity_id,review_entity_id,review_reason,cpf,full_name,phone,link_status)
   values(v_uid,v_org,v_entity,null,null,v_cpf,v_name,v_phone,v_status)
   on conflict(user_id) do update
     set entity_id=excluded.entity_id,review_entity_id=null,review_reason=null,
       cpf=excluded.cpf,full_name=excluded.full_name,phone=excluded.phone,
       link_status=excluded.link_status,updated_at=now();
 end if;
 return jsonb_build_object('status','linked','match_status',v_status);
end $$;

-- The old two-argument endpoint must not bypass the CPF requirement.
create or replace function public.artvideo_customer_activate_v1(
  p_full_name text default null,p_phone text default null)
returns jsonb language sql security definer set search_path=''
as $$ select public.artvideo_customer_activate_v2(p_full_name,p_phone,null); $$;

-- Preserve site-only portal access; add review status without any CRM fields.
create or replace function public.artvideo_customer_link_status_v1()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();v_org uuid;v_status text;v_cpf text;
begin
 if v_uid is null then raise exception 'Sessao nao autenticada.' using errcode='42501'; end if;
 v_org:=public.artvideo_organization_id();
 select a.link_status into v_status from public.artvideo_customer_accounts a
 where a.user_id=v_uid and a.organization_id=v_org;
 return jsonb_build_object('status',coalesce(v_status,'needs_cpf'));
end $$;

create or replace function public.artvideo_customer_link_reviews_v1()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_org uuid; v_result jsonb;
begin
 if auth.uid() is null then raise exception 'Acesso negado.' using errcode='42501'; end if;
 v_org:=public.artvideo_organization_id();
 if not exists(select 1 from public.my_organization_permissions(v_org) p
               where p.permission_key='customers.view') then
   raise exception 'Sem permissao de visualizar cadastros.' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb)
 into v_result from (
  select a.user_id,a.full_name,a.cpf,a.review_reason,a.created_at,
         u.email as site_email,e.id as candidate_id,e.name as candidate_name,
         e.email as candidate_email
  from public.artvideo_customer_accounts a
  join auth.users u on u.id=a.user_id
  left join public.entities e on e.id=a.review_entity_id and e.organization_id=a.organization_id
  where a.organization_id=v_org and a.link_status='pending_review'
  order by a.created_at desc limit 100
 ) t;
 return v_result;
end $$;

create or replace function public.artvideo_customer_link_review_decide_v1(
 p_user_id uuid,p_approve boolean)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_org uuid;v_account public.artvideo_customer_accounts%rowtype;
 v_candidate public.entities%rowtype;
begin
 if auth.uid() is null then raise exception 'Acesso negado.' using errcode='42501'; end if;
 v_org:=public.artvideo_organization_id();
 if not exists(select 1 from public.my_organization_permissions(v_org) p
               where p.permission_key in ('customers.edit','customers.update')) then
   raise exception 'Sem permissao para revisar vinculos.' using errcode='42501';
 end if;
 select * into v_account from public.artvideo_customer_accounts a
 where a.user_id=p_user_id and a.organization_id=v_org and a.link_status='pending_review'
 for update;
 if not found then raise exception 'Solicitacao nao encontrada ou ja analisada.'; end if;

 if p_approve then
   if v_account.review_entity_id is null then
      raise exception 'Sem cadastro candidato. Requer correcao manual no CRM.';
   end if;
   select * into v_candidate from public.entities e
   where e.id=v_account.review_entity_id and e.organization_id=v_org and e.is_active
     and regexp_replace(coalesce(e.document,''),'[^0-9]','','g')=v_account.cpf;
   if not found or not exists(
      select 1 from public.entity_roles r
      where r.entity_id=v_candidate.id and r.role='customer' and r.is_active
   ) then raise exception 'Cadastro alterado ou inativo. Verifique antes de aprovar.'; end if;
   if exists(select 1 from public.artvideo_customer_accounts a
     where a.entity_id=v_candidate.id and a.user_id<>p_user_id) then
     raise exception 'Cadastro ja vinculado a outra conta.'; end if;
   update public.artvideo_customer_accounts
   set entity_id=v_candidate.id,link_status='approved',
       review_reason=null,reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now()
   where user_id=p_user_id and organization_id=v_org;
 else
   update public.artvideo_customer_accounts
   set entity_id=null,link_status='rejected',
       reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now()
   where user_id=p_user_id and organization_id=v_org;
 end if;
 return jsonb_build_object('status',case when p_approve then 'approved' else 'rejected' end);
end $$;

revoke all on function public.artvideo_customer_activate_v2(text,text,text) from public,anon;
revoke all on function public.artvideo_customer_activate_v1(text,text) from public,anon;
revoke all on function public.artvideo_customer_link_status_v1() from public,anon;
revoke all on function public.artvideo_customer_link_reviews_v1() from public,anon;
revoke all on function public.artvideo_customer_link_review_decide_v1(uuid,boolean) from public,anon;
grant execute on function public.artvideo_customer_activate_v2(text,text,text) to authenticated;
grant execute on function public.artvideo_customer_activate_v1(text,text) to authenticated;
grant execute on function public.artvideo_customer_link_status_v1() to authenticated;
grant execute on function public.artvideo_customer_link_reviews_v1() to authenticated;
grant execute on function public.artvideo_customer_link_review_decide_v1(uuid,boolean) to authenticated;
