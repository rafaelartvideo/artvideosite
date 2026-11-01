CREATE OR REPLACE FUNCTION private.apply_approved_os_quote_items()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_item jsonb;
  v_index integer := 0;
  v_mode text := coalesce(nullif(current_setting('app.quote_reconcile_mode',true),''),'none');
  v_order public.service_orders%rowtype;
  v_prior_items jsonb := '[]'::jsonb;
  v_proposed_subtotal numeric := 0;
  v_quote_discount numeric := 0;
  v_applied_discount numeric := 0;
  v_after_total numeric := 0;
  v_match_id uuid;
  v_match_count integer;
begin
  if not (old.status='awaiting_approval' and new.status='approved') then return new; end if;
  if new.applied_at is not null then raise exception 'Proposta já aplicada à OS'; end if;
  select * into v_order from public.service_orders
    where id=new.service_order_id and organization_id=new.organization_id
    and completed_at is null and cancelled_at is null for update;
  if not found then raise exception 'OS indisponível para executar orçamento aprovado'; end if;
  -- A aprovação permanece atômica. Não permite alterar OS já faturada/recebida.
  if exists(select 1 from public.financial_receipts where service_order_id=v_order.id)
    or exists(select 1 from public.fiscal_documents where source_order_id=v_order.id)
    or exists(select 1 from public.financial_entries e where e.organization_id=new.organization_id
      and e.origin_reference in (v_order.id::text,v_order.os_number)
      and (e.origin_type ilike '%order%' or e.origin_type ilike '%os%'))
  then raise exception 'A OS já possui registros financeiros/fiscais. Revise os lançamentos antes de aprovar alterações comerciais.'; end if;

  perform 1 from public.service_order_items where service_order_id=v_order.id and organization_id=new.organization_id for update;
  select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at,i.id),'[]'::jsonb) into v_prior_items
    from public.service_order_items i where i.service_order_id=v_order.id and i.organization_id=new.organization_id;
  if jsonb_array_length(v_prior_items)>0 then
    if v_mode <> 'reuse' then
      raise exception 'Para uma OS com itens anteriores, somente reutilizar os itens existentes é permitido.';
    end if;
    -- Um para um: não pode haver itens excedentes, nem duplicações ou preços diferentes.
    if jsonb_array_length(v_prior_items) <> jsonb_array_length(new.items) then
      raise exception 'Os itens da proposta diferem da execução. Revise o orçamento antes de aprovar.';
    end if;
    for v_item in select value from jsonb_array_elements(new.items) loop
      select count(*),(array_agg(i.id))[1] into v_match_count,v_match_id
      from public.service_order_items i
      where i.service_order_id=new.service_order_id
        and i.organization_id=new.organization_id
        and i.quote_proposal_id is null
        and i.item_type=v_item->>'item_type'
        and i.quantity=(v_item->>'quantity')::integer
        and i.unit_price=(v_item->>'unit_price')::numeric
        and i.additional_cost=coalesce((v_item->>'additional_cost')::numeric,0)
        and (
          (i.item_type='service' and i.general_service_id::text=v_item->>'general_service_id')
          or (i.item_type='product' and i.inventory_item_id::text=v_item->>'inventory_item_id')
          or (i.item_type='custom_service'
              and lower(btrim(i.title_snapshot))=lower(btrim(v_item->>'title_snapshot')))
        );
      if v_match_count<>1 then
        raise exception 'Não foi possível reutilizar os itens da proposta: verifique o serviço, quantidade e valores da execução.';
      end if;
      -- Atualiza somente a referência da proposta: preserva id, tarefas, relatórios, fotos e datas.
      update public.service_order_items
         set quote_proposal_id=new.id,quote_line_index=v_index
       where id=v_match_id and quote_proposal_id is null;
      if not found then raise exception 'O serviço foi alterado durante a aprovação. Recarregue a OS.'; end if;
      v_index:=v_index+1;
    end loop;
  else
    v_mode:='none';
  end if;

  select coalesce(sum(greatest(1,(q->>'quantity')::integer)*(q->>'unit_price')::numeric
    +coalesce((q->>'additional_cost')::numeric,0)),0)
  into v_proposed_subtotal from jsonb_array_elements(new.items) q;
  v_quote_discount:=case when new.discount_type='percentage'
      then round(v_proposed_subtotal*new.discount_value/100,2)
      else new.discount_value end;
  v_applied_discount:=v_quote_discount+
    case when v_mode='keep' then coalesce(v_order.discount_amount,0) else 0 end;

  if v_mode='none' then
  for v_item in select value from jsonb_array_elements(new.items) loop
    insert into public.service_order_items(
      service_order_id, organization_id, item_type, general_service_id,
      inventory_item_id, title_snapshot, description_snapshot, quantity,
      unit_price, additional_cost, quote_proposal_id, quote_line_index
    ) values(
      new.service_order_id,new.organization_id,v_item->>'item_type',
      nullif(v_item->>'general_service_id','')::uuid,
      nullif(v_item->>'inventory_item_id','')::uuid,
      v_item->>'title_snapshot',v_item->>'description_snapshot',
      (v_item->>'quantity')::integer,(v_item->>'unit_price')::numeric,
      (v_item->>'additional_cost')::numeric,new.id,v_index
    );
    v_index:=v_index+1;
  end loop;
  end if;
  perform private.recalculate_service_order_commercial_totals(new.service_order_id,'amount',v_applied_discount);
  select final_total into v_after_total from public.service_orders where id=new.service_order_id;
  insert into private.service_order_quote_reconciliation_history(
    quote_proposal_id,service_order_id,organization_id,mode,prior_items,new_items,
    prior_total,new_total,actor_user_id
  ) values(
    new.id,new.service_order_id,new.organization_id,v_mode,v_prior_items,new.items,
    coalesce(v_order.final_total,0),coalesce(v_after_total,0),auth.uid()
  );
  -- Além do backup privado, registra uma nota legível no Histórico da OS.
  insert into public.service_order_history_notes(
    service_order_id,organization_id,author_id,content
  ) values(
    new.service_order_id,new.organization_id,auth.uid(),
    left(concat(
      'Orçamento versão ',new.version,' aprovado. Conciliação: ',
      case v_mode when 'reuse' then 'itens existentes reutilizados, sem perder execução técnica'
        else 'itens do orçamento aplicados' end,
      '. Total anterior: R$ ',replace(to_char(coalesce(v_order.final_total,0),'FM999999990.00'),'.',','),
      '. Total após aprovação: R$ ',replace(to_char(coalesce(v_after_total,0),'FM999999990.00'),'.',','),
      '. Itens anteriores: ',
      coalesce((select string_agg(left(coalesce(i->>'title_snapshot','Item'),90),', ')
        from jsonb_array_elements(v_prior_items) i),'nenhum'),
      '. Itens aprovados: ',
      coalesce((select string_agg(left(coalesce(i->>'title_snapshot','Item'),90),', ')
        from jsonb_array_elements(new.items) i),'nenhum'),
      '.'
    ),1900)
  );
  update public.service_order_quote_proposals set applied_at=now() where id=new.id;
  return new;
end;
$function$
;
