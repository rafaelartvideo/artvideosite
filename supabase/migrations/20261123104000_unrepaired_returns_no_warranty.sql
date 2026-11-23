-- Fechamento sem reparo não equivale a solução técnica.
create or replace function public.complete_order_terminal_exit_v1(
 p_organization_id uuid,p_order_id uuid,p_outcome text,
 p_signature_request_id uuid,p_evidence_media_id uuid,p_reason text,
 p_stock_decisions jsonb default '[]'::jsonb,p_disposal_partner_id uuid default null
) returns jsonb
language plpgsql security definer set search_path=''
as $body$
declare
 v_order public.service_orders%rowtype;
 v_signature public.document_signature_requests%rowtype;
 v_now timestamptz:=now();
 v_outcome text:=btrim(coalesce(p_outcome,''));
 v_doc_type text;
 v_attachment_type text;
 v_situation_id uuid;
 v_partner uuid;
 v_closure_id uuid;
 v_movement_id uuid;
 v_part record;
 v_stock_item jsonb;
 v_stock_state text;
 v_return_qty numeric;
 v_count integer:=0;
 v_total_return numeric:=0;
 v_stock_snapshot jsonb;
begin
 if auth.uid() is null
 or not private.has_effective_organization_permission(p_organization_id,'orders.complete')
 or not private.is_organization_member(p_organization_id)
 then raise exception 'Você não tem permissão para encerrar esta OS.' using errcode='42501'; end if;
 if v_outcome not in ('disposal_confirmed','returned_unrepaired') then
  raise exception 'Tipo de encerramento não suportado.' using errcode='22023'; end if;
 if length(btrim(coalesce(p_reason,'')))<8 then
  raise exception 'Informe um motivo de encerramento com pelo menos 8 caracteres.' using errcode='22023'; end if;
 if jsonb_typeof(coalesce(p_stock_decisions,'[]'::jsonb))<>'array' then
  raise exception 'Informe a conferência de peças em formato válido.' using errcode='22023'; end if;
 select * into v_order from public.service_orders
 where id=p_order_id and organization_id=p_organization_id for update;
 if not found then raise exception 'OS não encontrada nesta empresa.' using errcode='P0002'; end if;
 if v_order.completed_at is not null or v_order.cancelled_at is not null then
  raise exception 'A OS já foi concluída ou cancelada.' using errcode='22023'; end if;
 if exists(select 1 from public.service_order_terminal_closures c where c.service_order_id=p_order_id) then
  raise exception 'Esta OS já possui um encerramento registrado.' using errcode='23505'; end if;

 -- Um orçamento rejeitado deve usar o mesmo fechamento assinado, sem aplicar
 -- itens comerciais nem contornar compromissos financeiros anteriores.
 if v_outcome='returned_unrepaired' then
  if exists(select 1 from public.service_order_quote_proposals q
      where q.organization_id=p_organization_id and q.service_order_id=p_order_id
        and q.applied_at is not null) then
   raise exception 'O orçamento já foi aplicado à execução. Revise os itens antes de devolver.' using errcode='23514';
  end if;
  if exists(select 1 from public.financial_entries f
      where f.organization_id=p_organization_id and f.origin_type='service_order'
        and f.origin_reference=p_order_id::text
        and f.approval_status is distinct from 'cancelled'
        and f.approval_status is distinct from 'reversed') then
   raise exception 'Esta OS possui títulos financeiros. Regularize antes da devolução.' using errcode='23514';
  end if;
 end if;

 v_doc_type:=case v_outcome when 'disposal_confirmed' then 'TERMO_DESCARTE'
   else 'TERMO_DEVOLUCAO_SEM_REPARO' end;
 v_attachment_type:=case v_outcome when 'disposal_confirmed' then 'evidência de descarte'
   else 'evidência de devolução' end;
 select r.* into v_signature
 from public.document_signature_requests r
 join public.print_templates t on t.id=r.print_template_id and t.organization_id=r.organization_id
 where r.id=p_signature_request_id and r.organization_id=p_organization_id
 and r.service_order_id=p_order_id and r.status='signed'
 and r.signed_at is not null and r.final_pdf_storage_path is not null
 and r.final_pdf_hash is not null and t.document_type=v_doc_type
 and t.require_external_signature=true and t.require_employee_signature=true;
 if not found then raise exception
  'O termo deste encerramento precisa estar assinado pelo cliente e pela assistência, com PDF finalizado.'
  using errcode='23514'; end if;

 if not exists(
  select 1 from public.service_order_situation_media a
  join public.attachment_types t on t.id=a.attachment_type_id and t.organization_id=p_organization_id
  join public.media m on m.id=a.media_id and m.organization_id=p_organization_id
  where a.organization_id=p_organization_id and a.service_order_id=p_order_id
    and a.situation_id is null and a.media_id=p_evidence_media_id
    and lower(btrim(t.name))=v_attachment_type
    and m.bucket_id='service-images' and nullif(m.storage_path,'') is not null
 ) then raise exception 'Anexe a evidência correspondente antes de confirmar o encerramento.' using errcode='23514'; end if;

 if v_outcome='disposal_confirmed' then
  v_partner:=coalesce(p_disposal_partner_id,v_order.disposal_partner_id);
  if v_partner is null or not exists(
    select 1 from public.entities e join public.entity_roles role on role.entity_id=e.id
      where e.id=v_partner and e.organization_id=p_organization_id and e.is_active
        and role.role='partner' and role.is_active
  ) then raise exception 'Informe uma instituição destinatária cadastrada como Parceiro.' using errcode='23503'; end if;
 end if;

 -- Na UI cada saída efetiva terá uma decisão: recuperada, instalada, danificada ou não recuperada.
 -- A ação não altera o estoque se não houver confirmação explícita de TODAS as peças.
 for v_part in
  select inventory_item_id,
    round(sum(case when movement_type='OUT' then quantity else -quantity end),3) qty
  from public.inventory_movements
  where organization_id=p_organization_id and service_order_id=p_order_id
    and movement_type in ('OUT','IN') and movement_origin in ('service_order','return')
  group by inventory_item_id
  having sum(case when movement_type='OUT' then quantity else -quantity end)>0
 loop
  v_count:=v_count+1;
  select item into v_stock_item from jsonb_array_elements(p_stock_decisions) item
    where item->>'inventory_item_id'=v_part.inventory_item_id::text limit 1;
  if v_stock_item is null
    or (select count(*) from jsonb_array_elements(p_stock_decisions) item
      where item->>'inventory_item_id'=v_part.inventory_item_id::text)<>1 then
    raise exception 'Confirme o destino de cada peça retirada do estoque.' using errcode='22023'; end if;
  v_stock_state:=v_stock_item->>'decision';
  if v_stock_state is null or v_stock_state not in ('reusable','installed','damaged','not_recovered') then
    raise exception 'Destino da peça inválido.' using errcode='22023'; end if;
  if v_stock_state='reusable' then
    if v_stock_item->>'physical_confirmed'<>'true' then
     raise exception 'A devolução da peça deve ter conferência física confirmada.' using errcode='22023'; end if;
    begin
      v_return_qty:=round((v_stock_item->>'return_qty')::numeric,3);
    exception when others then
      raise exception 'Quantidade recuperada inválida.' using errcode='22023';
    end;
    if v_return_qty is null or v_return_qty<=0 or v_return_qty>v_part.qty then
      raise exception 'Quantidade recuperada maior que a saída ou inválida.' using errcode='22023'; end if;
    if not private.has_effective_organization_permission(p_organization_id,'inventory.movements.create') then
      raise exception 'Para devolver peças, o operador também precisa da permissão de movimentar estoque.' using errcode='42501'; end if;
  end if;
 end loop;
 if jsonb_array_length(coalesce(p_stock_decisions,'[]'::jsonb))<>v_count then
   raise exception 'A relação de peças foi alterada. Atualize a conferência antes de confirmar.' using errcode='22023'; end if;

 select id into v_situation_id from public.os_situations
 where organization_id=p_organization_id and
 slug=case v_outcome when 'disposal_confirmed' then 'descarte' else 'equipamento-devolvido-sem-reparo' end
 and is_active order by created_at limit 1;
 if v_situation_id is null then
  raise exception 'A situação de encerramento não foi configurada para esta empresa.' using errcode='23503'; end if;

 insert into public.service_order_terminal_closures(
  organization_id,service_order_id,outcome,reason,signature_request_id,
  evidence_media_id,disposal_partner_id,confirmed_by,confirmed_at,order_snapshot
 ) values(
  p_organization_id,p_order_id,v_outcome,btrim(p_reason),v_signature.id,
  p_evidence_media_id,v_partner,auth.uid(),v_now,
  jsonb_build_object(
    'os_number',v_order.os_number,'customer_id',v_order.customer_id,
    'equipment_serial_number',v_order.serial_number,'equipment_model_id',v_order.equipment_model_id,
    'prior_situation_id',v_order.situation_id,'prior_status_id',v_order.status_id,
    'signature_pdf_hash',v_signature.final_pdf_hash
  )
 ) returning id into v_closure_id;

 for v_part in
  select inventory_item_id,
    round(sum(case when movement_type='OUT' then quantity else -quantity end),3) qty
  from public.inventory_movements
  where organization_id=p_organization_id and service_order_id=p_order_id
    and movement_type in ('OUT','IN') and movement_origin in ('service_order','return')
  group by inventory_item_id
  having sum(case when movement_type='OUT' then quantity else -quantity end)>0
 loop
  select item into v_stock_item from jsonb_array_elements(p_stock_decisions) item
    where item->>'inventory_item_id'=v_part.inventory_item_id::text limit 1;
  v_stock_state:=v_stock_item->>'decision';
  v_return_qty:=case when v_stock_state='reusable'
    then round((v_stock_item->>'return_qty')::numeric,3) else 0 end;
  v_movement_id:=null;
  if v_return_qty>0 then
    v_movement_id:=public.record_inventory_movement(
      p_organization_id,v_part.inventory_item_id,'IN',v_return_qty,null,
      (select coalesce(average_cost,purchase_price,0) from public.inventory_items
       where id=v_part.inventory_item_id and organization_id=p_organization_id),
      'Reintegração física de peça · OS #'||v_order.os_number,
      null,p_order_id,'return','Devolução conferida no encerramento '||v_outcome,'un');
    v_total_return:=v_total_return+v_return_qty;
  end if;
  insert into public.service_order_terminal_stock_lines(
   closure_id,organization_id,inventory_item_id,quantity_outstanding,
   quantity_restored,decision,movement_id,confirmed_by
  ) values(
   v_closure_id,p_organization_id,v_part.inventory_item_id,v_part.qty,
   v_return_qty,v_stock_state,v_movement_id,auth.uid());
 end loop;

 perform set_config('app.special_order_exit','true',true);
 perform set_config('app.resolve_service_order','true',true);
 perform set_config('app.complete_service_order','true',true);
 update public.service_orders set
  situation_id=v_situation_id,is_solved=(v_outcome='disposal_confirmed'),
  completed_at=v_now,completed_by=auth.uid(),closure_outcome=v_outcome,
  service_price=0,parts_total=0,subtotal=0,final_total=0,
  discount_type='amount',discount_percentage=0,discount_amount=0,
  updated_at=v_now
 where id=p_order_id and organization_id=p_organization_id;
 perform set_config('app.complete_service_order','false',true);
 perform set_config('app.resolve_service_order','false',true);
 perform set_config('app.special_order_exit','false',true);

 if v_outcome='returned_unrepaired' then
  update public.financial_losses set status='confirmed',confirmed_at=v_now
  where service_order_id=p_order_id and organization_id=p_organization_id
  and source_type='rejected_service_order_quote' and status='pending_return';
 end if;

 select coalesce(jsonb_agg(jsonb_build_object(
  'inventory_item_id',stock.inventory_item_id,'name',product.name,'sku',product.sku,
  'quantity_outstanding',stock.quantity_outstanding,
  'quantity_restored',stock.quantity_restored,'decision',stock.decision,
  'movement_id',stock.movement_id
 ) order by product.name),'[]'::jsonb)
 into v_stock_snapshot
 from public.service_order_terminal_stock_lines stock
 join public.inventory_items product on product.id=stock.inventory_item_id
   and product.organization_id=stock.organization_id
 where stock.closure_id=v_closure_id;
 update public.service_order_terminal_closures
 set stock_snapshot=v_stock_snapshot where id=v_closure_id;

 return jsonb_build_object(
 'id',v_closure_id,'order_id',p_order_id,'outcome',v_outcome,
 'completed_at',v_now,'signature_request_id',v_signature.id,
 'returned_to_stock',v_total_return);
end;
$body$;
revoke all on function public.complete_order_terminal_exit_v1(uuid,uuid,text,uuid,uuid,text,jsonb,uuid) from public,anon;
grant execute on function public.complete_order_terminal_exit_v1(uuid,uuid,text,uuid,uuid,text,jsonb,uuid) to authenticated;



-- A proteção também vale para chamadas diretas à emissão de garantia.
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
 if v_os.closure_outcome in ('rejected_quote_return','returned_unrepaired','disposal_confirmed') then
   raise exception 'Devolução sem reparo e descarte não geram certificado de garantia.' using errcode='23514';
 end if;
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
end $function$

