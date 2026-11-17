import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const { outputFiles } = await build({
  absWorkingDir: fileURLToPath(new URL("../../../../", import.meta.url)),
  entryPoints: ["src/features/admin-shell/admin-routes.ts"],
  bundle: true, format: "esm", platform: "browser", write: false,
});
const { adminPath, resolveAdminRoute, parentAdminTab } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].text + "\n//# sourceURL=admin-routes-runtime.mjs").toString("base64")}`
);

test("admin paths round-trip identifiers containing accents, percent signs and slashes", () => {
  for (const id of ["OS 288", "revisão", "50%", "a/b"]) {
    assert.deepEqual(resolveAdminRoute(adminPath("orders", id, "documents")), {
      tab: "orders", resourceId: id, subpage: "documents",
    });
  }
});

test("a malformed URL identifier does not crash the entire admin workspace", () => {
  for (const [url, tab] of [
    ["/admin/orders/50%", "orders"],
    ["/admin/settings/%E0%A4%A", "settings"],
    ["/admin/site/products/%ZZ", "inventory"],
    ["/admin/products/%", "inventory"],
  ]) {
    assert.doesNotThrow(() => resolveAdminRoute(url));
    assert.equal(resolveAdminRoute(url).tab, tab);
  }
});

test("legacy product routes retain the inventory destination and identifiers", () => {
  for (const base of ["/admin/products", "/admin/site/products"]) {
    assert.deepEqual(resolveAdminRoute(`${base}/abc/edit`), {
      tab: "inventory", resourceId: "abc", subpage: "edit",
    });
  }
});

test("configurações dos atendimentos têm URL própria em Ferramentas", () => {
  assert.equal(adminPath("integrations"), "/admin/integrations");
  assert.deepEqual(resolveAdminRoute("/admin/tools/union-whatsapp/canais"), {
    tab: "tools", resourceId: "union-whatsapp", subpage: "canais",
  });
  assert.deepEqual(resolveAdminRoute("/admin/tools/sac-digital/configuracoes"), {
    tab: "tools", resourceId: "sac-digital", subpage: "configuracoes",
  });
  assert.notEqual(resolveAdminRoute("/admin/operation/integrations").tab, "integrations");
});

test("Auditoria está em Operação, mantém links antigos e possui Voltar no cabeçalho", async () => {
  const { readFileSync } = await import("node:fs");
  const root = new URL("../../../../", import.meta.url);
  const read = file => readFileSync(new URL(file, root), "utf8");
  const navigation = read("src/features/admin-shell/navigation-config.ts");
  const admin = read("src/app/Admin.tsx");
  const page = read("src/features/audit/presentation/TabAuditLog.tsx");
  const primary = navigation.slice(navigation.indexOf("export const mainItems"), navigation.indexOf("export const siteItems"));
  const operation = navigation.slice(navigation.indexOf("export const operationItems"), navigation.indexOf("export const utilityItems"));

  assert.equal(adminPath("audit"), "/admin/operation/audit");
  assert.equal(parentAdminTab("audit"), "operation");
  assert.deepEqual(resolveAdminRoute("/admin/audit"), {tab:"audit",resourceId:null,subpage:null});
  assert.deepEqual(resolveAdminRoute("/admin/operation/audit"), {tab:"audit",resourceId:null,subpage:null});
  assert.doesNotMatch(primary, /id: "audit"/);
  assert.match(operation, /id: "audit", label: "Auditoria"/);
  assert.ok(operation.includes('permissionKey: "organizations.audit.view"'));
  assert.ok(admin.includes('path="audit/*" element={<Navigate'));
  assert.ok(admin.includes('path="operation/audit/*" element={<TabAuditLog onBack='));
  assert.match(page, /title="Auditoria"/);
  assert.ok(page.includes('subtitle="Histórico de alterações realizadas nos dados do CRM."'));
  assert.ok(page.includes('actions={<AdminButton variant="secondary" size="sm" onClick={onBack}>Voltar</AdminButton>}'));
});
