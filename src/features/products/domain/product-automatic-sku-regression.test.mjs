import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";
const read = p => readFileSync(p,"utf8");
test("SKU automático sem campo editável e códigos na primeira linha de Geral",async()=>{
 const page=read("src/features/products/presentation/TabProducts.tsx");
 const editor=read("src/features/products/presentation/ProductIdentifiersEditor.tsx");
 const matrix=read("src/features/products/presentation/ProductVariationMatrix.tsx");
 for(const [name,source] of [["page",page],["editor",editor],["matrix",matrix]]) assert.ok((await transformWithEsbuild(source,name+".tsx",{loader:"tsx"})).code);
 assert.doesNotMatch(page,/label="SKU \/ código interno"/);
 assert.doesNotMatch(matrix,/aria-label=\{"SKU de "/);
 assert.ok(page.indexOf("<ProductIdentifiersEditor")<page.indexOf('label="Nome do item"'));
 assert.ok(page.includes("identifierConflicts"));
 assert.ok(page.includes("modelConflict"));
 assert.ok(editor.includes("index === kinds.length - 1"));
 assert.doesNotMatch(page,/value="relationships"/);
});
test("sequência isolada por empresa, validação normalizada e preservação do SKU existente",()=>{
 const sql=read("supabase/migrations/20261126090000_inventory_automatic_sku_and_duplicate_validation.sql");
 for(const token of ["private.inventory_sku_counters","pg_advisory_xact_lock","private.next_inventory_sku_v1(p_organization_id)","private.assert_inventory_identifier_v1","v_old.sku","v_seen_barcodes","Modelo já cadastrado","revoke all on private.inventory_sku_counters"]) assert.ok(sql.includes(token),token);
 assert.doesNotMatch(sql,/v_sku:=btrim\(v_row->>'sku'\)/);
});
