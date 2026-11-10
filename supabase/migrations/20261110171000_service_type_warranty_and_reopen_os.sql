-- Fluxos independentes: retorno R1 somente para tipos com orcamento e garantia;
-- OS comuns usam Reabrir OS (novo numero, fotos/dados, nunca replica valores/pagamentos).
alter table public.service_types
  add column if not exists generates_warranty boolean not null default false;

-- Preserva o comportamento dos tipos que ja eram de orcamento; nao cria novos
-- certificados em tipos que nao possuem o fluxo de orcamento.
update public.service_types
set generates_warranty = quote_workflow_enabled
where generates_warranty is distinct from quote_workflow_enabled;

create or replace function private.normalize_service_type_warranty()
returns trigger language plpgsql set search_path to ''
as $fn$
begin
  if not new.quote_workflow_enabled then
    new.generates_warranty := false;
  end if;
  return new;
end;
$fn$;
drop trigger if exists service_types_normalize_warranty on public.service_types;
create trigger service_types_normalize_warranty
before insert or update of quote_workflow_enabled, generates_warranty
on public.service_types for each row
execute function private.normalize_service_type_warranty();

alter table public.service_types
  drop constraint if exists service_types_warranty_requires_quote;
alter table public.service_types
  add constraint service_types_warranty_requires_quote
  check (not generates_warranty or quote_workflow_enabled);


CREATE OR REPLACE FUNCTION public.load_service_types_configuration_v1(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_can_operational_read boolean;
  v_can_types boolean;
  v_can_situations boolean;
  v_can_monitoring boolean;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  v_can_operational_read := private.can_read_order_operational_config(
    p_organization_id
  );

  v_can_types := v_can_operational_read
    or private.can_manage_own_operation_config(
      p_organization_id,
      'service_types',
      'service_types.view'
    );

  if not v_can_types then
    raise exception 'Sem permissão para consultar tipos de atendimento.' using errcode = '42501';
  end if;

  v_can_situations := v_can_operational_read
    or private.can_manage_own_operation_config(
      p_organization_id,
      'order_situations',
      'situations.view'
    );

  v_can_monitoring := private.is_organization_member(p_organization_id)
    or private.has_platform_permission('orders.monitor.view')
    or private.has_platform_permission('orders.monitor.manage');

  return jsonb_build_object(
    'serviceTypes',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'title', item.title,
          'description', item.description,
          'forecast_days', item.forecast_days,
          'quote_workflow_enabled', item.quote_workflow_enabled,
          'generates_warranty', item.generates_warranty,
          'is_active', item.is_active,
          'sort_order', item.sort_order,
          'created_at', item.created_at,
          'updated_at', item.updated_at,
          'organization_id', item.organization_id
        )
        order by item.sort_order, item.title
      )
      from public.service_types item
      where item.organization_id = p_organization_id
    ), '[]'::jsonb),
    'situations',
    case when v_can_situations then
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', item.id,
            'name', item.name,
            'color', item.color,
            'hours', item.hours,
            'sort_order', item.sort_order,
            'is_active', item.is_active,
            'organization_id', item.organization_id
          )
          order by item.sort_order, item.name
        )
        from public.os_situations item
        where item.organization_id = p_organization_id
          and item.is_active
      ), '[]'::jsonb)
    else '[]'::jsonb end,
    'links',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'service_type_id', item.service_type_id,
          'situation_id', item.situation_id,
          'use_default_hours', item.use_default_hours,
          'sla_hours', item.sla_hours,
          'sort_order', item.sort_order,
          'organization_id', item.organization_id
        )
        order by item.service_type_id, item.sort_order, item.situation_id
      )
      from public.service_type_situations item
      where item.organization_id = p_organization_id
    ), '[]'::jsonb),
    'monitoredServiceTypeIds',
    case when v_can_monitoring then
      coalesce((
        select jsonb_agg(item.service_type_id order by item.service_type_id)
        from public.service_type_monitoring item
        where item.organization_id = p_organization_id
      ), '[]'::jsonb)
    else '[]'::jsonb end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.issue_service_order_warranty_v1(p_organization_id uuid, p_service_order_id uuid, p_warranty_option_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_os public.service_orders%rowtype;
  v_option public.equipment_warranty_options%rowtype;
  v_label text;
  v_days int;
  v_begin date;
  v_customer jsonb;
  v_customer_address public.customer_addresses%rowtype;
  v_brand text;
  v_model text;
  v_equipment text;
  v_service text;
  v_org text;
  v_record public.service_order_warranty_certificates%rowtype;
begin
 if auth.uid() is null or not private.has_effective_organization_permission(p_organization_id,'orders.complete')
 then raise exception 'Sem permissão para emitir certificado.' using errcode='42501'; end if;
 select * into v_record from public.service_order_warranty_certificates
 where organization_id=p_organization_id and service_order_id=p_service_order_id;
 if found then return to_jsonb(v_record); end if;
 select * into v_os from public.service_orders
 where id=p_service_order_id and organization_id=p_organization_id for update;
 if not found or v_os.completed_at is null or v_os.cancelled_at is not null
 then raise exception 'O certificado só pode ser emitido após concluir a OS.' using errcode='22023'; end if;
 if not exists (
    select 1 from public.service_types st
      where st.id=v_os.service_type_id and st.organization_id=p_organization_id
        and st.quote_workflow_enabled and st.generates_warranty
 ) then
   raise exception 'Este tipo de atendimento nao emite garantia. Ajuste a configuracao do tipo de atendimento.'
      using errcode='23514';
 end if;
 if p_warranty_option_id is not null then
   select * into v_option from public.equipment_warranty_options w
   where w.id=p_warranty_option_id and w.organization_id=p_organization_id
     and w.equipment_type_id=v_os.equipment_type_id;
   if not found then raise exception 'Garantia não corresponde ao equipamento desta OS.' using errcode='22023'; end if;
 else
   select * into v_option from public.equipment_warranty_options w
   where w.organization_id=p_organization_id and w.equipment_type_id=v_os.equipment_type_id
   order by w.is_default desc,w.sort_order asc limit 1;
 end if;
 v_days:=coalesce(v_option.warranty_days,90);
 v_label:=coalesce(v_option.label,'Garantia do serviço');
 v_begin:=(v_os.completed_at at time zone 'America/Sao_Paulo')::date;
 select to_jsonb(c) into v_customer from public.customers c
   where c.id=v_os.customer_id and c.organization_id=p_organization_id;
 select a.* into v_customer_address from public.customer_addresses a
   where a.customer_id=v_os.customer_id and a.organization_id=p_organization_id
   order by a.is_default desc, a.created_at desc limit 1;
 select name into v_brand from public.equipment_brands
   where id=v_os.equipment_brand_id and organization_id=p_organization_id;
 select name into v_model from public.equipment_models
   where id=v_os.equipment_model_id and organization_id=p_organization_id;
 select name into v_equipment from public.equipment_types
   where id=v_os.equipment_type_id and organization_id=p_organization_id;
 select name into v_service from public.general_services
   where id=v_os.general_service_id and organization_id=p_organization_id;
 select name into v_org from public.organizations where id=p_organization_id and status='active';
 if v_org is null then raise exception 'Empresa inválida.' using errcode='23503'; end if;
 insert into public.service_order_warranty_certificates (
  organization_id,service_order_id,equipment_type_id,warranty_option_label,warranty_days,starts_at,expires_at,issued_by,snapshot
 ) values (
  p_organization_id,p_service_order_id,v_os.equipment_type_id,v_label,v_days,v_begin,v_begin+v_days,auth.uid(),
  jsonb_build_object(
    'organization_name',v_org,'os_number',v_os.os_number,
    'customer_name',coalesce(v_customer->>'trade_name',v_customer->>'full_name','Cliente'),
    'customer_document',coalesce(nullif(v_customer->>'cnpj',''),v_customer->>'document'),
    'customer_phone',coalesce(nullif(v_customer->>'whatsapp',''),v_customer->>'phone'),
    'customer_city',coalesce(nullif(btrim(v_os.service_city),''),nullif(btrim(v_customer_address.city),'')),
    'customer_state',coalesce(nullif(btrim(v_os.service_state),''),nullif(btrim(v_customer_address.state),'')),
    'equipment_name',coalesce(v_equipment,'Equipamento'),'equipment_brand',coalesce(v_brand,''),
    'equipment_model',coalesce(v_model,v_os.model,''),'serial_number',v_os.serial_number,
    'accessories',v_os.accessories,'solution',coalesce(nullif(trim(v_os.solution),''),nullif(v_service,''),'Serviço descrito na Ordem de Serviço')
  )
 ) on conflict (organization_id,service_order_id) do nothing
 returning * into v_record;
 if v_record.id is null then
   select * into v_record from public.service_order_warranty_certificates
   where organization_id=p_organization_id and service_order_id=p_service_order_id;
 end if;
 return to_jsonb(v_record);
end $function$;

CREATE OR REPLACE FUNCTION public.check_service_order_return_eligibility_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_order public.service_orders%rowtype;
  v_root_id uuid;
  v_certificate public.service_order_warranty_certificates%rowtype;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_active_id uuid;
begin
  if auth.uid() is null then raise exception 'Sessao nao autenticada.' using errcode='42501'; end if;
  select * into v_order from public.service_orders where id=p_order_id;
  if not found then raise exception 'OS nao encontrada ou sem acesso.' using errcode='42501'; end if;
  if not private.is_organization_member(v_order.organization_id)
      or not private.has_effective_organization_permission(v_order.organization_id,'orders.create') then
    raise exception 'Sem permissao para iniciar atendimento nesta empresa.' using errcode='42501';
  end if;
  if v_order.completed_at is null or v_order.cancelled_at is not null then
    return jsonb_build_object('eligible',false,'reason','not_closed');
  end if;
  if not exists (
    select 1 from public.service_types st
    where st.id=v_order.service_type_id and st.organization_id=v_order.organization_id
      and st.quote_workflow_enabled
  ) then
    return jsonb_build_object('eligible',false,'reason','not_quote','os_number',v_order.os_number);
  end if;
  if not exists (
    select 1 from public.service_types st
    where st.id=v_order.service_type_id and st.organization_id=v_order.organization_id
      and st.generates_warranty
  ) then
    return jsonb_build_object('eligible',false,'reason','warranty_disabled','os_number',v_order.os_number);
  end if;
  v_root_id:=coalesce(v_order.return_root_id,v_order.id);
  select id into v_active_id from public.service_orders
   where organization_id=v_order.organization_id and return_root_id=v_root_id
     and completed_at is null and cancelled_at is null limit 1;
  if v_active_id is not null then
    return jsonb_build_object('eligible',false,'reason','active_return','active_order_id',v_active_id);
  end if;
  select * into v_certificate from public.service_order_warranty_certificates cert
    where cert.service_order_id=v_order.id and cert.organization_id=v_order.organization_id
    order by cert.expires_at desc,cert.issued_at desc limit 1;
  if not found then
    return jsonb_build_object('eligible',false,'reason','no_certificate','os_number',v_order.os_number);
  end if;
  return jsonb_build_object(
    'eligible',v_certificate.starts_at<=v_today and v_certificate.expires_at>=v_today,
    'reason',case when v_certificate.starts_at>v_today then 'not_started'
                  when v_certificate.expires_at<v_today then 'expired' else 'valid' end,
    'warranty_starts_at',v_certificate.starts_at,
    'warranty_expires_at',v_certificate.expires_at,
    'warranty_label',v_certificate.warranty_option_label,
    'os_number',v_order.os_number
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_service_order_return_v1(p_order_id uuid, p_reason text, p_classification text DEFAULT 'analysis'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_selected public.service_orders%rowtype;
 v_root public.service_orders%rowtype;
 v_id uuid; v_situation uuid;
begin
 if (select auth.uid()) is null then raise exception 'Sessao nao autenticada.' using errcode='42501'; end if;
 if nullif(btrim(coalesce(p_reason,'')),'') is null
    or length(btrim(p_reason)) < 5 or length(p_reason)>2000 then
   raise exception 'Descreva o motivo do retorno (5 a 2000 caracteres).' using errcode='23514';
 end if;
 if coalesce(p_classification,'analysis') <> 'analysis' then
   raise exception 'O retorno inicia sempre pelo diagnostico.' using errcode='23514';
 end if;
 select * into v_selected from public.service_orders where id=p_order_id;
 if not found then raise exception 'OS nao encontrada ou acesso negado.' using errcode='42501'; end if;
 select * into v_root from public.service_orders where id=coalesce(v_selected.return_root_id,v_selected.id);
 if not found or v_root.organization_id<>v_selected.organization_id then
   raise exception 'OS original indisponivel.' using errcode='42501';
 end if;
 if not private.has_effective_organization_permission(v_root.organization_id,'orders.create')
    or not private.is_organization_member(v_root.organization_id) then
   raise exception 'Sem permissao para iniciar retornos.' using errcode='42501';
 end if;
 if not exists (
   select 1 from public.service_types st
   where st.id=v_root.service_type_id and st.organization_id=v_root.organization_id
     and st.quote_workflow_enabled and st.generates_warranty
 ) then
   raise exception 'Retorno R1 disponivel somente para tipos com orcamento e garantia habilitada. Use Reabrir OS.'
     using errcode='23514';
 end if;
 if v_root.completed_at is null or v_root.cancelled_at is not null then
   raise exception 'Somente OS originais concluidas podem receber retornos.' using errcode='23514';
 end if;
 if v_selected.completed_at is null or v_selected.cancelled_at is not null then
   raise exception 'Conclua o atendimento atual antes de iniciar outro retorno.' using errcode='23514';
 end if;
 if not exists (
   select 1 from public.service_order_warranty_certificates c
    where c.service_order_id=v_selected.id and c.organization_id=v_selected.organization_id
      and c.starts_at <= (now() at time zone 'America/Sao_Paulo')::date
      and c.expires_at >= (now() at time zone 'America/Sao_Paulo')::date
 ) then
   raise exception 'Garantia vencida ou sem certificado. Abra uma nova OS.' using errcode='23514';
 end if;
 select s.id into v_situation
 from public.os_situations s
 where s.organization_id=v_root.organization_id and s.is_active
   and (
     v_root.service_type_id is null
     or not exists(select 1 from public.service_type_situations sts
        where sts.service_type_id=v_root.service_type_id and sts.organization_id=v_root.organization_id)
     or exists(select 1 from public.service_type_situations sts
        where sts.service_type_id=v_root.service_type_id and sts.organization_id=v_root.organization_id and sts.situation_id=s.id)
   )
 order by coalesce((select sts.sort_order from public.service_type_situations sts
   where sts.service_type_id=v_root.service_type_id and sts.organization_id=v_root.organization_id and sts.situation_id=s.id),s.sort_order),s.sort_order,s.id limit 1;
 if v_situation is null then raise exception 'Configure uma situacao inicial ativa para este atendimento.' using errcode='23514'; end if;

 insert into public.service_orders
 (organization_id,customer_id,service_id,status_id,situation_id,
  brand_id,product_id,model,serial_number,accessories,equipment_condition,loose_parts,
  priority,equipment_type_id,equipment_brand_id,equipment_model_id,customer_equipment_id,
  seller_id,technician_id,service_type_id,order_type,
  service_state,service_city,service_street,service_zip_code,service_neighborhood,
  service_number,service_complement,service_address_source,service_customer_address_id,
  order_rules_snapshot,custom_field_values,return_root_id,return_reason,return_classification,customer_notes)
 values
 (v_root.organization_id,v_root.customer_id,v_root.service_id,v_root.status_id,v_situation,
  v_root.brand_id,v_root.product_id,v_root.model,v_root.serial_number,v_root.accessories,
  v_root.equipment_condition,v_root.loose_parts,
  v_root.priority,v_root.equipment_type_id,v_root.equipment_brand_id,v_root.equipment_model_id,
  v_root.customer_equipment_id,
  v_root.seller_id,v_root.technician_id,v_root.service_type_id,v_root.order_type,
  v_root.service_state,v_root.service_city,v_root.service_street,v_root.service_zip_code,
  v_root.service_neighborhood,v_root.service_number,v_root.service_complement,
  v_root.service_address_source,v_root.service_customer_address_id,
  v_root.order_rules_snapshot,coalesce(v_root.custom_field_values,'{}'::jsonb),
  v_root.id,btrim(p_reason),p_classification,btrim(p_reason))
 returning id into v_id;
 return v_id;
exception when unique_violation then
 raise exception 'Ja existe um retorno ativo para esta OS. Atualize e abra o retorno existente.' using errcode='23505';
end;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_service_order_as_new_v1(p_order_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_source public.service_orders%rowtype;
  v_new_id uuid;
  v_situation uuid;
begin
  if auth.uid() is null then raise exception 'Sessao nao autenticada.' using errcode='42501'; end if;
  select * into v_source from public.service_orders where id=p_order_id for update;
  if not found or not private.can_view_service_order(p_order_id)
     or not private.is_organization_member(v_source.organization_id)
     or not private.has_effective_organization_permission(v_source.organization_id,'orders.create') then
    raise exception 'Sem permissao para duplicar esta OS.' using errcode='42501';
  end if;
  if v_source.completed_at is null or v_source.cancelled_at is not null then
    raise exception 'Somente OS concluidas podem originar outro atendimento.' using errcode='23514';
  end if;
  select s.id into v_situation from public.os_situations s
    where s.organization_id=v_source.organization_id and s.is_active
      and (v_source.service_type_id is null
          or not exists(select 1 from public.service_type_situations sts
              where sts.organization_id=v_source.organization_id and sts.service_type_id=v_source.service_type_id)
          or exists(select 1 from public.service_type_situations sts
              where sts.organization_id=v_source.organization_id and sts.service_type_id=v_source.service_type_id
                and sts.situation_id=s.id))
    order by coalesce((select sts.sort_order from public.service_type_situations sts
      where sts.service_type_id=v_source.service_type_id and sts.organization_id=v_source.organization_id
        and sts.situation_id=s.id),s.sort_order),s.sort_order,s.id limit 1;
  if v_situation is null then raise exception 'Configure uma situacao inicial ativa.' using errcode='23514'; end if;

  insert into public.service_orders
  (organization_id,customer_id,service_id,status_id,situation_id,
   brand_id,product_id,model,serial_number,accessories,equipment_condition,loose_parts,
   priority,equipment_type_id,equipment_brand_id,equipment_model_id,customer_equipment_id,
   seller_id,technician_id,service_type_id,order_type,
   service_state,service_city,service_street,service_zip_code,service_neighborhood,
   service_number,service_complement,service_address_source,service_customer_address_id,
   order_rules_snapshot,custom_field_values,customer_notes,internal_notes)
  values
  (v_source.organization_id,v_source.customer_id,v_source.service_id,v_source.status_id,v_situation,
   v_source.brand_id,v_source.product_id,v_source.model,v_source.serial_number,v_source.accessories,
   v_source.equipment_condition,v_source.loose_parts,v_source.priority,
   v_source.equipment_type_id,v_source.equipment_brand_id,v_source.equipment_model_id,v_source.customer_equipment_id,
   v_source.seller_id,v_source.technician_id,v_source.service_type_id,v_source.order_type,
   v_source.service_state,v_source.service_city,v_source.service_street,v_source.service_zip_code,
   v_source.service_neighborhood,v_source.service_number,v_source.service_complement,
   v_source.service_address_source,v_source.service_customer_address_id,
   v_source.order_rules_snapshot,coalesce(v_source.custom_field_values,'{}'::jsonb),
   v_source.customer_notes,
   concat_ws(E'\n',nullif(v_source.internal_notes,''),
     'Novo atendimento a partir da OS '||v_source.os_number||' (reabertura com novo numero).',
     case when nullif(v_source.diagnosis,'') is not null then 'Diagnostico anterior: '||v_source.diagnosis end,
     case when nullif(v_source.solution,'') is not null then 'Solucao anterior: '||v_source.solution end))
   returning id into v_new_id;

  insert into public.service_order_technical_values
  (service_order_id,organization_id,technical_field_id,field_key_snapshot,label_snapshot,
   field_type_snapshot,value_text,value_number)
  select v_new_id,v_source.organization_id,t.technical_field_id,t.field_key_snapshot,
    t.label_snapshot,t.field_type_snapshot,t.value_text,t.value_number
  from public.service_order_technical_values t
  where t.service_order_id=v_source.id and t.organization_id=v_source.organization_id;

  insert into public.service_order_media (service_order_id,organization_id,media_id,sort_order)
  select v_new_id,v_source.organization_id,old.media_id,old.sort_order
  from public.service_order_media old
  join public.media m on m.id=old.media_id and m.organization_id=v_source.organization_id
  where old.organization_id=v_source.organization_id and old.service_order_id=v_source.id
    and m.bucket_id='service-images';

  -- Copia as fotos de situacao/atendimento, sem comprovantes de pagamento ou anexos assinados.
  insert into public.service_order_situation_media
  (service_order_id,organization_id,situation_id,media_id,attachment_type_id,uploaded_by)
  select v_new_id,v_source.organization_id,null,sm.media_id,sm.attachment_type_id,auth.uid()
  from public.service_order_situation_media sm
  join public.media m on m.id=sm.media_id and m.organization_id=v_source.organization_id
  left join public.attachment_types a on a.id=sm.attachment_type_id and a.organization_id=v_source.organization_id
  where sm.organization_id=v_source.organization_id and sm.service_order_id=v_source.id
    and m.bucket_id='service-images' and m.mime_type like 'image/%'
    and coalesce(lower(btrim(a.name)),'') not in ('comprovante de pagamento','assinatura');

  -- Fotos do historico de orcamento continuam como referencia, sem reaproveitar proposta ou aprovacao.
  insert into public.service_order_quote_photos
  (organization_id,service_order_id,media_id,sort_order)
  select v_source.organization_id,v_new_id,q.media_id,q.sort_order
  from public.service_order_quote_photos q
  join public.media m on m.id=q.media_id and m.organization_id=v_source.organization_id
  where q.organization_id=v_source.organization_id and q.service_order_id=v_source.id
    and m.bucket_id='service-images' and m.mime_type like 'image/%';

  return v_new_id;
end;
$function$;
