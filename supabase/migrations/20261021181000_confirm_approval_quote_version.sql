begin;
CREATE OR REPLACE FUNCTION public.manage_service_order_quote_v1(p_organization_id uuid, p_order_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS service_order_quote_proposals
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_record public.service_order_quote_proposals;
  v_item jsonb;
  v_kind text;
  v_catalog uuid;
  v_catalog_service public.general_services%rowtype;
  v_catalog_product public.inventory_items%rowtype;
  v_expected_price numeric;
  v_stock numeric;
  v_qty integer;
  v_price numeric;
  v_cost numeric;
  v_subtotal numeric := 0;
  v_discount numeric;
  v_discount_type text;
  v_snapshot jsonb;
  v_json_items jsonb;
begin
  if auth.uid() is null then raise exception 'Sessão não autenticada' using errcode='42501'; end if;
  if not private.is_organization_member(p_organization_id)
      or not private.is_organization_module_enabled(p_organization_id,'orders')
      or not (private.has_effective_organization_permission(p_organization_id,'orders.edit')
          or private.has_effective_organization_permission(p_organization_id,'orders.update'))
      or not private.can_view_service_order(p_order_id)
  then raise exception 'Sem permissão para alterar o orçamento da OS' using errcode='42501'; end if;
  if not exists (
    select 1 from public.service_orders os
    join public.service_types st on st.id=os.service_type_id and st.organization_id=os.organization_id
    where os.id=p_order_id and os.organization_id=p_organization_id
      and st.quote_workflow_enabled and os.completed_at is null and os.cancelled_at is null
  ) then raise exception 'Esta OS não possui fluxo de orçamento habilitado ou está encerrada'; end if;

  insert into public.service_order_quote_proposals(organization_id,service_order_id,updated_by)
  values(p_organization_id,p_order_id,auth.uid())
  on conflict(service_order_id) do nothing;
  select * into v_record from public.service_order_quote_proposals
  where organization_id=p_organization_id and service_order_id=p_order_id for update;
  if not found then raise exception 'Orçamento não encontrado'; end if;

  if p_action='save' then
    if v_record.status not in ('draft','renegotiation') then
      raise exception 'A proposta já foi enviada. Inicie uma renegociação para editar.';
    end if;
    if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Dados inválidos'; end if;
    v_json_items:=coalesce(p_payload->'items','[]'::jsonb);
    if jsonb_typeof(v_json_items)<>'array' or jsonb_array_length(v_json_items)>100 then
      raise exception 'Máximo de 100 itens no orçamento'; end if;
    for v_item in select value from jsonb_array_elements(v_json_items) loop
      v_kind:=v_item->>'item_type';
      v_qty:=coalesce(nullif(v_item->>'quantity','')::integer,0);
      v_price:=coalesce(nullif(v_item->>'unit_price','')::numeric,0);
      v_cost:=coalesce(nullif(v_item->>'additional_cost','')::numeric,0);
      if v_kind not in ('service','product','custom_service')
        or btrim(coalesce(v_item->>'title_snapshot',''))=''
        or v_qty<=0 or v_qty>10000 or v_price<0 or v_cost<0
      then raise exception 'Produto ou serviço inválido'; end if;
      if v_kind='service' then
        v_catalog:=nullif(v_item->>'general_service_id','')::uuid;
        if v_catalog is null or not exists(select 1 from public.general_services where id=v_catalog and organization_id=p_organization_id)
        then raise exception 'Serviço não pertence à empresa'; end if;
        select * into v_catalog_service from public.general_services where id=v_catalog and organization_id=p_organization_id;
        if v_price is distinct from coalesce(v_catalog_service.price,0) then
          raise exception 'O preço de serviços cadastrados é fixado no catálogo e não pode ser alterado.';
        end if;
      elsif v_kind='product' then
        v_catalog:=nullif(v_item->>'inventory_item_id','')::uuid;
        if v_catalog is null or not exists(select 1 from public.inventory_items where id=v_catalog and organization_id=p_organization_id)
        then raise exception 'Produto não pertence à empresa'; end if;
        select * into v_catalog_product from public.inventory_items where id=v_catalog and organization_id=p_organization_id;
        if not v_catalog_product.is_active then
          raise exception 'O produto está inativo e não pode ser incluído no orçamento.';
        end if;
        v_expected_price := case
          when lower(coalesce(v_catalog_product.unit,'un'))='cx' then
            coalesce(v_catalog_product.sale_price,0) * greatest(1,coalesce(v_catalog_product.conversion_factor,1))
          else coalesce(v_catalog_product.sale_price,0)
        end;
        v_stock := case
          when lower(coalesce(v_catalog_product.unit,'un'))='cx' then
            coalesce(v_catalog_product.quantity,0)/greatest(1,coalesce(v_catalog_product.conversion_factor,1))
          else coalesce(v_catalog_product.quantity,0)
        end;
        if v_qty>v_stock then
          raise exception 'Quantidade do produto % maior que o estoque disponível.',v_catalog_product.name;
        end if;
        if v_expected_price>0 and v_price is distinct from v_expected_price then
          raise exception 'O produto % já tem preço definido no catálogo e não pode ser alterado.',v_catalog_product.name;
        end if;
      end if;
      v_subtotal:=v_subtotal + (v_qty*v_price)+v_cost;
    end loop;
    v_discount_type:=coalesce(nullif(p_payload->>'discount_type',''),'amount');
    v_discount:=coalesce(nullif(p_payload->>'discount_value','')::numeric,0);
    if v_discount_type not in ('amount','percentage') or v_discount<0
      or (v_discount_type='percentage' and v_discount>100)
      or (v_discount_type='amount' and v_discount>v_subtotal)
    then raise exception 'Desconto inválido'; end if;
    update public.service_order_quote_proposals set
      diagnosis=left(coalesce(p_payload->>'diagnosis',''),5000),
      proposed_solution=left(coalesce(p_payload->>'proposed_solution',''),5000),
      commercial_conditions=left(coalesce(p_payload->>'commercial_conditions',''),5000),
      valid_until=nullif(p_payload->>'valid_until','')::date,
      items=v_json_items,
      discount_type=v_discount_type,
      discount_value=v_discount,
      updated_by=auth.uid(),updated_at=now()
    where id=v_record.id returning * into v_record;
  elsif p_action='submit' then
    if v_record.status not in ('draft','renegotiation') or jsonb_array_length(v_record.items)=0
      or btrim(v_record.proposed_solution)='' or btrim(v_record.diagnosis)=''
    then raise exception 'Preencha diagnóstico, solução e itens antes de enviar para aprovação'; end if;
    v_snapshot:=jsonb_build_object(
      'version',v_record.version,'submitted_at',now(),'submitted_by',auth.uid(),
      'diagnosis',v_record.diagnosis,'proposed_solution',v_record.proposed_solution,
      'commercial_conditions',v_record.commercial_conditions,'valid_until',v_record.valid_until,
      'items',v_record.items,'discount_type',v_record.discount_type,'discount_value',v_record.discount_value
    );
    update public.service_order_quote_proposals set
      status='awaiting_approval',versions=versions||jsonb_build_array(v_snapshot),
      updated_by=auth.uid(),updated_at=now()
    where id=v_record.id returning * into v_record;
  elsif p_action='approve' then
    -- Explicit confirmation from the approval dialog is required. Sending
    -- the quote, reloading or clicking twice must not approve it.
    if coalesce(p_payload->>'confirmation','') <> 'CONFIRMAR_APROVACAO' then
      raise exception 'Confirme a aprovação do orçamento no diálogo antes de prosseguir';
    end if;
    if coalesce(p_payload->>'version','') <> v_record.version::text then
      raise exception 'A versão do orçamento foi alterada. Recarregue e confirme novamente';
    end if;
    if v_record.status<>'awaiting_approval' then raise exception 'A proposta não está aguardando aprovação'; end if;
    update public.service_order_quote_proposals set
      status='approved',approved_at=now(),approved_by=auth.uid(),updated_by=auth.uid(),updated_at=now()
    where id=v_record.id returning * into v_record;
  elsif p_action='reject' then
    if v_record.status<>'awaiting_approval' then raise exception 'A proposta não está aguardando aprovação'; end if;
    if btrim(coalesce(p_payload->>'reason',''))='' then raise exception 'Informe o motivo da reprovação'; end if;
    update public.service_order_quote_proposals set
      status='rejected',rejection_reason=left(btrim(p_payload->>'reason'),2000),
      updated_by=auth.uid(),updated_at=now()
    where id=v_record.id returning * into v_record;
  elsif p_action='renegotiate' then
    if v_record.status not in ('rejected','awaiting_approval') then
      raise exception 'Somente propostas rejeitadas ou pendentes podem ser renegociadas'; end if;
    update public.service_order_quote_proposals set
      status='renegotiation',version=version+1,rejection_reason=null,
      updated_by=auth.uid(),updated_at=now()
    where id=v_record.id returning * into v_record;
  else
    raise exception 'Operação de orçamento desconhecida';
  end if;
  return v_record;
end;
$function$
;
commit;