import test from "node:test";
import assert from "node:assert/strict";

let snapshotModule = null;
try {
  snapshotModule = await import("./document-signature-snapshot.mjs");
} catch {
  // RED: helper is created by the implementation step.
}

test("builds a canonical frozen snapshot without executable or secret fields", () => {
  assert.ok(snapshotModule, "document-signature-snapshot module must exist");
  const snapshot = snapshotModule.createDocumentSignatureSnapshot({
    template: {
      id: "template-1",
      name: "Ordem de Serviço",
      document_type: "OS",
      paper_size: "A4",
      orientation: "portrait",
      margin_top: 12,
      margin_right: 12,
      margin_bottom: 12,
      margin_left: 12,
      show_logo: true,
      show_company_info: true,
      show_page_number: false,
      show_printed_at: true,
      header_text: "Cabeçalho",
      footer_text: "Rodapé",
      layout: { body_font_size: 10 },
      selected_fields: ["customer.full_name", "signatures.customer"],
    },
    company: { name: "ArtVideo", email: "contato@example.com", logoUrl: "https://example.com/logo.png" },
    order: { id: "order-1", organization_id: "org-1", os_number: "123", token: "never-copy" },
    sections: [{ key: "customer", label: "Cliente", fields: [{ key: "customer.full_name", label: "Nome", value: "Maria" }] }],
    checklists: [],
  });

  assert.equal(snapshot.schema_version, 1);
  assert.equal(snapshot.template.id, "template-1");
  assert.deepEqual(snapshot.template.selected_fields, ["customer.full_name", "signatures.customer"]);
  assert.deepEqual(snapshot.company, { email: "contato@example.com", name: "ArtVideo" });
  assert.deepEqual(snapshot.order, { id: "order-1", organization_id: "org-1", os_number: "123" });
  assert.equal(JSON.stringify(snapshot).includes("never-copy"), false);
  assert.equal(JSON.stringify(snapshot).includes("logo.png"), false);
});

test("canonicalizeJson sorts object keys recursively and preserves array order", () => {
  assert.ok(snapshotModule, "document-signature-snapshot module must exist");
  const canonical = snapshotModule.canonicalizeJson({ z: 1, a: { y: 2, b: 3 }, list: [{ q: 1, a: 2 }, 4] });
  assert.deepEqual(Object.keys(canonical), ["a", "list", "z"]);
  assert.deepEqual(Object.keys(canonical.a), ["b", "y"]);
  assert.deepEqual(Object.keys(canonical.list[0]), ["a", "q"]);
});
