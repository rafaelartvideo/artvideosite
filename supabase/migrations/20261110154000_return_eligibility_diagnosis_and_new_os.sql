-- Verifica o certificado real da OS antes da abertura; usa data local (sem encurtar o dia final de garantia).
create or replace function public.check_service_order_return_eligibility_v1(p_order_id uuid)
returns jsonb language plpgsql security invoker set search_path to ''
as $elig$
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
$elig$;
revoke all on function public.check_service_order_return_eligibility_v1(uuid) from public,anon;
grant execute on function public.check_service_order_return_eligibility_v1(uuid) to authenticated;

-- Classificacao vem SOMENTE apos diagnostico: mesma peca coberta, outra peca requer orcamento.
create or replace function public.classify_service_order_return_v2(
  p_organization_id uuid, p_order_id uuid, p_damage_kind text, p_diagnosis text, p_solution text
) returns text language plpgsql security invoker set search_path to ''
as $classify$
declare
  v_order public.service_orders%rowtype;
  v_classification text;
begin
  if auth.uid() is null or not private.is_organization_member(p_organization_id)
    or not (private.has_effective_organization_permission(p_organization_id,'orders.edit')
        or private.has_effective_organization_permission(p_organization_id,'orders.update')) then
    raise exception 'Sem permissao para registrar o diagnostico.' using errcode='42501';
  end if;
  if coalesce(p_damage_kind,'') not in ('same_part','different_part') then
    raise exception 'Classifique se o defeito e na mesma peca ou em outra peca.' using errcode='23514';
  end if;
  if length(btrim(coalesce(p_diagnosis,'')))<5 or length(coalesce(p_diagnosis,''))>400
     or length(btrim(coalesce(p_solution,'')))<5 or length(coalesce(p_solution,''))>400 then
    raise exception 'Informe diagnostico e solucao proposta (5 a 400 caracteres cada).' using errcode='23514';
  end if;
  select * into v_order from public.service_orders
    where id=p_order_id and organization_id=p_organization_id for update;
  if not found or v_order.return_root_id is null
     or v_order.completed_at is not null or v_order.cancelled_at is not null then
    raise exception 'Este atendimento nao pode ser classificado.' using errcode='23514';
  end if;
  if v_order.return_classification<>'analysis' then
    raise exception 'O diagnostico inicial ja foi classificado.' using errcode='23514';
  end if;
  v_classification:=case when p_damage_kind='same_part' then 'covered' else 'unrelated' end;
  update public.service_orders
    set diagnosis=btrim(p_diagnosis),solution=btrim(p_solution),
        return_classification=v_classification,updated_at=now()
    where id=v_order.id;
  return v_classification;
end;
$classify$;
revoke all on function public.classify_service_order_return_v2(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.classify_service_order_return_v2(uuid,uuid,text,text,text) to authenticated;

-- Nova OS independente: reutiliza contexto, equipamento e imagens; jamais copia valores, pagamentos,
-- numero da OS, classificacao anterior ou checklists concluidos.
create or replace function public.create_service_order_from_expired_warranty_v1(p_order_id uuid)
returns uuid language plpgsql security definer set search_path to ''
as $clone$
declare
  v_source public.service_orders%rowtype;
  v_new_id uuid;
  v_situation uuid;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
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
  if exists (select 1 from public.service_order_warranty_certificates cert
             where cert.organization_id=v_source.organization_id and cert.service_order_id=v_source.id
               and cert.starts_at<=v_today and cert.expires_at>=v_today) then
    raise exception 'A garantia ainda esta valida; use Iniciar retorno.' using errcode='23514';
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
     'Novo atendimento a partir da OS '||v_source.os_number||' (fora da garantia).',
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
$clone$;
revoke all on function public.create_service_order_from_expired_warranty_v1(uuid) from public,anon;
grant execute on function public.create_service_order_from_expired_warranty_v1(uuid) to authenticated;
