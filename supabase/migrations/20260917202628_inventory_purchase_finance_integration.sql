begin;

create or replace function public.record_inventory_purchase_with_finance(
  p_organization_id uuid,
  p_inventory_item_id uuid,
  p_input_quantity numeric,
  p_input_unit text,
  p_supplier_entity_id uuid,
  p_input_unit_cost numeric,
  p_purchase_reference text default null,
  p_notes text default null,
  p_finance_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.inventory_items%rowtype;
  v_supplier public.entities%rowtype;
  v_movement_id uuid;
  v_subtotal numeric(14,2);
  v_discount numeric(14,2) := round(coalesce((p_finance_payload->>'discount')::numeric,0),2);
  v_freight numeric(14,2) := round(coalesce((p_finance_payload->>'freight')::numeric,0),2);
  v_other numeric(14,2) := round(coalesce((p_finance_payload->>'other_costs')::numeric,0),2);
  v_total numeric(14,2);
  v_document text := nullif(btrim(coalesce(p_finance_payload->>'document_reference','')),'');
  v_installments jsonb := coalesce(p_finance_payload->'installments','[]'::jsonb);
  v_entry_id uuid;
  v_required smallint;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if not private.has_effective_organization_permission(p_organization_id,'inventory.movements.create') then
    raise exception 'Você não possui permissão para registrar movimentações de estoque.' using errcode='42501';
  end if;
  if not exists(select 1 from public.organization_modules om where om.organization_id=p_organization_id and om.module_key='finance' and om.is_enabled=true) then
    raise exception 'O módulo Financeiro não está habilitado para esta empresa.' using errcode='42501';
  end if;
  if p_supplier_entity_id is null then raise exception 'Informe o fornecedor da compra para gerar o pré-lançamento financeiro.' using errcode='22023'; end if;
  if p_input_quantity is null or p_input_quantity<=0 then raise exception 'Informe uma quantidade maior que zero.' using errcode='22023'; end if;
  if p_input_unit_cost is null or p_input_unit_cost<0 then raise exception 'Informe o valor de compra da entrada.' using errcode='22023'; end if;
  if v_discount<0 or v_freight<0 or v_other<0 then raise exception 'Desconto, frete e outros custos não podem ser negativos.' using errcode='22023'; end if;

  select * into v_item from public.inventory_items i
  where i.id=p_inventory_item_id and i.organization_id=p_organization_id and i.is_active=true;
  if not found then raise exception 'Item do estoque não encontrado ou inativo.' using errcode='P0002'; end if;

  select * into v_supplier from public.entities e
  where e.id=p_supplier_entity_id and e.organization_id=p_organization_id and e.is_active=true;
  if not found then raise exception 'Fornecedor da compra não encontrado ou inativo.' using errcode='P0002'; end if;
  if not exists(select 1 from public.entity_roles er where er.entity_id=v_supplier.id and er.role='supplier' and er.is_active=true) then
    raise exception 'O cadastro informado não está ativo como fornecedor.' using errcode='23514';
  end if;

  v_subtotal:=round(p_input_quantity*p_input_unit_cost,2);
  v_total:=round(v_subtotal-v_discount+v_freight+v_other,2);
  if v_total<=0 then raise exception 'O total financeiro da compra deve ser maior que zero.' using errcode='22023'; end if;
  if v_discount>v_subtotal+v_freight+v_other then raise exception 'O desconto não pode tornar o total da compra negativo ou zero.' using errcode='22023'; end if;

  if jsonb_typeof(v_installments)<>'array' then raise exception 'Parcelas financeiras da compra inválidas.' using errcode='22023'; end if;
  if jsonb_array_length(v_installments)=0 then
    v_installments:=jsonb_build_array(jsonb_build_object('installment_number',1,'due_date',current_date,'amount',v_total));
  end if;

  -- The stock movement and the financial pre-entry share this transaction.
  v_movement_id:=public.record_inventory_movement(
    p_organization_id,
    p_inventory_item_id,
    'IN',
    p_input_quantity,
    p_supplier_entity_id,
    p_input_unit_cost,
    'Entrada de compra',
    p_purchase_reference,
    null,
    'purchase',
    p_notes,
    p_input_unit
  );

  v_entry_id:=private.create_integrated_financial_entry(
    p_organization_id,
    'payable',
    'inventory_purchase',
    v_movement_id::text,
    'Compra de estoque — '||v_item.name,
    current_date,
    current_date,
    v_total,
    v_supplier.id,
    coalesce(nullif(btrim(v_supplier.trade_name),''),nullif(btrim(v_supplier.name),''),nullif(btrim(v_supplier.legal_name),''),'Fornecedor'),
    nullif(btrim(v_supplier.document),''),
    jsonb_build_object(
      'inventory_movement_id',v_movement_id,
      'inventory_item_id',v_item.id,
      'inventory_item_name',v_item.name,
      'inventory_item_sku',v_item.sku,
      'input_quantity',p_input_quantity,
      'input_unit',lower(btrim(coalesce(p_input_unit,v_item.unit,'un'))),
      'input_unit_cost',round(p_input_unit_cost,2),
      'subtotal',v_subtotal,
      'discount',v_discount,
      'freight',v_freight,
      'other_costs',v_other,
      'financial_total',v_total,
      'purchase_reference',nullif(btrim(coalesce(p_purchase_reference,'')),''),
      'document_reference',v_document,
      'notes',nullif(btrim(coalesce(p_notes,'')),'')
    ),
    v_installments,
    'pending',
    v_user_id
  );

  select required_approvals into v_required from public.financial_entries where id=v_entry_id;

  return jsonb_build_object(
    'movement_id',v_movement_id,
    'financial_entry_id',v_entry_id,
    'financial_total',v_total,
    'approval_status','pending',
    'required_approvals',v_required
  );
end;
$$;

revoke all on function public.record_inventory_purchase_with_finance(uuid,uuid,numeric,text,uuid,numeric,text,text,jsonb) from public,anon;
grant execute on function public.record_inventory_purchase_with_finance(uuid,uuid,numeric,text,uuid,numeric,text,text,jsonb) to authenticated;

commit;
