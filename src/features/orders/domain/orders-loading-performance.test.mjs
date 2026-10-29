import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");

test("tabela de OS só espera lista paginada e não o RPC amplo de referências", () => {
  const list = read("src/features/orders/presentation/OrdersListWorkspace.tsx");
  const tab = read("src/features/orders/presentation/TabOrders.tsx");
  assert.match(list, /const loading = listLoading;/);
  assert.doesNotMatch(list, /const loading = workspace\.loading \|\| listLoading/);
  assert.match(tab, /loading: ordersLoading/);
  assert.doesNotMatch(tab, /workspaceLoading \|\| ordersLoading/);
  assert.match(list, /workspace\.loading \? <LoadingState text="Preparando quadro de ordens"/);
  assert.match(list, /filters\.error && !filteredOrders\.length && !loading/);
});

test("lentidão da lista e do carregamento auxiliar é registrada separadamente sem PII", () => {
  const filters = read("src/features/orders/application/useOrderFilters.ts");
  const workspace = read("src/features/orders/application/useOrdersWorkspace.ts");
  assert.match(filters, /\[PERF\]\[OS\] Lista lenta/);
  assert.match(workspace, /\[PERF\]\[OS\] Referências lentas/);
  for (const src of [filters, workspace]) {
    assert.match(src, /elapsed >= 3000/);
    assert.match(src, /duration_ms: elapsed/);
    assert.doesNotMatch(src, /console\.warn\(.*organizationId/);
  }
  assert.match(filters, /listServiceOrdersPageWithCustomerName/);
  assert.match(workspace, /fetchOrdersWorkspace/);
});

test("filtros e paginação continuam consultando dados completos sem descartar dados da lista",()=>{
  const filters = read("src/features/orders/application/useOrderFilters.ts");
  assert.match(filters, /pageSize,/);
  assert.match(filters, /customerNameSearch: debouncedCustomerNameSearch/);
  assert.match(filters, /documentSearch: debouncedDocumentSearch/);
  assert.match(filters, /sort: orderSort/);
  assert.match(filters, /matchOrderNumberOrExternal/);
  assert.match(filters, /placeholderData: keepPreviousData/);
});

test("fechar uma OS troca lista e detalhe na mesma rota sem flash ou reset do scroll", () => {
  const admin = read("src/app/Admin.tsx");
  const tab = read("src/features/orders/presentation/TabOrders.tsx");
  const detail = read("src/features/orders/presentation/OrderDetailsPage.tsx");

  assert.match(admin, /ordersListScrollRef\.current = contentRef\.current\?\.scrollTop/);
  assert.match(admin, /root\.scrollTop = ordersListScrollRef\.current/);
  assert.match(admin, /useLayoutEffect\(\(\) => \{ if \(!route\.resourceId\) setPage\(null\)/);
  assert.doesNotMatch(admin, /if \(!resourceId\) setPage\(null\)/);

  assert.match(tab, /visible=\{!detailOnly && !initialOrderId && !editingRouteActive && !formOpen && !solveOpen && \(!detail \|\| Boolean\(onOrderRouteChange\)\)\}/);
  assert.match(tab, /visible=\{Boolean\(detail && !solveOpen && !editingRouteActive && \(!onOrderRouteChange \|\| initialOrderId\)\)\}/);
  assert.match(detail, /if \(onClose\) onClose\(\);\s*else closeDetail\(\);/);
  assert.match(detail, /onClose=\{closePage\} smoothMotion=\{false\}/);
});
