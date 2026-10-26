-- PostgreSQL nao fornece min(uuid): converta para texto antes de ordenar.
CREATE OR REPLACE FUNCTION public.artvideo_customer_activate_v1(p_full_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_uid uuid:=auth.uid(); v_email text; v_confirmed timestamptz; v_meta jsonb;
 v_org uuid; v_entity uuid; v_customer uuid; v_count integer; v_name text; v_phone text;
begin
 if v_uid is null then raise exception 'Sessao nao autenticada.' using errcode='42501'; end if;
 select lower(btrim(u.email)),u.email_confirmed_at,u.raw_user_meta_data
 into v_email,v_confirmed,v_meta from auth.users u where u.id=v_uid;
 if v_email is null or v_confirmed is null then return jsonb_build_object('status','verify_email'); end if;
 v_org:=public.artvideo_organization_id();
 if v_org is null then raise exception 'Loja indisponivel.'; end if;
 select a.entity_id into v_entity from public.artvideo_customer_accounts a where a.user_id=v_uid and a.organization_id=v_org;
 if v_entity is not null then return jsonb_build_object('status','linked'); end if;
 perform pg_advisory_xact_lock(hashtextextended(v_org::text||':site:'||v_email,0));
 select count(*),min(e.id::text)::uuid into v_count,v_entity from public.entities e
 where e.organization_id=v_org and lower(btrim(e.email))=v_email;
 if v_count>1 then return jsonb_build_object('status','needs_review'); end if;
 if v_count=1 then
  if not exists(select 1 from public.entities e join public.entity_roles r on r.entity_id=e.id
    where e.id=v_entity and e.organization_id=v_org and e.is_active and r.role='customer' and r.is_active)
    then return jsonb_build_object('status','needs_review'); end if;
  if exists(select 1 from public.artvideo_customer_accounts a where a.entity_id=v_entity)
    then return jsonb_build_object('status','needs_review'); end if;
 else
  v_name:=left(btrim(coalesce(nullif(p_full_name,''),v_meta->>'full_name','')),120);
  if length(v_name)<3 then return jsonb_build_object('status','needs_name'); end if;
  v_phone:=nullif(regexp_replace(coalesce(p_phone,v_meta->>'phone',''),'[^0-9]','','g'),'');
  if v_phone is not null and length(v_phone) not between 10 and 13 then return jsonb_build_object('status','invalid_phone'); end if;
  v_customer:=gen_random_uuid();
  insert into public.customers(id,organization_id,customer_type,full_name,email,phone,whatsapp)
   values(v_customer,v_org,'PF',v_name,v_email,v_phone,v_phone);
  v_entity:=v_customer;
  update public.entities set registration_source='site' where id=v_entity and organization_id=v_org;
 end if;
 insert into public.artvideo_customer_accounts(user_id,organization_id,entity_id) values(v_uid,v_org,v_entity);
 return jsonb_build_object('status','linked');
exception when unique_violation then return jsonb_build_object('status','needs_review');
end $function$;