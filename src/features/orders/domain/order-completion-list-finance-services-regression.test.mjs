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
  assert.match(list, /const detailPageVisible = Boolean\(detail && !completionFromListId/);
  assert.match(list, /<OrderDetailsPage[\s\S]*?visible=\{detailPageVisible\}/);
  assert.match(list, /<OrdersListWorkspace[\s\S]*?visible=\{[^\n]*Boolean\(completionFromListId\)/);
  assert.doesNotMatch(list, /\{completionFromListId && !completionFromListStarted && <AdminDialog/);
  assert.match(list, /completionPreparing=\{Boolean\(completionFromListId && !completionFromListReady\)\}/);
  assert.match(list, /completionFromListReady, setCompletionFromListReady/);
  assert.match(modals, /preparing=\{completionPreparing\}/);
  assert.match(details, /hydratedOrderId === selectedOrder\?\.id/);
});

test("tela de conclusão espera dados essenciais e mostra certificação na segunda coluna", async () => {
  const modal = read("src/features/orders/presentation/OrderCompletionModal.tsx");
  const compiled = await transformWithEsbuild(modal, "OrderCompletionModal.tsx", { loader: "tsx" });
  assert.ok(compiled.code.length > 0);
  assert.match(modal, /const preparingConclusion = preparing \|\| \(/);
  assert.match(modal, /completion\.paymentProofRequirementLoading/);
  assert.match(modal, /preparingText="Preparando conclusão\.\.\."/);
  assert.match(modal, /grid min-w-0 items-stretch gap-4 lg:grid-cols-2/);
  assert.match(modal, /<Section title="Produtos e serviços"/);
  assert.match(modal, /<Section title="Certificado de garantia"/);
  assert.match(modal, /Nenhum produto ou serviço utilizado\./);
  assert.match(modal, /!hasServices && !hasProducts/);
  assert.match(modal, /min-h-\[240px\] text-sm/);
  assert.match(modal, /hasServices \? "border-t border-border pt-2" : ""/);
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
  const modal = read("src/features/orders/presentation/OrderCompletionModal.tsx");
  assert.match(modal, /preparingError=\{preparingError\}/);
  assert.match(tab, /onRetryCompletionPreparation=\{\(\) => void detailsController\.retryDetailLoad\(\)\}/);
  assert.match(modal, /onRetryPreparing=\{onRetryPreparing\}/);
  assert.match(details, /detailLoadError: selectedOrderBelongsToOrganization \? detailQuery\.error : null/);
  assert.match(details, /retryDetailLoad: \(\) => detailQuery\.refetch\(\)/);
});

test("um único diálogo mantém Preparando conclusão sem remount ou segunda tela", () => {
  const list = read("src/features/orders/presentation/TabOrders.tsx");
  const modal = read("src/features/orders/presentation/OrderCompletionModal.tsx");
  const modals = read("src/features/orders/presentation/OrderWorkflowModals.tsx");
  assert.doesNotMatch(list, /completionFromListId && !completionFromListStarted && <AdminDialog/);
  assert.match(list, /const \[completionFromListReady, setCompletionFromListReady\] = useState\(false\)/);
  assert.match(list, /completionController\.commercialItemsLoading \|\| completionController\.financeOptionsLoading/);
  assert.match(list, /completionController\.warrantyLoading \|\| completionController\.paymentProofRequirementLoading/);
  assert.match(list, /setCompletionFromListReady\(true\)/);
  assert.match(list, /completionPrepareError=/);
  assert.match(list, /onRetryCompletionPreparation=/);
  assert.match(list, /onCancelCompletionPreparation=/);
  assert.match(modals, /preparingError=\{completionPrepareError\}/);
  assert.match(modal, /if \(\(!completion\.open && !preparing\) \|\| \(!detail && !preparing\)\) return null;/);
  assert.match(modal, /const preparingConclusion = preparing \|\|/);
  assert.match(modal, /if \(preparingConclusion\) \{/);
  assert.match(modal, /preparingError=\{preparingError\}/);
  assert.match(modal, /preparingText="Preparando conclusão\.\.\."/);
});

test("produtos e serviços mantêm uma divisória e altura idêntica à garantia", async () => {
  const modal = read("src/features/orders/presentation/OrderCompletionModal.tsx");
  const transformed = await transformWithEsbuild(modal, "OrderCompletionModal.tsx", { loader: "tsx" });
  assert.ok(transformed.code.length);
  assert.match(modal, /<Section title="Produtos e serviços"\s+className="flex h-\[360px\] min-h-0 flex-col"\s+contentClassName="min-h-0 flex-1 overflow-y-auto"/);
  assert.match(modal, /<Section title="Certificado de garantia"\s+className="flex h-\[360px\] min-h-0 flex-col"\s+contentClassName="min-h-0 flex-1 overflow-y-auto"/);
  assert.match(modal, /hasServices \? "border-t border-border pt-2" : ""/);
  assert.doesNotMatch(modal, /divide-y divide-border/);
  assert.doesNotMatch(modal, /Serviços registrados na composição da OS/);
  assert.doesNotMatch(modal, /Produtos da composição e peças utilizadas na solução sem duplicidade/);
  assert.match(modal, /Nenhum produto ou serviço utilizado\./);
  assert.match(modal, /text-base font-bold text-foreground/);
  assert.match(modal, /text-sm text-muted-foreground/);
  assert.match(modal, /bg-blue-500\/10 text-blue-700/);
  assert.match(modal, /bg-violet-500\/10 text-violet-700/);
});
