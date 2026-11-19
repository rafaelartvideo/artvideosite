import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transform } from "esbuild";

test("Request counters also support the organization object without an explicit context ID", async () => {
  const source = readFileSync("src/features/settings/presentation/SiteRequestsPage.tsx", "utf8");
  const setup = source.slice(source.indexOf("  const { hasPermission"), source.indexOf("  const quoteCountQuery"));
  const { code } = await transform(setup + "\nreturn organizationId;", { loader: "tsx" });
  const resolve = new Function("useAuth", "isAdminModuleEnabled", code);
  const organizationId = resolve(() => ({
    activeOrganization: { organization_id: "organization", is_artvideo_tenant: true },
    hasPermission: () => true, hasModule: () => true,
  }), () => true);
  assert.equal(organizationId, "organization");
});

test("Payment settings load for the organization supplied by the real session", async () => {
  const source = readFileSync("src/features/settings/presentation/SitePaymentsPage.tsx", "utf8");
  const auth = source.slice(source.indexOf("  const { activeOrganization"), source.indexOf("  const [providers"));
  const effect = source.slice(source.indexOf("  useEffect(() => {"), source.indexOf("  const selectedProvider"));
  const { code } = await transform(auth + effect, { loader: "tsx" });
  const filters = [], applied = [], cleanups = [];
  const saved = { provider_key: "example", environment: "production", enabled: false };
  const client = { from(table) {
    const query = {
      select() { return query; }, order() { return query; },
      eq(key, value) { filters.push([table, key, value]); return query; },
      maybeSingle() { return query; },
      then(resolve, reject) { return Promise.resolve({ data: table.endsWith("settings") ? saved : [], error: null }).then(resolve, reject); },
    };
    return query;
  } };
  const noop = () => {};
  new Function("useAuth", "useEffect", "supabase", "setSettingsLoading", "setProviders", "setSettings", "setSavedSettings", "notifyAdmin", "systemErrorMessage", "emptySettings", code)(
    () => ({ activeOrganizationId: "organization", activeOrganization: { organization_id: "organization" }, hasPermission: () => true }),
    effect => cleanups.push(effect()), client, noop, noop, value => applied.push(value), noop, noop, String, {},
  );
  await new Promise(resolve => setImmediate(resolve));
  cleanups.forEach(cleanup => cleanup?.());
  assert.deepEqual(filters, [["artvideo_store_payment_settings", "organization_id", "organization"]]);
  assert.deepEqual(applied, [saved]);
});
