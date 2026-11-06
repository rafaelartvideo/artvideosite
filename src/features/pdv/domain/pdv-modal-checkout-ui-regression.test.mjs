import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (name) => readFileSync(new URL(`../presentation/${name}`, import.meta.url), "utf8");

test("PDV Vendas e Caixas são modais locais, sem modificar URL ou substituir página", () => {
  const routes = source("TabPdv.tsx");
  const sales = source("PdvSalesHistory.tsx");
  const cash = source("PdvCashReports.tsx");
  assert.match(routes, /const \[workspaceModal, setWorkspaceModal\] = useState<"sales" \| "cash" \| null>\(null\)/);
  assert.match(routes, /onClick=\{\(\) => setWorkspaceModal\("cash"\)\}/);
  assert.match(routes, /onClick=\{\(\) => setWorkspaceModal\("sales"\)\}/);
  assert.match(routes, /\{workspaceModal === "sales" && <AdminDialog/);
  assert.match(routes, /\{workspaceModal === "cash" && canViewCashReports && <AdminDialog/);
  assert.match(routes, /<PdvSalesHistory embedded/);
  assert.match(routes, /<PdvCashReports embedded/);
  assert.doesNotMatch(routes, /onRouteChange\?\.\("(?:sales|cash)", null\)/);
  assert.doesNotMatch(routes, /if \(routeResourceId === "sales"\) \{\s*return <AdminDialog/);
  assert.doesNotMatch(routes, /if \(routeResourceId === "cash" && canViewCashReports\) \{\s*return <AdminDialog/);
  assert.match(routes, /if \(routeResourceId === "sales" \|\| routeResourceId === "cash"\)/);
  assert.match(routes, /onRouteChange\?\.\(null, null\)/);
  assert.match(sales, /embedded = false/);
  assert.match(cash, /embedded = false/);
  assert.match(sales, /\{!embedded && <PageHeader/);
  assert.match(cash, /\{!embedded && <PageHeader/);
});

test("Suprimento é Estilo 3 e Sangria Estilo 4, alinhados ao centro", () => {
  const code = source("TabPdv.tsx");
  assert.match(code, /className="flex flex-wrap items-center justify-center gap-3"/);
  assert.match(code, /<AdminButton variant="tertiary" className="min-w-36 justify-center" onClick=\{\(\) => openCashDialog\("supply"\)\}/);
  assert.match(code, /<AdminButton variant="quaternary" className="min-w-36 justify-center" onClick=\{\(\) => openCashDialog\("withdraw"\)\}/);
  assert.match(code, /variant=\{cashDialog === "supply" \? "tertiary" : cashDialog === "withdraw" \? "quaternary" : "primary"\}/);
});

test("carrinho não corta controles de condição nem rolagem do dropdown", () => {
  const code = source("PdvSaleWorkspace.tsx");
  assert.match(code, /<ShoppingCart size=\{17\} \/> Carrinho/);
  assert.match(code, /className="h-fit overflow-visible"/);
  assert.match(code, /divide-y divide-\[#0d1b2e\]\/7 overflow-visible/);
  assert.doesNotMatch(code, /max-h-\[56vh\] divide-y/);
  assert.match(code, /<select value=\{item.condition\}/);
  assert.match(code, /min-h-\[42px\] w-full text-sm/);
});

test("finalização sem pagamento padrão exige escolha e valida por campo após tentativa", () => {
  const code = source("PdvSaleWorkspace.tsx");
  assert.match(code, /setPayments\(\[\]\);\s*setCheckoutAttempted\(false\);\s*setCheckoutOpen\(true\);/);
  assert.match(code, /const tryFinalizeSale = \(\) => \{/);
  assert.match(code, /setCheckoutAttempted\(true\);/);
  assert.match(code, /if \(checkoutInvalidReason \|\| finalizeMutation.isPending\) return/);
  assert.match(code, /checkoutAttempted && currencyNumber\(payment.amount\) <= 0/);
  assert.match(code, /checkoutAttempted && currencyNumber\(payment.tenderedAmount\) < currencyNumber\(payment.amount\)/);
  assert.doesNotMatch(code, /Todos os pagamentos precisam ter valor maior que zero/);
  assert.doesNotMatch(code, /Venda pronta\. Pressione F4 para finalizar/);
  assert.doesNotMatch(code, /Pagamento fechado/);
  assert.doesNotMatch(code, /sticky bottom-0 rounded-xl border border-border bg-card p-4/);
});

test("documento do comprador é mascarado em venda e histórico", () => {
  const code = source("PdvSaleWorkspace.tsx");
  const history = source("PdvSalesHistory.tsx");
  assert.match(code, /formatPdvDocument\(selectedCustomer.document\)/);
  assert.match(code, /formatPdvDocument\(buyerDocument\)/);
  assert.match(code, /formatCpf\(digits\)/);
  assert.match(code, /formatCnpj\(digits\)/);
  assert.match(history, /formatPdvDocument\(sale.customer_document\)/);
  assert.match(history, /formatPdvDocument\(detail.customer_document\)/);
});

test("tipografia mínima do PDV aumenta sem alterar campos globais do CRM", () => {
  for (const filename of ["TabPdv.tsx", "PdvSaleWorkspace.tsx", "PdvSalesHistory.tsx", "PdvCashReports.tsx"]) {
    const code = source(filename);
    assert.doesNotMatch(code, /text-\[(8|9)px\]/, filename);
  }
});
