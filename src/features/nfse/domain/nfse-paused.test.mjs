import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../../../${path}`, import.meta.url), "utf8");

test("paused NFS-e is absent from the admin navigation and access guard", async () => {
  const config = await source("features/admin-shell/navigation-config.ts");
  assert.doesNotMatch(config, /\{ id: "nfse", label: "Notas Fiscais"/);
  assert.match(config, /if \(tab === "nfse"\) return false/);
  const sidebar = await source("features/admin-shell/presentation/AdminSidebar.tsx");
  assert.doesNotMatch(sidebar, /"finance", "nfse"/);
});

test("direct NFS-e URLs cannot render the fiscal module", async () => {
  const app = await source("app/Admin.tsx");
  assert.match(app, /if \(tab === "nfse"\) return false/);
  assert.doesNotMatch(app, /const NfsePage = lazy/);
  assert.match(app, /<Route path="nfse\/\*" element=\{<Navigate to="\/admin" replace \/>\} \/>/);
});

test("orders do not show the Nota de serviço action", async () => {
  const order = await source("features/orders/presentation/OrderDetailsPage.tsx");
  assert.doesNotMatch(order, /Nota de serviço<\/AdminButton>/);
  assert.doesNotMatch(order, /adminPath\("nfse"\)/);
});

test("NFS-e roles and subscription selections are hidden but stored definitions are retained", async () => {
  const permissions = await source("features/employees/domain/permission-taxonomy.ts");
  assert.match(permissions, /return !key.startsWith\("nfse\."\)/);
  const plans = await source("features/platform-billing/infrastructure/subscription-configuration.repository.ts");
  assert.match(plans, /module.key !== "nfse"/);
  const migration = await readFile(new URL("../../../../supabase/migrations/20261013220000_pause_nfse_module.sql", import.meta.url), "utf8");
  assert.match(migration, /set is_active = false/);
  assert.doesNotMatch(migration, /delete\s+from|drop\s+table|truncate/i);
});
