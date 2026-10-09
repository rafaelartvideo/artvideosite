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

test("groups Ferramentas permissions by integrated module", () => {
  assert.ok(taxonomy, "permission taxonomy must load");
  const keys = [
    "tools.view", "tools.uniq.use", "field_tracking.view",
    "queue.view", "queue.manage", "pbx.view", "marketplace.view",
    "ai.view", "sac_digital.view", "sac_digital.messages.view",
    "sac_digital.messages.send", "sac_digital.settings.manage", "agenda.view",
  ];
  const groups = taxonomy.buildPermissionGroups(
    keys.map((key, index) => ({ id: String(index), key, label: key, sort_order: index })),
  );
  const ferramentas = groups.find(group => group.name === "Ferramentas");
  assert.ok(ferramentas);
  assert.equal(ferramentas.permissions.length, keys.length - 1);
  assert.deepEqual(
    ferramentas.sections.map(section => section.name),
    ["Acesso geral", "Mapa de Campo", "Marketplace Union", "PABX Union",
      "SAC Digital", "Union Fila", "Union IA", "UNIQ"],
  );
  assert.equal(groups.find(group => group.name === "Agenda")?.permissions.length, 1);
});

test("individual tool permissions require access to Ferramentas", () => {
  assert.ok(taxonomy, "permission taxonomy must load");
  for (const key of [
    "field_tracking.view", "field_tracking.share", "queue.view", "pbx.view",
    "marketplace.view", "ai.view", "sac_digital.view",
  ]) {
    assert.ok(taxonomy.permissionDependencies(key).includes("tools.view"), key);
  }
});
