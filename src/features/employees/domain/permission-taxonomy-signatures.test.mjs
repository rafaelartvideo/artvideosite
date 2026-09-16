import test from "node:test";
import assert from "node:assert/strict";

let taxonomy = null;
try {
  taxonomy = await import("./permission-taxonomy.ts");
} catch {
  // RED if the TypeScript module cannot be loaded in the current runner.
}

test("groups document signature permissions under Assinaturas", () => {
  assert.ok(taxonomy, "permission taxonomy must load");
  assert.equal(taxonomy.permissionSectionName({ key: "documents.signatures.send" }), "Assinaturas");
  assert.equal(taxonomy.permissionSectionName({ key: "documents.signatures.audit" }), "Assinaturas");
});

test("document signature actions depend on signature viewing", () => {
  assert.ok(taxonomy, "permission taxonomy must load");
  assert.deepEqual(new Set(taxonomy.permissionDependencies("documents.signatures.send")), new Set(["documents.signatures.view", "documents.print", "documents.view"]));
  assert.deepEqual(new Set(taxonomy.permissionDependencies("documents.signatures.resend")), new Set(["documents.signatures.view", "documents.view"]));
  assert.deepEqual(new Set(taxonomy.permissionDependencies("documents.signatures.cancel")), new Set(["documents.signatures.view", "documents.view"]));
  assert.deepEqual(new Set(taxonomy.permissionDependencies("documents.signatures.audit")), new Set(["documents.signatures.view", "documents.view"]));
});
