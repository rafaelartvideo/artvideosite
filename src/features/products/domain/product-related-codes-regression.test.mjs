import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("catalog editor preserves the main MPN and supports typed replacement references", () => {
  const editor = read("../presentation/TabProducts.tsx");
  const repository = read("../infrastructure/products.repository.ts");
  assert.match(editor, /Código do fabricante \/ MPN/);
  assert.match(editor, /Códigos relacionados/);
  assert.match(editor, /Código antigo \(substituído pelo atual\)/);
  assert.match(editor, /Código novo \(substitui o atual\)/);
  assert.match(editor, /Peça compatível/);
  assert.match(editor, /listRelatedProductCodes/);
  assert.match(editor, /replaceRelatedProductCodes/);
  assert.match(repository, /replace_product_related_codes/);
});

test("related codes are private to the tenant and searchable in OS and PDV only when verified", () => {
  const sql = read("../../../../supabase/migrations/20261106160000_product_related_codes.sql");
  assert.match(sql, /alter table public\.product_related_codes enable row level security/);
  assert.match(sql, /private\.has_tenant_module_permission\(organization_id,'products','products\.view'\)/);
  assert.match(sql, /public\.replace_product_related_codes/);
  assert.match(sql, /v_product\.manufacturer_code/);
  assert.match(sql, /product_related_codes code where code\.organization_id/);
  assert.match(sql, /code\.is_verified/);
});
