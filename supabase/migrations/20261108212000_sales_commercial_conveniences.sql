begin;
insert into public.permissions(key,label,description,module_name,sort_order) values
 ('sales.payment_terms.manage','Administrar condições de pagamento','Cadastrar e manter condições padrão de vencimento e parcelamento.','Vendas — Configurações',2740),
 ('sales.reports.margin.view','Visualizar margem bruta','Acessar dados de custo e estimativas de margem das vendas.','Vendas — Gestão',2750)
on conflict(key) do update set label=excluded.label,description=excluded.description,
module_name=excluded.module_name,sort_order=excluded.sort_order;
insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,np.id
from public.role_permissions rp
join public.permissions old on old.id=rp.permission_id and old.key='sales.targets.manage'
join public.permissions np on np.key in ('sales.payment_terms.manage','sales.reports.margin.view')
on conflict(role_id,permission_id) do nothing;

-- Condições iniciais por empresa, sem modificar preferências já cadastradas.
insert into public.sales_payment_presets(organization_id,name,installment_count,first_due_days)
select m.organization_id,p.name,p.installments,p.days
from public.organization_modules m
cross join (values
 ('7 dias',1,7),('15 dias',1,15),('30 dias',1,30),
 ('2x mensal',2,30),('3x mensal',3,30),('6x mensal',6,30)
) p(name,installments,days)
where m.module_key='sales' and m.is_enabled
on conflict(organization_id,name) do nothing;

alter table public.sales_order_items add column if not exists unit_cost_snapshot numeric(14,4)
 check(unit_cost_snapshot is null or unit_cost_snapshot>=0);

create or replace function private.capture_sales_item_cost_v1()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
 if tg_op='INSERT' then
   select average_cost into new.unit_cost_snapshot
   from public.inventory_items
   where id=new.inventory_item_id and organization_id=new.organization_id;
 end if;
 return new;
end;$function$;
drop trigger if exists capture_sales_item_cost_v1 on public.sales_order_items;
create trigger capture_sales_item_cost_v1 before insert on public.sales_order_items
for each row execute function private.capture_sales_item_cost_v1();

-- Cadastro rápido respeita endereço e WhatsApp obrigatórios da Union.
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
 if length(v_phone) not between 10 and 13 then
   raise exception 'Informe WhatsApp com DDD.' using errcode='22023'; end if;
 if length(v_zip)<>8 or length(v_street)<3 or length(v_number)<1 or
   length(v_neighborhood)<2 or length(v_city)<2 or length(v_state)<>2 then
   raise exception 'Preencha CEP, rua, número, bairro, cidade e UF.' using errcode='22023'; end if;
 if v_email is not null and (v_email not like '%@%.%' or length(v_email)>160) then
   raise exception 'E-mail inválido.' using errcode='22023'; end if;
 -- Lock serial por CPF/WhatsApp/empresa evita duplicidade em cadastros simultâneos.
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'+v_document,0));
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

create or replace function public.list_sales_payment_presets_v1(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_items jsonb;
begin
 if auth.uid() is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.view')
 then raise exception 'Sem permissão para consultar condições de pagamento.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,
   'installment_count',installment_count,'first_due_days',first_due_days)
   order by installment_count,first_due_days,name),'[]'::jsonb) into v_items
 from public.sales_payment_presets
 where organization_id=p_organization_id and is_active;
 return v_items;
end;$function$;

create or replace function public.save_sales_payment_preset_v1(
 p_organization_id uuid,p_name text,p_installments integer,p_first_due_days integer,
 p_active boolean default true
) returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare v_id uuid;
begin
 if auth.uid() is null or not private.has_tenant_module_permission(
   p_organization_id,'sales','sales.payment_terms.manage')
 then raise exception 'Sem permissão para gerenciar condições de pagamento.' using errcode='42501'; end if;
 if length(btrim(coalesce(p_name,''))) not between 2 and 60 or
   p_installments not between 1 and 12 or p_first_due_days not between 0 and 365 then
   raise exception 'Condição de pagamento inválida.' using errcode='22023'; end if;
 insert into public.sales_payment_presets(organization_id,name,installment_count,first_due_days,is_active)
 values(p_organization_id,left(btrim(p_name),60),p_installments,p_first_due_days,coalesce(p_active,true))
 on conflict(organization_id,name) do update set
  installment_count=excluded.installment_count,first_due_days=excluded.first_due_days,
  is_active=excluded.is_active returning id into v_id;
 return jsonb_build_object('id',v_id,'saved',true);
end;$function$;

revoke all on function public.create_sales_quick_customer_v1(uuid,jsonb) from public,anon;
revoke all on function public.list_sales_payment_presets_v1(uuid) from public,anon;
revoke all on function public.save_sales_payment_preset_v1(uuid,text,integer,integer,boolean) from public,anon;
grant execute on function public.create_sales_quick_customer_v1(uuid,jsonb) to authenticated;
grant execute on function public.list_sales_payment_presets_v1(uuid) to authenticated;
grant execute on function public.save_sales_payment_preset_v1(uuid,text,integer,integer,boolean) to authenticated;
commit;