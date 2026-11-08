import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("preferência de paginação é lida antes da primeira consulta de OS", () => {
  const filters = read("src/features/orders/application/useOrderFilters.ts");
  const pagination = read("src/shared/ui/admin/AdminPagination.tsx");
  const helpers = read("src/shared/domain/pagination-preferences.ts");
  assert.match(filters, /useState\(\(\) => initialPageSize\(DEFAULT_ADMIN_PAGE_SIZE_OPTIONS, ADMIN_PAGE_SIZE_STORAGE_KEY, DEFAULT_ADMIN_PAGE_SIZE\)\)/);
  assert.match(filters, /useState\(\(\) => initialPageSize\(\[30, 50, 100\], "union-kanban-page-size-v1", 30\)\)/);
  assert.doesNotMatch(filters, /setListPageSize\] = useState\(5\)/);
  assert.match(pagination, /import \{[\s\S]*readPersistedPageSize[\s\S]*persistPageSize[\s\S]*\} from "@\/shared\/domain\/pagination-preferences"/);
  assert.match(helpers, /"union-admin-page-size-v1"/);
  assert.match(pagination, /readPersistedPageSize\(pageSizeOptions, storageKey\)/);
});

test("preferência inválida, bloqueada ou ausente usa fallback sem quebrar a lista", async () => {
  const source = read("src/shared/domain/pagination-preferences.ts");
  const { code } = await transformWithEsbuild(source, "pagination-preferences.ts", { loader: "ts", format: "esm" });
  const prefs = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  const originalWindow = globalThis.window;
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, "window");
  let stored = "50";
  globalThis.window = {
    localStorage: {
      getItem: () => stored,
      setItem: (_key, value) => { stored = value; },
    },
  };
  try {
    assert.equal(prefs.initialPageSize([5, 10, 20, 30, 50, 100], prefs.ADMIN_PAGE_SIZE_STORAGE_KEY, 5), 50);
    prefs.persistPageSize(20, prefs.ADMIN_PAGE_SIZE_STORAGE_KEY);
    assert.equal(prefs.readPersistedPageSize([5, 10, 20, 30, 50, 100], prefs.ADMIN_PAGE_SIZE_STORAGE_KEY), 20);
    stored = "999";
    assert.equal(prefs.initialPageSize([5, 10, 20, 30, 50, 100], prefs.ADMIN_PAGE_SIZE_STORAGE_KEY, 5), 5);
    stored = "invalid";
    assert.equal(prefs.initialPageSize([5, 10, 20, 30, 50, 100], prefs.ADMIN_PAGE_SIZE_STORAGE_KEY, 5), 5);
    globalThis.window = { localStorage: { getItem: () => { throw Error("blocked"); } } };
    assert.equal(prefs.initialPageSize([5, 10, 20, 30, 50, 100], prefs.ADMIN_PAGE_SIZE_STORAGE_KEY, 5), 5);
    delete globalThis.window;
    assert.equal(prefs.initialPageSize([5, 10, 20, 30, 50, 100], prefs.ADMIN_PAGE_SIZE_STORAGE_KEY, 5), 5);
  } finally {
    if (hadWindow) globalThis.window = originalWindow;
    else delete globalThis.window;
  }
});

test("skeleton de OS é cinza e usa a quantidade de linhas da página selecionada", async () => {
  const primitive = read("src/shared/ui/primitives/skeleton.tsx");
  const skeletons = read("src/features/orders/presentation/OrdersSkeletons.tsx");
  const table = read("src/features/orders/presentation/OrdersTable.tsx");
  assert.match(primitive, /bg-neutral-200/);
  assert.match(primitive, /dark:bg-neutral-700/);
  assert.doesNotMatch(primitive, /bg-accent/);
  assert.match(table, /<OrdersTableSkeleton[^>]*pageSize=\{pageSize\}[^>]*totalItems=\{totalItems\}/);
  assert.match(skeletons, /const previewRows = Array\.from\(\{ length: Math\.min\(count, 4\) \}/);
  assert.match(skeletons, /Math\.min\(100, totalItems > 0 \? Math\.min\(pageSize, totalItems\) : pageSize\)/);
  assert.match(skeletons, /minHeight: count \* 57/);
  assert.match(skeletons, /minHeight: count \* 160/);
  const compiled = await transformWithEsbuild(skeletons, "OrdersSkeletons.tsx", { loader: "tsx" });
  assert.ok(compiled.code.length > 0);
});
