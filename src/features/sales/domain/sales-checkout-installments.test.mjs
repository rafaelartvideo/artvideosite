import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path,"utf8");
async function loadPaymentHelpers() {
  const path = "src/features/sales/domain/sales-payment-schedule.ts";
  const compiled = await transformWithEsbuild(read(path),path,{loader:"ts",target:"es2020",format:"esm"});
  return import("data:text/javascript;base64,"+Buffer.from(compiled.code).toString("base64"));
}

test("valores monetários brasileiros mantêm centavos precisos", async()=>{
  const {parseSalesMoney,salesMoneyText} = await loadPaymentHelpers();
  assert.equal(parseSalesMoney("0,29"),0.29);
  assert.equal(parseSalesMoney("R$ 1.234,56"),1234.56);
  assert.equal(parseSalesMoney("12,50"),12.5);
  assert.equal(parseSalesMoney("1.234"),1234);
  assert.equal(parseSalesMoney(""),0);
  assert.equal(salesMoneyText(14.5),"14,50");
  assert.ok(Number.isNaN(parseSalesMoney("-10")));
  assert.ok(Number.isNaN(parseSalesMoney("1,234")));
  assert.ok(Number.isNaN(parseSalesMoney("1e5")));
});

test("parcelamento calcula em centavos e não perde valores", async()=>{
  const {splitSalesInstallments} = await loadPaymentHelpers();
  const installments = splitSalesInstallments(100,3,"2026-11-30");
  assert.deepEqual(installments.map(item=>item.amount),[33.34,33.33,33.33]);
  assert.deepEqual(installments.map(item=>item.dueDate),["2026-11-30","2026-12-30","2027-01-30"]);
  assert.equal(installments.reduce((sum,item)=>sum+Math.round(item.amount*100),0),10000);
  assert.deepEqual(splitSalesInstallments(0.02,3,"2026-11-30"),[]);
  assert.deepEqual(splitSalesInstallments(100,13,"2026-11-30"),[]);
  assert.deepEqual(splitSalesInstallments(-5,2,"2026-11-30"),[]);
});

test("datas mensais são ancoradas e respeitam o fim dos meses", async()=>{
  const {salesMonthlyDate}=await loadPaymentHelpers();
  assert.equal(salesMonthlyDate("2027-01-31",1),"2027-02-28");
  assert.equal(salesMonthlyDate("2027-01-31",2),"2027-03-31");
  assert.equal(salesMonthlyDate("2028-01-31",1),"2028-02-29");
});

test("checkout comercial deixa a entrada fácil, sem duplicar controle do PDV", async()=>{
  const path="src/features/sales/presentation/SalesCheckoutDialog.tsx";
  const component=read(path);
  const compiled=await transformWithEsbuild(component,path,{loader:"tsx"});
  assert.ok(compiled.code.length>1000);
  for(const phrase of ["full","deposit","later","Adicionar forma de pagamento",
    "Primeiro vencimento","splitInstallments(remaining, futureCount, firstDueDate)",
    "receivedConfirmed","installmentCount", "Recebido", "A receber"]) {
    assert.ok(component.includes(phrase),phrase);
  }
  assert.doesNotMatch(component,/PdvSaleWorkspace|loadPdvBootstrap|finalizePdvSale/);
  const repository=read("src/features/sales/infrastructure/sales.repository.ts");
  assert.match(repository,/"create_sales_order_v2"/);
  assert.match(repository,/received_payments/);
  assert.match(repository,/installment_count/);
  assert.match(repository,/first_due_date/);
});

test("motor v2 valida no servidor totais, parcelas, idempotência e conta financeira",()=>{
  const sql=read("supabase/migrations/20261108180000_sales_checkout_mixed_payments_installments.sql");
  for (const statement of [
    "create or replace function public.create_sales_order_v2",
    "sales_orders_payment_status_check",
    "'partial'",
    "private.has_tenant_module_permission(p_organization_id,'sales','sales.create')",
    "pg_advisory_xact_lock",
    "v_payment_methods:=array_append",
    "v_received_total>v_total",
    "v_raw_amount<>round(v_raw_amount,2)",
    "v_remaining_cents",
    "v_remainder_cents",
    "make_interval(months=>v_due_index-1)",
    "financial_installments",
    "financial_settlements",
    "private.finance_post_settlement_movements",
    "inventory_movements",
    "financial_entries",
    "grant execute on function public.create_sales_order_v2",
  ]) assert.ok(sql.includes(statement),statement);
  assert.doesNotMatch(sql,/insert into public\.pdv_sales|insert into public\.pdv_sale_payments/);
});

test("pedido comercial mostra parcelas reais e abre o lançamento financeiro certo",async()=>{
  const sql=read("supabase/migrations/20261108181000_sales_order_installments_detail.sql");
  assert.match(sql,/financial_installments/);
  assert.match(sql,/'installments',v_installments/);
  assert.match(sql,/when i\.due_date<current_date then 'overdue'/);
  const path="src/features/sales/presentation/SalesOrderDetailDialog.tsx";
  const source=read(path);
  const compiled=await transformWithEsbuild(source,path,{loader:"tsx"});
  assert.ok(compiled.code.length>1000);
  assert.match(source,/Parcelas e vencimentos/);
  assert.match(source,/Receber no Financeiro/);
  assert.match(source,/hasPermission\("finance\.receivables\.view"\)/);
  assert.match(source,/\/admin\/finance\/receivables\//);
});
