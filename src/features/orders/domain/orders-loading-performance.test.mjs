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

test("badges de documentos e de itens não aguardam repetição de consultas completas", () => {
  const docs = read("src/features/orders/application/useOrderSituationDocuments.ts");
  const order = read("src/features/orders/presentation/OrderDetailsPage.tsx");
  const quote = read("src/features/orders/presentation/OrderQuoteWorkspace.tsx");
  const repository = read("src/features/orders/infrastructure/order-quote.repository.ts");
  assert.match(docs, /countOrderSituationDocuments/);
  assert.match(docs, /documentsCount: countQuery\.data \?\? null/);
  assert.match(order, /Math\.max\(loadedDocumentCount, documents\.documentsCount \?\? 0\)/);
  assert.match(order, /items-overview/);
  assert.match(order, /queryClient\.fetchQuery/);
  assert.match(quote, /queryClient\.fetchQuery/);
  assert.match(quote, /queryClient\.setQueryData\(quoteKey, result\)/);
  assert.match(repository, /\[PERF\]\[OS\] Consulta do orçamento lenta/);
});

test("paginação de OS preserva linhas do cache em vez de voltar ao loading", () => {
  const filters = read("src/features/orders/application/useOrderFilters.ts");
  const addresses = read("src/features/orders/application/useOrderServiceAddress.ts");
  assert.match(filters, /ordersQuery\.isPending && !ordersQuery\.data/);
  assert.match(addresses, /useState<IbgeState\[\]>\(\(\) => cachedIbgeStates\)/);
  assert.match(addresses, /if \(!ibgeStatesRequest\)/);
});

test("referências da OS não fazem retry encadeado de até 42 segundos em timeout 500", () => {
  const ref = read("src/features/orders/infrastructure/orders-workspace.repository.ts");
  assert.match(ref, /AbortSignal\.timeout\(12_000\)/);
  assert.doesNotMatch(ref, /attempt < 2|30_000|requestReferences\(/);
  const workspace = read("src/features/orders/application/useOrdersWorkspace.ts");
  assert.match(workspace, /retry: false/);
});

test("Produtos e Serviços não reinicia RPCs de técnicos a cada atualização do badge", () => {
  const source = read("src/features/orders/presentation/OrderProductsServicesSection.tsx");
  const details = read("src/features/orders/presentation/OrderDetailsPage.tsx");
  assert.match(details, /onOverviewChange=\{handleItemsOverviewChange\}/);
  assert.match(details, /const handleItemsOverviewChange = useCallback\(/);
  assert.match(source, /const overviewCallbackRef = useRef\(onOverviewChange\)/);
  assert.match(source, /const publishOverview = useCallback\(/);
  assert.match(source, /overviewCallbackRef\.current\?\.\(/);
  assert.match(source, /\}, \[order\?\.id, editable, refreshTaskPhotos, publishOverview\]\)/);
  assert.doesNotMatch(source, /\[order\?\.id, editable, refreshTaskPhotos, onOverviewChange\]/);
  assert.match(source, /\}, \[loadItems, order\?\.id\]\)/);
});

test("Realtime conectado não dispara polling contínuo nem tempestade de assinaturas Storage", () => {
  const source = read("src/features/orders/presentation/OrderProductsServicesSection.tsx");
  assert.match(source, /if \(!subscribed && Date\.now\(\) - lastRefreshAt > 120_000\)/);
  assert.match(source, /\}, 120_000\)/);
  assert.doesNotMatch(source, /\}, 15000\)/);
  assert.match(source, /photoRetryAfterRef\.current\[path\] = Date\.now\(\) \+ 120_000/);
  assert.match(source, /Promise\.allSettled\(missing\.map/);
});
