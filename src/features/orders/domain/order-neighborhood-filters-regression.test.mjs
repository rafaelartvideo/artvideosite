import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("Buscar OS oferece seleção múltipla de bairros e grade sem campos solitários", async () => {
  const panel = read("src/features/orders/presentation/OrdersFilters.tsx");
  const workspace = read("src/features/orders/presentation/OrdersListWorkspace.tsx");
  for (const [file, contents] of [["OrdersFilters.tsx", panel], ["OrdersListWorkspace.tsx", workspace]]) {
    assert.ok((await transformWithEsbuild(contents, file, { loader: "tsx" })).code.length > 0);
  }
  assert.match(panel, /case "neighborhoods": return <OrderFilterMultiSelect/);
  assert.match(panel, /label="Estados"/);
  assert.match(panel, /label="Cidades"/);
  assert.match(panel, /label="Bairros"/);
  assert.match(panel, /grid grid-cols-3 items-start gap-2/);
  assert.match(panel, /xl:grid-cols-4/);
  assert.match(panel, /selectedNeighborhoodValues/);
  assert.match(panel, /selectedNeighborhoods\.length > 0/);
  assert.match(workspace, /onNeighborhoodSelect=/);
  assert.match(workspace, /onNeighborhoodRemove=/);
  assert.match(workspace, /neighborhoodOptions=\{neighborhoodFilterOptions\}/);
});

test("bairros filtram no Supabase antes da paginação, com estado do filtro em cache", async () => {
  const hook = read("src/features/orders/application/useOrderFilters.ts");
  const repo = read("src/features/orders/infrastructure/orders-filtered-page.repository.ts");
  for (const [file, contents] of [["useOrderFilters.ts", hook], ["orders-filtered-page.repository.ts", repo]]) {
    assert.ok((await transformWithEsbuild(contents, file, { loader: "ts" })).code.length > 0);
  }
  assert.match(hook, /listOrderNeighborhoodOptions\(organizationId!\)/);
  assert.match(hook, /selectedNeighborhoods:|selectedNeighborhoods,\n/);
  assert.match(hook, /neighborhoods: selectedNeighborhoods/);
  assert.match(hook, /setSelectedNeighborhoods\(\[\]\)/);
  assert.match(repo, /search_service_order_page_v3/);
  assert.match(repo, /search_service_order_page_ids_v5/);
  assert.equal(repo.split("p_neighborhoods: neighborhoods").length - 1, 2);
});

test("SQL garante bairros ligados a OS visíveis, normaliza UF e mantém paginação", () => {
  const filter = read("supabase/migrations/20261103191500_order_neighborhood_multiselect_filter.sql");
  const aliases = read("supabase/migrations/20261103192500_order_neighborhood_state_aliases.sql");
  assert.match(filter, /list_order_neighborhood_options_v1/);
  assert.match(filter, /access\.user_id is not null/);
  assert.match(filter, /access\.module_enabled/);
  assert.match(filter, /service_order\.service_neighborhood/);
  assert.match(filter, /public\.customer_addresses/);
  assert.match(filter, /neighborhood_filters/);
  assert.match(filter, /search_service_order_page_v3/);
  assert.match(filter, /limit greatest\(1, p_page_size\)/);
  assert.match(filter, /grant execute on function public\.list_order_neighborhood_options_v1\(uuid\) to authenticated/);
  assert.match(aliases, /normalize_order_filter_state_v1/);
  assert.match(aliases, /when 'sergipe' then 'se'/);
  assert.match(aliases, /coalesce\(btrim\(place\.city\),''\)/);
});
