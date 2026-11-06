import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("Buscar OS combina dois campos dentro de um controle, inclusive no celular", async () => {
  const ui = read("src/features/orders/presentation/OrdersFilters.tsx");
  const workspace = read("src/features/orders/presentation/OrdersListWorkspace.tsx");
  const screen = read("src/features/orders/presentation/TabOrders.tsx");
  for (const [path, source] of [
    ["OrdersFilters.tsx", ui],
    ["OrdersListWorkspace.tsx", workspace],
  ]) {
    assert.ok((await transformWithEsbuild(source, path, { loader: "tsx" })).code);
  }
  assert.match(ui, /function OrderNumbersField\(/);
  assert.match(ui, /<OrderNumbersField osNumberSearch=\{osNumberSearch\} externalOsSearch=\{externalOsSearch\}/);
  assert.match(ui, /aria-label="Número da OS \(exato\)"/);
  assert.match(ui, /aria-label="OS Externa \(parcial\)"/);
  assert.match(ui, /h-6 w-px shrink-0 bg-border/);
  assert.match(ui, /mobile \? "order-search-exact-mobile" : "order-search-exact-desktop"/);
  assert.match(ui, /mobile \? "order-search-external-mobile" : "order-search-external-desktop"/);
  assert.match(screen, /matchOrderNumberOrExternal: Boolean\(scopedReadOnly \|\| workspaceBase\.isOrganizationOverride\)/);
  assert.match(workspace, /externalOsSearch=\{externalOsSearch\}/);
  assert.match(workspace, /onExternalOsSearchChange=\{\(value\) => \{ setExternalOsSearch\(value\); setPage\(1\); \}\}/);
});

test("labels de Número da OS / OS externa seguem o mesmo tamanho de Data inicial / final", () => {
  const ui = read("src/features/orders/presentation/OrdersFilters.tsx");
  const numbers = ui.split("function OrderNumbersField(")[1].split("function OrderDateRangeField(")[0];
  const dates = ui.split("function OrderDateRangeField(")[1].split("function SearchField(")[0];
  const sharedLabelClass = /mb-1 flex min-w-0 text-\[11px\] font-bold uppercase tracking-wider/;
  assert.match(numbers, sharedLabelClass);
  assert.match(dates, sharedLabelClass);
  assert.match(numbers, /<span className="min-w-0 flex-1 pr-2">Número da OS<\/span>/);
  assert.match(numbers, /<span className="min-w-0 flex-1 pl-2">OS externa<\/span>/);
  assert.doesNotMatch(numbers, /<label\b/, "labels não podem herdar um tamanho global maior");
  assert.match(numbers, /<Search size=\{14\}/, "campo agrupado precisa de ícone de lupa à esquerda");
  assert.match(numbers, /mobile \? "h-\[42px\]" : "h-9"/);
  assert.match(numbers, /<span className="h-6 w-px shrink-0 bg-border"/);
});

test("número interno permanece exato; externo pesquisa qualquer trecho, preservando zeros", async () => {
  const source = read("src/features/orders/application/order-list.ts")
    .replace('import { normalizeSearchText } from "./order-search";',
      'const normalizeSearchText = value => String(value ?? "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").trim().toLowerCase().replace(/\\s+/g, " ");');
  const { code } = await transformWithEsbuild(source, "order-list.ts", { loader: "ts" });
  const { filterServiceOrders } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
  const orders = [
    { id: "a", os_number: "288", external_os_number: "000000078", created_at: "2026-11-06T10:00:00Z" },
    { id: "b", os_number: "2881", external_os_number: "000123456", created_at: "2026-11-06T10:00:00Z" },
    { id: "c", os_number: "390", external_os_number: "999000451", created_at: "2026-11-06T10:00:00Z" },
    { id: "d", os_number: "450", external_os_number: "451234999", created_at: "2026-11-06T10:00:00Z" },
  ];
  const find = (osNumberSearch = "", externalOsSearch = "") => filterServiceOrders({
    orders, osNumberSearch, externalOsSearch,
    documentSearch: "", statusId: "", situationId: "", orderType: "", serviceTypeId: "",
    states: [], stateOptions: [], cities: [], dateFrom: "", dateTo: "",
    invalidPeriod: false, getStateLabel: String, getEquipmentSummary: String,
  }).map(order => order.id);
  assert.deepEqual(find("288"), ["a"], "OS 288 não deve encontrar OS 2881");
  assert.deepEqual(find("", "000"), ["a", "b", "c"], "000 encontra qualquer trecho da OS externa");
  assert.deepEqual(find("", "000000078"), ["a"], "zeros à esquerda são preservados");
  assert.deepEqual(find("", "123"), ["b", "d"]);
  assert.deepEqual(find("288", "000"), ["a"], "ambos os campos atuam em conjunto");
});

test("consulta paginada encaminha os filtros separados e a migração aplica busca externa parcial", async () => {
  const hook = read("src/features/orders/application/useOrderFilters.ts");
  const repo = read("src/features/orders/infrastructure/orders-filtered-page.repository.ts");
  const sql = read("supabase/migrations/20261106141647_os_external_partial_search.sql");
  assert.match(hook, /externalOsSearch: debouncedExternalOsSearch/);
  assert.match(hook, /externalOsSearch: debouncedExternalOsSearch,/);
  assert.match(repo, /p_external_os_search: externalOsSearch/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.search_service_order_page_ids_v4_base/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.search_service_order_page_ids_v5_locations/);
  assert.equal((sql.match(/or position\(search\.external_needle in regexp_replace\(lower\(coalesce\(service_order\.external_os_number/g) || []).length, 2);
  assert.match(sql, /search\.os_needle = regexp_replace/);
  assert.match(sql, /private\.is_organization_member/);
  assert.match(sql, /limit greatest\(1, p_page_size\)/);
});
