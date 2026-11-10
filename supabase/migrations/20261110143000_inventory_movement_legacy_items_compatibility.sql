-- Compatibilidade com itens históricos do estoque sem produto vinculado.
-- Permite a movimentação sem alterar dados de outros itens ou empresas.
CREATE OR REPLACE FUNCTION public.record_inventory_movement_with_details_v1(p_organization_id uuid, p_inventory_item_id uuid, p_movement_type text, p_input_quantity numeric, p_input_unit text DEFAULT NULL::text, p_supplier_entity_id uuid DEFAULT NULL::uuid, p_input_unit_cost numeric DEFAULT NULL::numeric, p_reason text DEFAULT NULL::text, p_purchase_reference text DEFAULT NULL::text, p_service_order_id uuid DEFAULT NULL::uuid, p_movement_origin text DEFAULT 'manual'::text, p_notes text DEFAULT NULL::text, p_finance_payload jsonb DEFAULT NULL::jsonb, p_sale_window_days integer DEFAULT NULL::integer, p_ncm text DEFAULT NULL::text, p_update_ncm boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_product public.products%rowtype;
  v_product_id uuid;
  v_ncm text;
  v_movement_id uuid;
  v_result jsonb;
  v_mode text := upper(btrim(coalesce(p_movement_type,'')));
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;
  if not private.has_effective_organization_permission(p_organization_id,'inventory.movements.create') then
    raise exception 'Você não possui permissão para movimentar o estoque.' using errcode='42501';
  end if;
  if p_sale_window_days is not null and (p_sale_window_days < 0 or p_sale_window_days > 3650) then
    raise exception 'O prazo de venda deve ser de 1 a 3650 dias, ou vazio para desativar.' using errcode='22023';
  end if;
  if p_finance_payload is not null and v_mode <> 'IN' then
    raise exception 'A integração de compra ao Financeiro exige uma entrada.' using errcode='22023';
  end if;

  -- Itens antigos podem existir sem vínculo com o cadastro de produtos.
  -- Nesses casos, registrar a movimentação normalmente e salvar o NCM no histórico.
  select item.product_id into v_product_id
  from public.inventory_items item
  where item.id=p_inventory_item_id and item.organization_id=p_organization_id;
  if not found then
    raise exception 'Item do estoque não encontrado nesta empresa.' using errcode='P0002';
  end if;

  if v_product_id is not null then
    select product.* into v_product from public.products product
    where product.id=v_product_id and product.organization_id=p_organization_id
    for update;
    if not found then
      raise exception 'Produto vinculado ao estoque não encontrado nesta empresa.' using errcode='P0002';
    end if;
  end if;

  v_ncm := nullif(btrim(coalesce(p_ncm,'')),'');
  if coalesce(p_update_ncm,false) then
    if v_product_id is not null
       and not private.has_effective_organization_permission(p_organization_id,'products.update') then
      raise exception 'Seu perfil não pode alterar o NCM do cadastro do produto.' using errcode='42501';
    end if;
    if v_ncm is not null and v_ncm !~ '^[0-9]{8}$' then
      raise exception 'O NCM deve ter exatamente 8 dígitos numéricos.' using errcode='22023';
    end if;
    if v_product_id is not null then
      update public.products
         set ncm=v_ncm, updated_at=now()
       where id=v_product_id and organization_id=p_organization_id;
    end if;
  else
    v_ncm:=v_product.ncm;
  end if;

  -- O gatilho de lotes existente usa esta configuração transacional ao inserir a entrada.
  -- 0 indica explicitamente 'sem prazo'; NULL utiliza o padrão configurado no produto.
  if p_sale_window_days is not null then
    perform set_config('app.inventory_sale_window_days',p_sale_window_days::text,true);
  end if;

  if p_finance_payload is not null then
    v_result:=public.record_inventory_purchase_with_finance(
      p_organization_id,p_inventory_item_id,p_input_quantity,p_input_unit,
      p_supplier_entity_id,p_input_unit_cost,p_purchase_reference,p_notes,p_finance_payload
    );
    v_movement_id:=nullif(v_result->>'movement_id','')::uuid;
  else
    v_movement_id:=public.record_inventory_movement(
      p_organization_id,p_inventory_item_id,v_mode,p_input_quantity,
      p_supplier_entity_id,p_input_unit_cost,p_reason,p_purchase_reference,
      p_service_order_id,coalesce(p_movement_origin,'manual'),p_notes,p_input_unit
    );
    v_result:=jsonb_build_object('movement_id',v_movement_id);
  end if;

  if v_movement_id is null then
    raise exception 'A movimentação não foi confirmada.' using errcode='P0002';
  end if;

  update public.inventory_movements
     set ncm_snapshot=v_ncm
   where id=v_movement_id and organization_id=p_organization_id;

  perform set_config('app.inventory_sale_window_days','',true);
  return v_result;
end;
$function$;
