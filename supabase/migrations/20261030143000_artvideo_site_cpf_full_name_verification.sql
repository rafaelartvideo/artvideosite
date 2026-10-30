-- Site Artvideo: prova privada de CPF/nome, desligada até a chave APICPF_SITE_API_KEY estar configurada.
CREATE TABLE IF NOT EXISTS private.artvideo_site_cpf_config (
  id smallint PRIMARY KEY CHECK(id=1),
  enabled boolean NOT NULL DEFAULT false,
  enabled_at timestamptz
);
INSERT INTO private.artvideo_site_cpf_config(id,enabled) VALUES (1,false)
ON CONFLICT(id) DO NOTHING;
REVOKE ALL ON private.artvideo_site_cpf_config FROM PUBLIC, anon, authenticated;
ALTER TABLE private.artvideo_site_cpf_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS private.artvideo_site_cpf_tickets (
  token uuid PRIMARY KEY,
  identity_digest text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamptz
);
CREATE INDEX IF NOT EXISTS artvideo_site_cpf_tickets_expires_idx
  ON private.artvideo_site_cpf_tickets(expires_at);
REVOKE ALL ON private.artvideo_site_cpf_tickets FROM PUBLIC, anon, authenticated;
ALTER TABLE private.artvideo_site_cpf_tickets ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.artvideo_site_cpf_enforcement_v1()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
 SELECT COALESCE((SELECT enabled FROM private.artvideo_site_cpf_config WHERE id=1),false);
$fn$;

CREATE OR REPLACE FUNCTION private.artvideo_site_full_name_key_v1(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = ''
AS $fn$
 SELECT translate(
  lower(btrim(regexp_replace(coalesce(p_name,''),'[[:space:]]+',' ','g'))),
  'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
  'aaaaaaeeeeiiiiooooouuuucnyy'
 );
$fn$;

CREATE OR REPLACE FUNCTION private.artvideo_site_identity_digest_v1(p_token uuid,p_cpf text,p_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = ''
AS $fn$
 SELECT encode(extensions.digest(convert_to(
     p_token::text || ':' || regexp_replace(coalesce(p_cpf,''),'[^0-9]','','g') || ':' ||
     private.artvideo_site_full_name_key_v1(p_name),
     'UTF8'), 'sha256'), 'hex');
$fn$;

CREATE OR REPLACE FUNCTION public.artvideo_site_cpf_issue_v1(
  p_cpf text,p_name text,p_provider_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_name text := private.artvideo_site_full_name_key_v1(p_name);
  v_provider text := private.artvideo_site_full_name_key_v1(p_provider_name);
  v_token uuid := gen_random_uuid();
BEGIN
  IF NOT public.artvideo_site_cpf_enforcement_v1() THEN
    RETURN jsonb_build_object('required',false);
  END IF;
  IF NOT public.artvideo_valid_cpf_v1(p_cpf) OR length(v_name)<5
    OR position(' ' in v_name)=0 OR v_name<>v_provider
  THEN
    RETURN jsonb_build_object('required',true,'verified',false);
  END IF;
  INSERT INTO private.artvideo_site_cpf_tickets(token,identity_digest,expires_at)
    VALUES(v_token,private.artvideo_site_identity_digest_v1(v_token,p_cpf,p_name),now()+interval '7 days');
  RETURN jsonb_build_object('required',true,'verified',true,'ticket',v_token::text);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.artvideo_site_cpf_check_v1(p_token text,p_cpf text,p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
 SELECT COALESCE(
    p_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1 FROM private.artvideo_site_cpf_tickets t
      WHERE t.token = CASE WHEN p_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         THEN p_token::uuid ELSE '00000000-0000-0000-0000-000000000000'::uuid END
        AND t.identity_digest=private.artvideo_site_identity_digest_v1(t.token,p_cpf,p_name)
        AND t.expires_at > now() AND t.used_at IS NULL
    ),false
 );
$fn$;

CREATE OR REPLACE FUNCTION public.artvideo_site_cpf_consume_v1(
  p_token text,p_cpf text,p_name text,p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_used uuid;
BEGIN
  IF p_token IS NULL OR p_user_id IS NULL OR
    p_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN RETURN false; END IF;
  UPDATE private.artvideo_site_cpf_tickets t
     SET used_by=p_user_id,used_at=now()
   WHERE t.token=p_token::uuid AND t.used_at IS NULL AND t.expires_at>now()
     AND t.identity_digest=private.artvideo_site_identity_digest_v1(t.token,p_cpf,p_name)
  RETURNING t.token INTO v_used;
  RETURN v_used IS NOT NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.artvideo_site_cpf_enforcement_v1() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.artvideo_site_cpf_issue_v1(text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.artvideo_site_cpf_check_v1(text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.artvideo_site_cpf_consume_v1(text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.artvideo_site_cpf_enforcement_v1() TO service_role;
GRANT EXECUTE ON FUNCTION public.artvideo_site_cpf_issue_v1(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.artvideo_site_cpf_check_v1(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.artvideo_site_cpf_consume_v1(text,text,text,uuid) TO service_role;

-- Preserve live CPF/first-name CRM linkage and only add proof enforcement to new accounts.
CREATE OR REPLACE FUNCTION public.artvideo_customer_activate_v2(p_full_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_cpf text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_uid uuid:=auth.uid(); v_org uuid; v_email text; v_confirmed timestamptz; v_meta jsonb;
 v_cpf text; v_name text; v_phone text; v_account public.artvideo_customer_accounts%rowtype;
 v_matches integer; v_candidate public.entities%rowtype; v_entity uuid;
 v_reason text; v_status text;
 v_created_at timestamptz; v_existing_account boolean := false;
begin
 if v_uid is null then raise exception 'Sessao nao autenticada.' using errcode='42501'; end if;
 select lower(btrim(u.email)),u.email_confirmed_at,u.raw_user_meta_data,u.created_at
 into v_email,v_confirmed,v_meta,v_created_at from auth.users u where u.id=v_uid;
 if v_email is null or v_confirmed is null then return jsonb_build_object('status','verify_email'); end if;
 v_org:=public.artvideo_organization_id();
 if v_org is null then raise exception 'Loja indisponivel.'; end if;

 select a.* into v_account from public.artvideo_customer_accounts a
 where a.user_id=v_uid for update;
 v_existing_account := found;
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

 -- A conta já existente continua funcionando; contas novas após a ativação
 -- precisam de comprovante de nome completo/CPF validado no servidor.
 if not v_existing_account
    and public.artvideo_site_cpf_enforcement_v1()
    and v_created_at >= (select enabled_at from private.artvideo_site_cpf_config where id=1)
    and not public.artvideo_site_cpf_consume_v1(v_meta->>'site_cpf_ticket',v_cpf,v_name,v_uid)
 then
   return jsonb_build_object('status','cpf_verification_required');
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
   elsif exists(select 1 from public.artvideo_customer_accounts a
                where a.entity_id=v_entity and a.user_id<>v_uid) then
     v_status:='pending_review'; v_reason:='already_linked';
   else
     v_status:='matched';
   end if;
 else
   -- Email is a login and contact address only. The CRM match is CPF + first name.
   v_entity:=gen_random_uuid();
   insert into public.customers
     (id,organization_id,customer_type,full_name,document,email,phone,whatsapp)
   values(v_entity,v_org,'PF',v_name,v_cpf,
      case when v_email like 'cliente-%@auth.unionworld.app' then null else v_email end,
      v_phone,v_phone);
   update public.entities set registration_source='site'
     where id=v_entity and organization_id=v_org;
   v_status:='created';
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
end $function$
;
