-- Reabertura exige motivo, como em Iniciar retorno.
-- A nova OS usa o motivo como descricao atual do problema e preserva
-- o relato anterior somente no historico interno, sem copiar financeiro.
CREATE OR REPLACE FUNCTION public.reopen_service_order_as_new_v2(p_order_id uuid, p_reason text)
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
  if coalesce(char_length(btrim(p_reason)),0) not between 5 and 2000 then
    raise exception 'Informe o motivo do retorno com pelo menos 5 e no maximo 2000 caracteres.'
      using errcode='22023';
  end if;
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
   btrim(p_reason),
   concat_ws(E'\n',nullif(v_source.internal_notes,''),
     'Novo atendimento a partir da OS '||v_source.os_number||' (reabertura com novo numero).',
     'Motivo do retorno: '||btrim(p_reason),
     case when nullif(btrim(v_source.customer_notes),'') is not null
       then 'Relato anterior: '||v_source.customer_notes end,
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

-- Nao permitir que clientes antigos contornem o motivo obrigatorio
-- chamando a RPC legada sem o argumento.
CREATE OR REPLACE FUNCTION public.reopen_service_order_as_new_v1(p_order_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $legacy$
BEGIN
  RAISE EXCEPTION 'Informe o motivo do retorno para reabrir esta OS. Atualize a pagina e tente novamente.'
    USING errcode='22023';
END;
$legacy$;

REVOKE ALL ON FUNCTION public.reopen_service_order_as_new_v2(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_service_order_as_new_v2(uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reopen_service_order_as_new_v2(uuid,text) TO authenticated;
