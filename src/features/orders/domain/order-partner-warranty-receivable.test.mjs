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

test("Garantia conclui OS sem dados financeiros e cria título pendente para dar baixa",async()=>{
  const hook=read("src/features/orders/application/useOrderCompletion.ts");
  const modal=read("src/features/orders/presentation/OrderCompletionModal.tsx");
  const listing=read("src/features/finance/presentation/FinanceEntriesSection.tsx");
  const source=read("src/features/finance/presentation/FinanceEntrySourceBlock.tsx");
  const setup=read("src/features/finance/presentation/FinanceWarrantyReceivableSetup.tsx");
  const repository=read("src/features/finance/infrastructure/finance-warranty-receivables.repository.ts");
  const sql=read("supabase/migrations/20261117195000_defer_warranty_receivable_details_to_finance.sql");

  assert.match(hook,/const noCustomerCharge = detail\?\.service_type\?\.charge_customer === false/);
  assert.match(hook,/if \(noCustomerCharge\) return \{ installments: \[\], payments: \[\] as \[\]/);
  assert.doesNotMatch(hook,/warrantyPayerId|warrantyReceivableValue|partner_receivable: \{/);
  assert.match(hook,/targetCoverageFree \|\| targetNoCustomerCharge \? 0/);
  assert.match(hook,/config\.payment_enabled && !freeCoverage/);
  assert.match(modal,/completion\.noCustomerCharge \? \(/);
  assert.match(modal,/onde os dados do fabricante e o pagamento serão informados ao dar baixa/);
  assert.doesNotMatch(modal,/title="Conta a receber do fabricante"|label="Valor a receber do parceiro"/);
  assert.match(modal,/showPrices=\{!completion\.noCustomerCharge\}/);
  assert.match(modal,/Abrir em Contas a Receber/);
  assert.match(listing,/FinanceWarrantyReceivableSetup/);
  assert.match(listing,/warrantyNeedsDetails\(entry\)/);
  assert.match(source,/source\.receivable_status==="pending_details"/);
  assert.match(setup,/Fabricante \/ parceiro responsável/);
  assert.match(setup,/Valor a receber/);
  assert.match(setup,/Vencimento/);
  assert.match(setup,/Observações/);
  assert.match(setup,/Continuar para baixa/);
  assert.match(repository,/prepare_warranty_receivable_v1/);
  assert.match(sql,/original_amount=0 and entry_type='receivable'/);
  assert.match(sql,/'receivable_status','pending_details'/);
  assert.match(sql,/v_order\.organization_id,'receivable'/);
  assert.match(sql,/finance\.settlements\.create/);
  assert.match(sql,/warranty_receivable_configured/);
  assert.match(sql,/v_amount<=0/);
  for(const [name,content] of [
    ["useOrderCompletion.ts",hook],["OrderCompletionModal.tsx",modal],
    ["FinanceEntriesSection.tsx",listing],["FinanceWarrantyReceivableSetup.tsx",setup],
    ["finance-warranty-receivables.repository.ts",repository],["FinanceEntrySourceBlock.tsx",source],
  ]){
    assert.ok((await transformWithEsbuild(content,name,{loader:name.endsWith(".tsx")?"tsx":"ts"})).code.length>200,name);
  }
});
