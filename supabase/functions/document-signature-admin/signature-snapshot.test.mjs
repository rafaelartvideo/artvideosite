import test from "node:test";
import assert from "node:assert/strict";

let snapshot = null;
try {
  snapshot = await import("./signature-snapshot.mjs");
} catch {
  // RED until the helper is implemented.
}

test("sanitizes frozen sections to template fields only", () => {
  assert.ok(snapshot, "signature-snapshot module must exist");
  const safe = snapshot.sanitizeFrozenSnapshot({
    schema_version: 1,
    sections: [{
      key: "customer",
      label: "Cliente",
      fields: [
        { key: "customer.full_name", label: "Nome", value: "Maria" },
        { key: "secret.token", label: "Segredo", value: "abc" },
      ],
    }],
    checklists: [],
  }, new Set(["customer.full_name"]), {
    template: { id: "t1", name: "OS", selected_fields: ["customer.full_name"] },
    company: { name: "ArtVideo" },
    order: { id: "o1", organization_id: "org1", os_number: "1" },
  });
  assert.deepEqual(safe.sections[0].fields.map(field => field.key), ["customer.full_name"]);
  assert.equal(JSON.stringify(safe).includes("secret.token"), false);
});

test("renders static escaped HTML without executing snapshot values", () => {
  assert.ok(snapshot, "signature-snapshot module must exist");
  const html = snapshot.renderFrozenSnapshotHtml({
    template: { name: "<script>alert(1)</script>" },
    company: { name: "ArtVideo" },
    order: { os_number: "1" },
    sections: [{ key: "x", label: "Teste", fields: [{ key: "x.y", label: "Valor", value: "<img src=x onerror=alert(1)>" }] }],
    checklists: [],
  });
  assert.equal(html.includes("<script>alert(1)</script>"), false);
  assert.equal(html.includes("<img src=x onerror=alert(1)>"), false);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img/);
});
