import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("catalog editor restores individual related codes and their original relationship types", async () => {
  const editor = read("../presentation/TabProducts.tsx");
  const repository = read("../infrastructure/products.repository.ts");
  const parserSource = read("./related-code-input.ts");
  const { code } = await transformWithEsbuild(parserSource, "related-code-input.ts", { loader: "ts" });
  const { validateTypedRelatedCodes, parseRelatedCodesInput } = await import(
    "data:text/javascript;base64," + Buffer.from(code).toString("base64"));

  assert.ok(editor.includes("Código do fabricante / MPN"));
  assert.ok(editor.includes("Códigos relacionados"));
  assert.ok(editor.includes("Adicionar código"));
  assert.ok(editor.includes('<FSelect label="Tipo de relação"'));
  assert.ok(editor.includes("Código antigo (substituído pelo atual)"));
  assert.ok(editor.includes("Código novo (substitui o atual)"));
  assert.ok(editor.includes("Peça compatível"));
  assert.ok(editor.includes("Outra referência do mesmo produto"));
  assert.ok(editor.includes("Produto similar"));
  assert.ok(editor.includes("Produto genérico"));
  assert.ok(editor.includes("Excluir código relacionado"));
  assert.ok(editor.includes("form.related_codes.map((item, index)"));
  assert.ok(editor.includes("validateTypedRelatedCodes(form.related_codes, form.manufacturer_code)"));
  assert.ok(editor.includes("replaceRelatedProductCodes(activeOrganizationId, savedProductId, validateTypedRelatedCodes("));
  assert.ok(editor.includes("listRelatedProductCodes"));
  assert.ok(repository.includes("replace_product_related_codes"));
  assert.ok(!editor.includes("relatedCodesInput"));
  assert.ok(!editor.includes("Consultar catálogo"));

  const rows = [
    { code: " akb100 ", relation_type: "previous" },
    { code: " akb200", relation_type: "successor" },
    { code: "AKB300", relation_type: "compatible" },
    { code: "akb400", relation_type: "alternate" },
    { code: "AKB500", relation_type: "similar" },
    { code: "AKB600", relation_type: "generic" },
  ];
  assert.deepEqual(validateTypedRelatedCodes(rows, "MPN001"), {
    codes: [
      { code: "AKB100", relation_type: "previous" },
      { code: "AKB200", relation_type: "successor" },
      { code: "AKB300", relation_type: "compatible" },
      { code: "AKB400", relation_type: "alternate" },
      { code: "AKB500", relation_type: "similar" },
      { code: "AKB600", relation_type: "generic" },
    ],
    error: null,
  });
  assert.ok(validateTypedRelatedCodes([...rows, rows[0]], "MPN001").error, "Códigos duplicados não devem salvar.");
  assert.ok(validateTypedRelatedCodes([{code: "MPN001", relation_type:"alternate"}], "MPN001").error);
  assert.ok(validateTypedRelatedCodes([{code: "", relation_type:"alternate"}], "MPN001").error);
  assert.ok(validateTypedRelatedCodes([{code: "ABC123", relation_type:"invalid"}], "MPN001").error);
  // O parser do formato de importação antiga continua disponível sem alterar os registros existentes.
  assert.equal(parseRelatedCodesInput("AKB100, AKB100", rows).length, 1);
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
