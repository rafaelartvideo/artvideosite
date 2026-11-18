import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

async function repository(client) {
  const path = "src/features/customers/infrastructure/customers-filtered-page.repository.ts";
  const source = readFileSync(path, "utf8").replace('import { supabase } from "@/lib/supabase";', 'const supabase = globalThis.__customerPaginationClient;');
  globalThis.__customerPaginationClient = client;
  const { code } = await transformWithEsbuild(source, path, { loader: "ts" });
  return import("data:text/javascript;base64," + Buffer.from(code + `\n// ${Math.random()}`).toString("base64"));
}

test("customer page keeps supported sizes and bounds invalid requests before RPC", async () => {
  const calls = [];
  const { listExactCustomersPage } = await repository({ rpc: async (_, args) => {
    calls.push(args);
    return { data: { ids: [], total: 0 }, error: null };
  } });
  for (const size of [10, 20, 50, 100, 0, 999]) {
    await listExactCustomersPage({ organizationId: "org", page: -1, pageSize: size });
  }
  assert.deepEqual(calls.map(args => args.p_page_size), [10, 20, 50, 100, 1, 100]);
  assert.ok(calls.every(args => args.p_page === 1));
});

test("customer page obtains exact total and bounded ordered ids from RPC without downloading the organization index", async () => {
  const calls = [];
  const client = {
    rpc: async (name, args) => { calls.push([name, args]); return { data: { ids: ["customer-1205", "customer-1204"], total: 1205 }, error: null }; },
    from: table => {
      const query = { select: value => { assert.equal(value, "*, addresses:customer_addresses(*)"); return query; },
        eq: (key, value) => { assert.deepEqual([key, value], ["organization_id", "org-a"]); return query; },
        in: async (key, ids) => { assert.equal(table, "customers"); assert.equal(key, "id"); assert.deepEqual(ids, ["customer-1205", "customer-1204"]); return { data: [{ id: "customer-1204" }, { id: "customer-1205" }], error: null }; } };
      return query;
    },
  };
  const { listExactCustomersPage } = await repository(client);
  assert.deepEqual(await listExactCustomersPage({ organizationId: "org-a", page: 13, pageSize: 100, nameSearch: "  ÁCME_% ", documentSearch: "12.345/0001-09", states: [" se "], cities: ["se: São: José "], sort: "desc" }), { items: [{ id: "customer-1205" }, { id: "customer-1204" }], total: 1205 });
  assert.deepEqual(calls, [["list_exact_customers_page", { p_organization_id: "org-a", p_page: 13, p_page_size: 100, p_name_search: "ácme_%", p_document_search: "12345000109", p_states: ["SE"], p_cities: ["SE:são: josé"], p_sort: "desc" }]]);
});

test("an empty server page retains its exact total and never requests details", async () => {
  const { listExactCustomersPage } = await repository({ rpc: async () => ({ data: { ids: [], total: 1205 }, error: null }), from: () => assert.fail("empty pages must not request details") });
  assert.deepEqual(await listExactCustomersPage({ organizationId: "org", page: 500, pageSize: 10 }), { items: [], total: 1205 });
});

test("customer RPC failure propagates without falling back to the capped organization index", async () => {
  const error = new Error("RPC failed");
  const { listExactCustomersPage } = await repository({ rpc: async () => ({ data: null, error }), from: () => assert.fail("no capped fallback") });
  await assert.rejects(listExactCustomersPage({ organizationId: "org", page: 1, pageSize: 20 }), error);
});

test("customer SQL fixture preserves large pages, exact filters and invoker RLS", { skip: !process.env.CUSTOMERS_PAGINATION_DATABASE_MODULE }, async t => {
  // Supply a disposable PGlite module; no application dependency is required.
  const { PGlite } = await import(process.env.CUSTOMERS_PAGINATION_DATABASE_MODULE);
  const database = new PGlite();
  try {
    await database.exec(readFileSync("src/features/customers/domain/customers-pagination.fixture.sql", "utf8"));
    await database.exec(`create collation pg_catalog."pt-BR-x-icu" (provider=icu,locale='pt-BR');`);
    const migration = readFileSync("supabase/migrations/20261118224040_customers_exact_filtered_page.sql", "utf8");
    // PGlite can accept ICU DDL while ignoring ICU options. Verify that the
    // actual migration refuses this environment before testing its SQL logic.
    let nativeIcu = true;
    try {
      await database.exec("begin");
      await database.exec(migration);
      await database.exec("commit");
    } catch (error) {
      await database.exec("rollback");
      assert.match(error.message, /Customer pagination requires native Portuguese ICU/);
      nativeIcu = false;
      assert.equal((await database.query("select to_regprocedure('public.list_exact_customers_page(uuid,integer,integer,text,text,text[],text[],text)') as rpc")).rows[0].rpc, null);
      assert.equal((await database.query("select count(*)::integer as count from pg_collation where collname='customers_pt_br_natural_base'")).rows[0].count, 0);
      // This omission applies ONLY to the disposable SQL-logic fixture.
      // The production migration always retains and executes the native guard.
      const logicOnlyMigration = migration.replace(/-- BEGIN NATIVE ICU GUARD[\s\S]*?-- END NATIVE ICU GUARD/, "");
      assert.notEqual(logicOnlyMigration, migration);
      await database.exec(logicOnlyMigration);
    }
    await database.exec("set role authenticated");
    const own = "00000000-0000-0000-0000-000000000001";
    const shared = "00000000-0000-0000-0000-000000000002";
    const firstShared = "20000000-0000-0000-0000-000000000001";
    const page = async (organization, options = {}) => {
      const { page = 1, size = 20, name = "", document = "", states = [], cities = [], sort = "" } = options;
      const response = await database.query("select public.list_exact_customers_page($1,$2,$3,$4,$5,$6,$7,$8) result", [organization, page, size, name, document, states, cities, sort]);
      return response.rows[0].result;
    };
    const last = await page(own, { page: 13, size: 100 });
    assert.equal(last.total, 1205);
    assert.equal(last.ids.length, 5);
    assert.equal(last.ids[0], "10000000-0000-0000-0000-000000001201");
    assert.deepEqual(await page(own, { page: 100, size: 100 }), { ids: [], total: 1205 });
    assert.equal((await page(own, { size: 999 })).ids.length, 100);
    assert.equal((await page(own, { page: 0, size: 0 })).ids.length, 1);
    for (const size of [10, 20, 50, 100]) assert.equal((await page(own, { size })).ids.length, size);
    for (const name of ["ácme_%", "ÁCME_%", "_%"]) assert.deepEqual(await page(shared, { name }), { total: 1, ids: [firstShared] });
    assert.deepEqual(await page(shared, { name: "acme" }), { total: 1, ids: ["20000000-0000-0000-0000-000000000002"] });
    assert.equal((await page(shared, { name: "%doesnotexist" })).total, 0);
    for (const document of ["12345678901", "123.456.789-01", "12345678000109", "0001-09"]) {
      assert.deepEqual(await page(shared, { document }), { total: 1, ids: [firstShared] });
    }
    assert.equal((await page(shared, { document: "abc" })).total, 7);
    assert.equal((await page(shared, { document: "١٢٣" })).total, 7);
    assert.deepEqual(await page(shared, { states: ["SE"], cities: ["BA:são: josé"] }), { total: 1, ids: ["20000000-0000-0000-0000-000000000006"] });
    assert.equal((await page(shared, { cities: ["BA:sao: jose"] })).total, 0);
    assert.equal((await page(shared, { cities: [":são: josé"] })).total, 0);
    assert.equal((await page(shared, { states: ["SP"] })).total, 0);
    assert.deepEqual(await page("00000000-0000-0000-0000-000000000003"), { ids: [], total: 0 });
    assert.equal((await database.query("select prosecdef from pg_proc where proname='list_exact_customers_page'")).rows[0].prosecdef, false);

    await t.test("native ICU preserves Portuguese base/numeric ordering and name fallbacks", { skip: !nativeIcu }, async () => {
      const rows = (await database.query("select * from public.customers where organization_id = $1", [shared])).rows;
      for (const sort of ["", "asc", "desc"]) {
        const expected = [...rows].sort((left, right) => {
          const name = row => String(row.trade_name || row.full_name || row.legal_name || "");
          const comparison = name(left).localeCompare(name(right), "pt-BR", { sensitivity: "base", numeric: true });
          return (sort === "desc" ? -comparison : comparison) || left.id.localeCompare(right.id);
        }).map(row => row.id);
        assert.deepEqual((await page(shared, { sort })).ids, expected);
      }
    });
    if (!nativeIcu) t.diagnostic("PGlite ignores ICU base/numeric options. The migration guard correctly rejected it and rolled back both collation and RPC. Only the disposable SQL-logic fixture omits the guard; native PostgreSQL ICU sorting still requires verification.");
    await database.exec("reset role; set role anon");
    await assert.rejects(page(own), /permission denied/);
  } finally {
    await database.close();
  }
});
