import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = file => readFileSync(file,"utf8");

test("Tipo de atendimento controla cobrança ao cliente sem alterar tipos já existentes", async()=>{
  const config = read("src/features/service-types/presentation/ServiceTypesAdminPanel.tsx");
  const repo = read("src/features/orders/infrastructure/orders.repository.ts");
  const sql = read("supabase/migrations/20261117192000_partner_warranty_receivable_on_completion.sql");
  assert.match(config,/label="Cobrar pagamento do cliente"/);
  assert.match(config,/charge_customer: true/);
  assert.match(config,/charge_customer: item\.charge_customer !== false/);
  assert.match(config,/charge_customer: form\.is_disposal \|\| form\.charge_customer/);
  assert.match(repo,/is_disposal,charge_customer/);
  assert.match(sql,/ADD COLUMN IF NOT EXISTS charge_customer boolean NOT NULL DEFAULT true/i);
  assert.match(sql,/'charge_customer', item\.charge_customer/);
  assert.ok((await transformWithEsbuild(config,"ServiceTypesAdminPanel.tsx",{loader:"tsx"})).code.length>200);
});

test("Conclusão de garantia gera conta a receber de parceiro, cliente zero e nenhuma baixa antecipada", async()=>{
  const hook = read("src/features/orders/application/useOrderCompletion.ts");
  const modal = read("src/features/orders/presentation/OrderCompletionModal.tsx");
  const finance = read("src/features/orders/infrastructure/order-finance.repository.ts");
  const source = read("src/features/finance/presentation/FinanceEntrySourceBlock.tsx");
  const listing = read("src/features/finance/presentation/FinanceEntriesSection.tsx");
  const sql = read("supabase/migrations/20261117192000_partner_warranty_receivable_on_completion.sql");

  assert.match(hook,/const noCustomerCharge = detail\?\.service_type\?\.charge_customer === false/);
  assert.match(hook,/partner_receivable: \{/);
  assert.match(hook,/warrantyReceivableValidationMessage/);
  assert.match(hook,/targetCoverageFree \|\| targetNoCustomerCharge \? 0/);
  assert.match(hook,/config\.payment_enabled && !freeCoverage/);
  assert.match(hook,/completeServiceOrderWithFinance/);
  assert.match(modal,/title="Conta a receber do fabricante"/);
  assert.match(modal,/Valor a receber do parceiro/);
  assert.match(modal,/Abrir em Contas a Receber/);
  assert.match(finance,/roles\.role", "partner"|roles\.role","partner"/);
  assert.match(sql,/v_partner_amount<=0/);
  assert.match(sql,/v_final_total<>0/);
  assert.match(sql,/v_entry_id:=private\.create_integrated_financial_entry\(/);
  assert.match(sql,/'billing_model','partner_warranty'/);
  assert.match(sql,/join public\.entity_roles er on er\.entity_id=e\.id and er\.role='partner'/);
  assert.match(sql,/'approved', v_user_id/);
  assert.match(source,/source\.billing_model === "partner_warranty"/);
  assert.match(listing,/Garantia · Fabricante/);
  for(const [name,content] of [["useOrderCompletion.ts",hook],["OrderCompletionModal.tsx",modal],["order-finance.repository.ts",finance],["FinanceEntrySourceBlock.tsx",source]]){
    assert.ok((await transformWithEsbuild(content,name,{loader:name.endsWith(".tsx")?"tsx":"ts"})).code.length>200,name);
  }
});
