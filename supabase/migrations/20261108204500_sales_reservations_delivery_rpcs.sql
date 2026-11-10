begin;
alter table public.sales_proposal_events drop constraint if exists sales_proposal_events_event_type_check;
alter table public.sales_proposal_events add constraint sales_proposal_events_event_type_check
 check(event_type in ('created','revised','sent','approved','rejected','reopened','converted','cancelled',
                      'reserved','reservation_released'));
alter table public.sales_order_events drop constraint if exists sales_order_events_type_check;
alter table public.sales_order_events add constraint sales_order_events_type_check
 check(event_type in ('created','fulfillment_changed','cancelled','delivery_configured','delivery_completed',
                       'return_requested','return_approved','return_rejected','return_received'));

create or replace function public.reserve_sales_proposal_v1(
 p_organization_id uuid,p_proposal_id uuid,p_days integer default 7
) returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare
 v_actor uuid:=auth.uid();
 v_proposal public.sales_proposals%rowtype;
 v_line record;
 v_stock public.inventory_items%rowtype;
 v_quantity numeric;
 v_total_hold numeric;
 v_own_hold numeric;
 v_expires timestamptz;
 v_count integer:=0;
begin
 if v_actor is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.reservations.manage')
 then raise exception 'Sem permissão para reservar mercadorias.' using errcode='42501'; end if;
 if p_days is null or p_days not between 1 and 30 then
   raise exception 'Reserva deve durar de 1 a 30 dias.' using errcode='22023'; end if;
 select * into v_proposal from public.sales_proposals
 where organization_id=p_organization_id and id=p_proposal_id for update;
 if not found then raise exception 'Proposta não encontrada.' using errcode='P0002'; end if;
 if v_proposal.status<>'approved' or v_proposal.valid_until<current_date then
   raise exception 'Somente propostas aprovadas e válidas podem reservar mercadoria.' using errcode='22023'; end if;
 v_expires:=least(now()+make_interval(days=>p_days),
   (v_proposal.valid_until::timestamp + interval '1 day') at time zone current_setting('TimeZone'));
 if v_expires<=now() then raise exception 'Proposta já venceu.' using errcode='22023'; end if;
 for v_line in select i.product_id,i.quantity
   from public.sales_proposal_items i
   where i.organization_id=p_organization_id and i.proposal_id=p_proposal_id
   order by i.product_id loop
    select * into v_stock from public.inventory_items s
    where s.organization_id=p_organization_id and s.product_id=v_line.product_id
      and s.is_active and s.archived_at is null order by s.id limit 1 for update;
    if not found then raise exception 'Produto da proposta sem estoque ativo.' using errcode='22023'; end if;
    v_quantity:=v_line.quantity*
      (case when lower(coalesce(v_stock.unit,'un'))='cx'
      then greatest(1,coalesce(v_stock.conversion_factor,1)) else 1 end);
    select coalesce(sum(r.quantity_base),0),
      coalesce(sum(r.quantity_base) filter(where r.proposal_id=p_proposal_id),0)
    into v_total_hold,v_own_hold
    from public.sales_stock_reservations r
    where r.organization_id=p_organization_id and r.inventory_item_id=v_stock.id
      and r.status='active' and r.expires_at>now();
    if v_stock.quantity-v_total_hold+v_own_hold<v_quantity then
      raise exception 'Sem saldo livre para reservar %. Disponível %.',v_stock.name,
        greatest(0,v_stock.quantity-v_total_hold+v_own_hold) using errcode='23514'; end if;
    insert into public.sales_stock_reservations(
      organization_id,proposal_id,inventory_item_id,quantity_base,status,expires_at,created_by
    ) values(p_organization_id,p_proposal_id,v_stock.id,v_quantity,'active',v_expires,v_actor)
    on conflict(organization_id,proposal_id,inventory_item_id) do update
      set quantity_base=excluded.quantity_base,status='active',expires_at=excluded.expires_at,
          released_at=null,released_by=null;
    v_count:=v_count+1;
 end loop;
 if v_count=0 then raise exception 'Proposta não possui itens para reservar.' using errcode='22023'; end if;
 insert into public.sales_proposal_events(organization_id,proposal_id,event_type,event_data,created_by)
 values(p_organization_id,p_proposal_id,'reserved',
   jsonb_build_object('items',v_count,'expires_at',v_expires),v_actor);
 return jsonb_build_object('status','active','item_count',v_count,'expires_at',v_expires);
end;$function$;

create or replace function public.release_sales_proposal_reservation_v1(
 p_organization_id uuid,p_proposal_id uuid,p_reason text default null
) returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare v_actor uuid:=auth.uid();v_count integer;
begin
 if v_actor is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.reservations.manage')
 then raise exception 'Sem permissão para liberar reservas.' using errcode='42501'; end if;
 perform 1 from public.sales_proposals where organization_id=p_organization_id and id=p_proposal_id for update;
 if not found then raise exception 'Proposta não encontrada.' using errcode='P0002'; end if;
 update public.sales_stock_reservations set status='released',released_at=now(),released_by=v_actor
 where organization_id=p_organization_id and proposal_id=p_proposal_id and status='active';
 get diagnostics v_count=row_count;
 if v_count>0 then
   insert into public.sales_proposal_events(organization_id,proposal_id,event_type,event_data,created_by)
   values(p_organization_id,p_proposal_id,'reservation_released',
     jsonb_build_object('items',v_count,'reason',left(btrim(coalesce(p_reason,'')),500)),v_actor);
 end if;
 return jsonb_build_object('released_items',v_count);
end;$function$;

-- Qualquer renegociação/cancelamento impede reserva presa sem proposta aprovada.
create or replace function private.release_proposal_hold_on_status_v1()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
 if old.status='approved' and new.status<>'approved' then
   update public.sales_stock_reservations
    set status=case when new.status='converted' then 'converted' else 'released' end,
        released_at=now(),released_by=auth.uid()
   where organization_id=new.organization_id and proposal_id=new.id and status='active';
 end if;
 return new;
end;$function$;
drop trigger if exists release_proposal_hold_on_status_v1 on public.sales_proposals;
create trigger release_proposal_hold_on_status_v1 after update of status on public.sales_proposals
for each row execute function private.release_proposal_hold_on_status_v1();

-- Configuração explícita antes da separação, com PIN aleatório gerado apenas pelo servidor.
create or replace function public.configure_sales_order_delivery_v1(
 p_organization_id uuid,p_order_id uuid,p_method text,
 p_address text default null,p_expected_at timestamptz default null,
 p_carrier text default null,p_tracking text default null,p_regenerate_code boolean default false
) returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare
 v_actor uuid:=auth.uid();
 v_order public.sales_orders%rowtype;
 v_delivery public.sales_order_deliveries%rowtype;
 v_code text;
 v_hash text;
 v_address text:=nullif(left(btrim(coalesce(p_address,'')),500),'');
begin
 if v_actor is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.delivery.manage')
 then raise exception 'Sem permissão para gerenciar entregas.' using errcode='42501'; end if;
 if p_method not in ('pickup','delivery') or p_method is null
 then raise exception 'Selecione retirada ou entrega.' using errcode='22023'; end if;
 if p_method='delivery' and char_length(coalesce(v_address,''))<8
 then raise exception 'Informe o endereço completo da entrega.' using errcode='22023'; end if;
 select * into v_order from public.sales_orders where id=p_order_id and organization_id=p_organization_id for update;
 if not found or v_order.status<>'confirmed' or v_order.fulfillment_status='delivered'
 then raise exception 'Pedido não pode mais alterar a entrega.' using errcode='22023'; end if;
 select * into v_delivery from public.sales_order_deliveries
 where organization_id=p_organization_id and order_id=p_order_id for update;
 if found and v_delivery.completed_at is not null then
   raise exception 'Entrega concluída não pode ser alterada.' using errcode='22023'; end if;
 if p_method='pickup' and
   (not found or v_delivery.method<>'pickup' or v_delivery.pickup_code_hash is null or coalesce(p_regenerate_code,false))
 then
   v_code:=lpad(((abs(hashtextextended(gen_random_uuid()::text,0))%1000000)::integer)::text,6,'0');
   v_hash:=extensions.crypt(v_code,extensions.gen_salt('bf',10));
 elsif p_method='pickup' then
   v_hash:=v_delivery.pickup_code_hash;
 end if;
 insert into public.sales_order_deliveries(
   organization_id,order_id,method,address_snapshot,expected_at,carrier_name,tracking_code,pickup_code_hash
 ) values(
   p_organization_id,p_order_id,p_method,v_address,p_expected_at,
   nullif(left(btrim(coalesce(p_carrier,'')),120),''),
   nullif(left(btrim(coalesce(p_tracking,'')),120),''),v_hash
 ) on conflict(organization_id,order_id) do update
  set method=excluded.method,address_snapshot=excluded.address_snapshot,
      expected_at=excluded.expected_at,carrier_name=excluded.carrier_name,
      tracking_code=excluded.tracking_code,pickup_code_hash=excluded.pickup_code_hash,
      updated_at=now();
 insert into public.sales_order_events(organization_id,order_id,event_type,event_data,created_by)
 values(p_organization_id,p_order_id,'delivery_configured',
   jsonb_build_object('method',p_method,'expected_at',p_expected_at,'tracking',p_tracking,
   'pickup_pin_regenerated',v_code is not null),v_actor);
 return jsonb_build_object('method',p_method,'pickup_code',v_code,'configured',true);
end;$function$;

create or replace function public.complete_sales_order_delivery_v1(
 p_organization_id uuid,p_order_id uuid,p_recipient_name text,
 p_recipient_document text default null,p_pickup_code text default null,
 p_proof_media_id uuid default null,p_proof_notes text default null
) returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare
 v_actor uuid:=auth.uid();
 v_order public.sales_orders%rowtype;
 v_delivery public.sales_order_deliveries%rowtype;
 v_name text:=left(btrim(coalesce(p_recipient_name,'')),160);
begin
 if v_actor is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.delivery.manage')
 then raise exception 'Sem permissão para confirmar retirada ou entrega.' using errcode='42501'; end if;
 if length(v_name)<3 then raise exception 'Identifique quem recebeu o pedido.' using errcode='22023'; end if;
 select * into v_order from public.sales_orders
 where organization_id=p_organization_id and id=p_order_id for update;
 if not found or v_order.status<>'confirmed' or v_order.fulfillment_status<>'ready'
 then raise exception 'Pedido deve estar pronto para registrar a entrega.' using errcode='22023'; end if;
 select * into v_delivery from public.sales_order_deliveries
 where organization_id=p_organization_id and order_id=p_order_id for update;
 if not found or v_delivery.completed_at is not null then
   raise exception 'Configure primeiro a entrega ou retirada.' using errcode='22023'; end if;
 if v_delivery.method='pickup' and (
   p_pickup_code is null or p_pickup_code !~ '^[0-9]{6}$'
   or extensions.crypt(p_pickup_code,v_delivery.pickup_code_hash)<>v_delivery.pickup_code_hash
 ) then raise exception 'Código de retirada inválido.' using errcode='22023'; end if;
 if p_proof_media_id is not null and not exists (
   select 1 from public.media m where m.id=p_proof_media_id
     and m.organization_id=p_organization_id
 ) then raise exception 'Comprovante de imagem não pertence à empresa.' using errcode='42501'; end if;
 if v_delivery.method='delivery' and p_proof_media_id is null
   and char_length(btrim(coalesce(p_proof_notes,'')))<10 then
   raise exception 'Entrega externa requer foto ou descrição do comprovante (mínimo 10 caracteres).' using errcode='22023';
 end if;
 update public.sales_order_deliveries set
   recipient_name=v_name,recipient_document=nullif(left(btrim(coalesce(p_recipient_document,'')),30),''),
   recipient_acknowledged=true,proof_media_id=p_proof_media_id,
   proof_notes=nullif(left(btrim(coalesce(p_proof_notes,'')),1000),''),
   completed_at=now(),completed_by=v_actor,updated_at=now()
 where id=v_delivery.id and organization_id=p_organization_id;
 update public.sales_orders set fulfillment_status='delivered',fulfilled_at=now(),updated_at=now()
 where id=p_order_id and organization_id=p_organization_id;
 insert into public.sales_order_events(organization_id,order_id,event_type,event_data,created_by)
 values(p_organization_id,p_order_id,'delivery_completed',
   jsonb_build_object('method',v_delivery.method,'recipient',v_name,
   'proof_media_id',p_proof_media_id,'notes',left(btrim(coalesce(p_proof_notes,'')),1000)),
   v_actor);
 return jsonb_build_object('status','delivered','recipient',v_name,'completed',true);
end;$function$;

revoke all on function public.reserve_sales_proposal_v1(uuid,uuid,integer) from public,anon;
revoke all on function public.release_sales_proposal_reservation_v1(uuid,uuid,text) from public,anon;
revoke all on function public.configure_sales_order_delivery_v1(uuid,uuid,text,text,timestamptz,text,text,boolean) from public,anon;
revoke all on function public.complete_sales_order_delivery_v1(uuid,uuid,text,text,text,uuid,text) from public,anon;
grant execute on function public.reserve_sales_proposal_v1(uuid,uuid,integer) to authenticated;
grant execute on function public.release_sales_proposal_reservation_v1(uuid,uuid,text) to authenticated;
grant execute on function public.configure_sales_order_delivery_v1(uuid,uuid,text,text,timestamptz,text,text,boolean) to authenticated;
grant execute on function public.complete_sales_order_delivery_v1(uuid,uuid,text,text,text,uuid,text) to authenticated;
commit;