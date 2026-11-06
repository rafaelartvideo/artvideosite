import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("catalog editor preserves the MPN and accepts manually entered comma-separated references", async () => {
  const editor = read("../presentation/TabProducts.tsx");
  const repository = read("../infrastructure/products.repository.ts");
  const parserSource = read("./related-code-input.ts");
  const { code } = await transformWithEsbuild(parserSource, "related-code-input.ts", { loader: "ts" });
  const { parseRelatedCodesInput, validateRelatedCodesInput } = await import(
    "data:text/javascript;base64," + Buffer.from(code).toString("base64"));

  assert.match(editor, /Código do fabricante \/ MPN/);
  assert.match(editor, /label="Códigos relacionados"/);
  assert.match(editor, /value=\{relatedCodesInput\}/);
  assert.match(editor, /setRelatedCodesInput\(codes\.map\(item => item\.code\)\.join\(", "\)\)/);
  assert.match(editor, /validateRelatedCodesInput\(relatedCodesInput, form\.manufacturer_code, form\.related_codes\)/);
  assert.match(editor, /replaceRelatedProductCodes\(activeOrganizationId, savedProductId, parseRelatedCodesInput\(relatedCodesInput, form\.related_codes\)\)/);
  assert.match(editor, /listRelatedProductCodes/);
  assert.match(repository, /replace_product_related_codes/);
  assert.doesNotMatch(editor, /Consultar catálogo|searchCodeSuggestions|searchExternalProducts\(/);

  const previous = [
    { code: "AKB100", relation_type: "previous" },
    { code: "AKB200", relation_type: "successor" },
    { code: "AKB300", relation_type: "compatible" },
  ];
  assert.deepEqual(parseRelatedCodesInput(" akb100, akb200, AKB300, NOVO400, novo400", previous), [
    ...previous,
    { code: "NOVO400", relation_type: "alternate" },
  ]);
  assert.equal(validateRelatedCodesInput("COD001, COD001", "PRINCIPAL").codes.length, 1);
  assert.ok(validateRelatedCodesInput("PRINCIPAL", "PRINCIPAL").error);
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
