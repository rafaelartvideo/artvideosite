import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path,"utf8");

test("Vendas oferece Vitrine e Pedidos sem perder modo CRM da Union", async () => {
  const tab = read("src/features/sales/presentation/TabSales.tsx");
  const list = read("src/features/sales/presentation/SalesOrdersPage.tsx");
  const details = read("src/features/sales/presentation/SalesOrderDetailDialog.tsx");
  const repository = read("src/features/sales/infrastructure/sales-orders.repository.ts");
  const domain = read("src/features/sales/domain/sales-order-display.ts");
  for (const [path,content] of [
    ["src/features/sales/presentation/TabSales.tsx",tab],
    ["src/features/sales/presentation/SalesOrdersPage.tsx",list],
    ["src/features/sales/presentation/SalesOrderDetailDialog.tsx",details],
    ["src/features/sales/infrastructure/sales-orders.repository.ts",repository],
    ["src/features/sales/domain/sales-order-display.ts",domain],
  ]) {
    const result = await transformWithEsbuild(content,path,{loader:path.endsWith(".tsx")?"tsx":"ts"});
    assert.ok(result.code.length>100,path);
  }
  assert.match(tab,/currentView === "orders"/);
  assert.match(tab,/<SalesOrdersPage/);
  assert.match(tab,/salesModeSuffix/);
  assert.match(tab,/\?mode=crm/);
  assert.match(tab,/navigate\("\/admin\/sales\/orders" \+ salesModeSuffix\)/);
  assert.match(list,/listSalesOrders\(organizationId,filters\)/);
  assert.match(list,/Pedido, cliente, produto ou SKU/);
  assert.match(list,/Situação comercial/);
  assert.match(list,/Pagamento/);
  assert.match(list,/PaginationBar/);
  assert.match(details,/getSalesOrderDetail\(organizationId, orderId\)/);
  assert.match(details,/Separação e entrega/);
  assert.match(details,/Histórico/);
});

test("listas refletem recebimentos no Financeiro e não apenas status gravado na venda",()=>{
  const sql=read("supabase/migrations/20261108124500_union_sales_orders_management.sql");
  assert.match(sql,/create or replace function public.list_sales_orders_v1/);
  assert.match(sql,/create or replace function public.get_sales_order_detail_v1/);
  assert.match(sql,/sum\(i\.settled_amount\)/);
  assert.match(sql,/when b\.received_amount>0 then 'partial'/);
  assert.match(sql,/when v_received>0 then 'partial'/);
  assert.match(sql,/left join public\.profiles/);
  assert.match(sql,/sales_order_events/);
  assert.match(sql,/p_organization_id,'sales','sales\.view'/);
  assert.match(sql,/order by created_at desc,order_number desc/);
  const aliasFix=read("supabase/migrations/20261108130000_union_sales_order_list_payment_alias.sql");
  assert.match(aliasFix,/end as payment_status/);
  assert.match(aliasFix,/coalesce\(p_payment,'all'\)='all' or payment_status=p_payment/);
  assert.doesNotMatch(aliasFix,/effective_payment_status/);
});

test("cancelamento exige permissão própria e não desfaz recebimento existente",()=>{
  const sql=read("supabase/migrations/20261108124500_union_sales_orders_management.sql");
  const idx=sql.indexOf("create or replace function public.cancel_sales_order_v1");
  assert.ok(idx>0);
  const cancel=sql.slice(idx);
  for(const check of [
    "sales.cancel",
    "fulfillment_status<>'pending'",
    "v_inst.settled_amount<>0",
    "public.financial_settlements s",
    "approval_status='cancelled'",
    "public.inventory_movements",
    "'IN',v_line.base_quantity",
    "quantity=quantity+v_line.base_quantity",
    "cancellation_reason=v_reason",
    "'stock_reversed',true",
  ]) assert.ok(cancel.includes(check),check);
  assert.doesNotMatch(cancel,/delete from public\.financial_entries|delete from public\.inventory_movements/);
  const details=read("src/features/sales/presentation/SalesOrderDetailDialog.tsx");
  assert.match(details,/hasPermission\("sales\.cancel"\)/);
  assert.match(details,/order\.received_amount === 0/);
  assert.match(details,/order\.settlements\.length === 0/);
  assert.match(details,/order\.fulfillment_status === "pending"/);
});

test("separação avança em sequência e não realiza nova baixa de estoque",()=>{
  const sql=read("supabase/migrations/20261108124500_union_sales_orders_management.sql");
  const start=sql.indexOf("create or replace function public.update_sales_order_fulfillment_v1");
  const end=sql.indexOf("create or replace function public.cancel_sales_order_v1",start);
  const fulfillment=sql.slice(start,end);
  assert.match(fulfillment,/sales\.orders\.manage/);
  assert.match(fulfillment,/v_order\.fulfillment_status='pending' and p_next_status='separating'/);
  assert.match(fulfillment,/v_order\.fulfillment_status='separating' and p_next_status='ready'/);
  assert.match(fulfillment,/v_order\.fulfillment_status='ready' and p_next_status='delivered'/);
  assert.doesNotMatch(fulfillment,/insert into public\.inventory_movements/);
});

test("mudanças usam RPCs próprias sem reintroduzir checkout PDV",()=>{
  const repo=read("src/features/sales/infrastructure/sales-orders.repository.ts");
  assert.match(repo,/"list_sales_orders_v1"/);
  assert.match(repo,/"get_sales_order_detail_v1"/);
  assert.match(repo,/"update_sales_order_fulfillment_v1"/);
  assert.match(repo,/"cancel_sales_order_v1"/);
  assert.doesNotMatch(repo,/finalize_pdv_sale_v1|finalizePdvSale/);
  const sql=read("supabase/migrations/20261108124500_union_sales_orders_management.sql");
  assert.match(sql,/sales_orders_tenant_status_date_idx/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on public\.sales_order_events from anon,authenticated/);
  assert.match(sql,/sales_order_created_event_v1/);
});
