import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const { outputFiles } = await build({
  absWorkingDir: fileURLToPath(new URL("../../../../", import.meta.url)),
  entryPoints: ["src/features/admin-shell/admin-routes.ts"],
  bundle: true, format: "esm", platform: "browser", write: false,
});
const { adminPath, resolveAdminRoute } = await import(
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
