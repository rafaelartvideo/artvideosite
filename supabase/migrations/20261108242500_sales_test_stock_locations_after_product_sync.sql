begin;
-- O gatilho de sincronização de Produtos cria automaticamente os itens do Estoque
-- com saldo zero. Preencher somente esses itens novos de homologação, sem tocar em terceiros.
do $$
declare v_org constant uuid:='5bcd7ec7-38f0-4dda-a84c-10429bd46b23';
v_count integer;
begin
 if (select name from public.organizations where id=v_org) is distinct from 'Teste'
 then raise exception 'Execução permitida somente na empresa Teste.' using errcode='42501'; end if;
 update public.inventory_items i set
   quantity=case when mod(right(p.sku,2)::integer,10)=0 then 0
     else 12+2*right(p.sku,2)::integer end,
   min_quantity=4,
   purchase_price=round(p.price*0.43,2),
   average_cost=round(p.price*0.43,2),
   storage_shelf='HML-'||chr(65+((right(p.sku,2)::integer-1)/5)),
   storage_level=((right(p.sku,2)::integer-1)%5+1)::text,
   storage_compartment='C-'||right(p.sku,2),
   updated_at=now()
 from public.products p
 where i.organization_id=v_org and i.product_id=p.id and p.organization_id=v_org
   and p.sku ~ '^HML26-[0-9]{2}$'
   and p.slug like 'homolog-vendas-2026-%'
   and i.quantity=0
   and i.storage_shelf is null and i.storage_level is null and i.storage_compartment is null
   and not exists(select 1 from public.inventory_movements m
       where m.organization_id=v_org and m.inventory_item_id=i.id)
   and not exists(select 1 from public.sales_stock_reservations r
       where r.organization_id=v_org and r.inventory_item_id=i.id and r.status='active');
 get diagnostics v_count=row_count;
 if v_count<>40 then
   raise exception 'Cadastro de homologação mudou durante a sincronização: % de 40 itens preparados.',v_count;
 end if;
end $$;
commit;