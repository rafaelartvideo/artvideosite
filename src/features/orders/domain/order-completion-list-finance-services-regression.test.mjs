import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("Concluir pela lista preserva a rota e carrega o detalhe real antes de abrir", async () => {
  const list = read("src/features/orders/presentation/TabOrders.tsx");
  const details = read("src/features/orders/application/useOrderDetails.ts");
  const modals = read("src/features/orders/presentation/OrderWorkflowModals.tsx");
  for (const [path, code] of [["TabOrders.tsx",list],["useOrderDetails.ts",details],["OrderWorkflowModals.tsx",modals]]) {
    const compiled = await transformWithEsbuild(code, path, { loader: "tsx" });
    assert.ok(compiled.code.length > 0);
  }
  assert.match(list, /const openCompletionFromList = \(order: any\) => \{[\s\S]*?setCompletionFromListId\(order\.id\);[\s\S]*?openFreshDetail\(order\);/);
  const onList = list.split("const openCompletionFromList = (order: any) => {")[1].split("\n  };")[0];
  assert.doesNotMatch(onList, /openRoutedDetail\(|onOrderRouteChange\(/);
  assert.match(list, /detail\?\.id !== completionFromListId\) return/);
  assert.match(list, /completionController\.openCompletion\(detail\)/);
  assert.match(list, /visible=\{Boolean\(detail && !completionFromListId/);
  assert.match(list, /LoadingState text="Preparando conclusão\.\.\."/);
  assert.match(list, /completionPreparing=\{Boolean\(completionFromListId && !detailsController\.detailReady\)\}/);
  assert.match(modals, /preparing=\{completionPreparing\}/);
  assert.match(details, /hydratedOrderId === selectedOrder\?\.id/);
});

test("tela de conclusão espera dados essenciais e mostra certificação na segunda coluna", async () => {
  const modal = read("src/features/orders/presentation/OrderCompletionModal.tsx");
  const compiled = await transformWithEsbuild(modal, "OrderCompletionModal.tsx", { loader: "tsx" });
  assert.ok(compiled.code.length > 0);
  assert.match(modal, /const preparingConclusion = preparing/);
  assert.match(modal, /completion\.paymentProofRequirementLoading/);
  assert.match(modal, /LoadingState text="Preparando conclusão\.\.\."/);
  assert.match(modal, /grid min-w-0 items-start gap-4 lg:grid-cols-2/);
  assert.match(modal, /<Section title="Produtos e serviços">/);
  assert.match(modal, /<Section title="Certificado de garantia">/);
  assert.match(modal, /Nenhum serviço cadastrado\./);
  assert.match(modal, /Nenhum produto utilizado\./);
  assert.match(modal, /text-center text-sm text-muted-foreground/);
  assert.match(modal, /\{hasProducts && <strong/);
  assert.doesNotMatch(modal, /Nenhum serviço foi adicionado à composição desta OS/);
});

test("lançamentos financeiros usam snapshots dos nomes reais dos serviços da OS", async () => {
  const ui = read("src/features/finance/presentation/FinanceEntrySourceBlock.tsx");
  const migration = read("supabase/migrations/20261106200000_finance_order_service_titles_snapshot.sql");
  const compiled = await transformWithEsbuild(ui, "FinanceEntrySourceBlock.tsx", { loader: "tsx" });
  assert.ok(compiled.code.length > 0);
  assert.match(ui, /Array\.isArray\(source\.service_names\)/);
  assert.match(ui, /serviceNames\.join\(", "\)/);
  assert.match(migration, /before insert on public\.financial_entries/);
  assert.match(migration, /i\.item_type in \('service', 'custom_service'\)/);
  assert.match(migration, /update public\.financial_entries e/);
  assert.match(migration, /source_details = coalesce\(e\.source_details/);
});

test("falha ao preparar a conclusão mostra erro e permite tentar novamente sem trocar de rota", () => {
  const tab = read("src/features/orders/presentation/TabOrders.tsx");
  const details = read("src/features/orders/application/useOrderDetails.ts");
  assert.match(tab, /detailsController\.detailLoadError/);
  assert.match(tab, /Não foi possível preparar a conclusão/);
  assert.match(tab, /detailsController\.retryDetailLoad\(\)/);
  assert.match(tab, />Tentar novamente<\/AdminButton>/);
  assert.match(details, /detailLoadError: selectedOrderBelongsToOrganization \? detailQuery\.error : null/);
  assert.match(details, /retryDetailLoad: \(\) => detailQuery\.refetch\(\)/);
});
