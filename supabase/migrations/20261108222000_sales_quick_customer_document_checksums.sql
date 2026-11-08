begin;
-- Validação obrigatória também no servidor, evitando contornar o formulário do navegador.
create or replace function private.sales_document_valid_v1(p_document text,p_type text)
returns boolean language plpgsql immutable security invoker set search_path='' as $function$
declare
 v_doc text:=regexp_replace(coalesce(p_document,''),'[^0-9]','','g');
 v_i int;v_sum int;v_digit int;v_weights int[];
begin
 if p_type='PF' then
   if length(v_doc)<>11 or length(replace(v_doc,substr(v_doc,1,1),''))=0 then return false; end if;
   v_sum:=0;
   for v_i in 1..9 loop
     v_sum:=v_sum+substr(v_doc,v_i,1)::int*(11-v_i);
   end loop;
   v_digit:=mod(v_sum*10,11);
   if v_digit=10 then v_digit:=0; end if;
   if v_digit<>substr(v_doc,10,1)::int then return false; end if;
   v_sum:=0;
   for v_i in 1..10 loop
     v_sum:=v_sum+substr(v_doc,v_i,1)::int*(12-v_i);
   end loop;
   v_digit:=mod(v_sum*10,11);
   if v_digit=10 then v_digit:=0; end if;
   return v_digit=substr(v_doc,11,1)::int;
 elsif p_type='PJ' then
   if length(v_doc)<>14 or length(replace(v_doc,substr(v_doc,1,1),''))=0 then return false; end if;
   v_weights:=array[5,4,3,2,9,8,7,6,5,4,3,2];
   v_sum:=0;
   for v_i in 1..12 loop v_sum:=v_sum+substr(v_doc,v_i,1)::int*v_weights[v_i]; end loop;
   v_digit:=case when mod(v_sum,11)<2 then 0 else 11-mod(v_sum,11) end;
   if v_digit<>substr(v_doc,13,1)::int then return false; end if;
   v_weights:=array[6,5,4,3,2,9,8,7,6,5,4,3,2];
   v_sum:=0;
   for v_i in 1..13 loop v_sum:=v_sum+substr(v_doc,v_i,1)::int*v_weights[v_i]; end loop;
   v_digit:=case when mod(v_sum,11)<2 then 0 else 11-mod(v_sum,11) end;
   return v_digit=substr(v_doc,14,1)::int;
 end if;
 return false;
end;$function$;

create or replace function public.create_sales_quick_customer_v1(
 p_organization_id uuid,p_payload jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare
 v_actor uuid:=auth.uid();
 v_type text:=coalesce(nullif(upper(btrim(p_payload->>'customer_type')),''),'PF');
 v_name text:=left(btrim(coalesce(p_payload->>'name','')),180);
 v_document text:=regexp_replace(coalesce(p_payload->>'document',''),'[^0-9]','','g');
 v_phone text:=regexp_replace(coalesce(p_payload->>'whatsapp',''),'[^0-9]','','g');
 v_email text:=nullif(left(btrim(coalesce(p_payload->>'email','')),160),'');
 v_address jsonb:=coalesce(p_payload->'address','{}'::jsonb);
 v_zip text:=regexp_replace(coalesce(v_address->>'zip_code',''),'[^0-9]','','g');
 v_street text:=left(btrim(coalesce(v_address->>'street','')),180);
 v_number text:=left(btrim(coalesce(v_address->>'number','')),20);
 v_neighborhood text:=left(btrim(coalesce(v_address->>'neighborhood','')),100);
 v_city text:=left(btrim(coalesce(v_address->>'city','')),100);
 v_state text:=upper(left(btrim(coalesce(v_address->>'state','')),2));
 v_customer public.customers%rowtype;
begin
 if v_actor is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.quick_customer')
 then raise exception 'Sem permissão para cadastrar cliente comercialmente.' using errcode='42501'; end if;
 if v_type not in ('PF','PJ') or length(v_name)<3 then
   raise exception 'Informe nome e tipo do cliente.' using errcode='22023'; end if;
 if (v_type='PF' and length(v_document)<>11) or (v_type='PJ' and length(v_document)<>14) then
   raise exception 'Documento deve ser CPF ou CNPJ válido para o tipo selecionado.' using errcode='22023'; end if;
 if not private.sales_document_valid_v1(v_document,v_type) then
   raise exception 'CPF ou CNPJ não passou na validação dos dígitos verificadores.' using errcode='22023'; end if;
 if length(v_phone) not between 10 and 13 then
   raise exception 'Informe WhatsApp com DDD.' using errcode='22023'; end if;
 if length(v_zip)<>8 or length(v_street)<3 or length(v_number)<1 or
   length(v_neighborhood)<2 or length(v_city)<2 or length(v_state)<>2 then
   raise exception 'Preencha CEP, rua, número, bairro, cidade e UF.' using errcode='22023'; end if;
 if v_email is not null and (v_email not like '%@%.%' or length(v_email)>160) then
   raise exception 'E-mail inválido.' using errcode='22023'; end if;
 -- Lock serial por CPF/WhatsApp/empresa evita duplicidade em cadastros simultâneos.
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||v_document,0));
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':whatsapp:'||v_phone,0));
 if exists(select 1 from public.customers c where c.organization_id=p_organization_id
   and regexp_replace(coalesce(c.document,c.cnpj,''),'[^0-9]','','g')=v_document) then
   raise exception 'Já existe cliente com este CPF/CNPJ.' using errcode='23505'; end if;
 if exists(select 1 from public.customers c where c.organization_id=p_organization_id
   and private.normalize_uniq_phone(c.whatsapp)=private.normalize_uniq_phone(v_phone)) then
   raise exception 'WhatsApp já cadastrado em outro cliente.' using errcode='23505'; end if;
 insert into public.customers(
   organization_id,full_name,document,cnpj,customer_type,whatsapp,phone,email
 ) values(
   p_organization_id,v_name,
   case when v_type='PF' then v_document else null end,
   case when v_type='PJ' then v_document else null end,
   v_type,v_phone,v_phone,v_email
 ) returning * into v_customer;
 insert into public.customer_addresses(
   organization_id,customer_id,zip_code,street,number,complement,
   neighborhood,city,state,reference,is_default
 ) values(
   p_organization_id,v_customer.id,v_zip,v_street,v_number,
   nullif(left(btrim(coalesce(v_address->>'complement','')),120),''),
   v_neighborhood,v_city,v_state,
   nullif(left(btrim(coalesce(v_address->>'reference','')),180),''),true
 );
 return jsonb_build_object('id',v_customer.id,'name',v_name,
    'document',v_document,'whatsapp',v_phone,'phone',v_phone);
end;$function$;
revoke all on function public.create_sales_quick_customer_v1(uuid,jsonb) from public,anon;
grant execute on function public.create_sales_quick_customer_v1(uuid,jsonb) to authenticated;
commit;
