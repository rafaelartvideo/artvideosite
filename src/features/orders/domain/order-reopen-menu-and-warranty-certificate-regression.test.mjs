import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = file => readFileSync(file,"utf8");

test("Reabrir OS existe nos três pontos da lista, nunca na toolbar", async () => {
  const table=read("src/features/orders/presentation/OrdersTable.tsx");
  const actions=read("src/features/orders/presentation/OrderDetailsActions.tsx");
  const panel=read("src/features/orders/presentation/OrderReturnsPanel.tsx");
  for(const [name,text] of [["OrdersTable",table],["OrderDetailsActions",actions],["OrderReturnsPanel",panel]]) {
    assert.ok((await transformWithEsbuild(text,name+".tsx",{loader:"tsx"})).code);
  }
  assert.match(table,/canReopenOrReturn && <DropdownMenuItem onSelect=\{\(\) => setReturnTarget\(order\)\}/);
  assert.match(table,/canStartReturn \? "Iniciar retorno" : "Reabrir OS"/);
  assert.match(table,/mode=\{returnTarget \? returnMode\(returnTarget\) : "reopen"\}/);
  assert.match(actions,/<OrderReturnActions order=\{detail\}/);
  assert.match(panel,/if \(!canStartReturn\) return null/);
  assert.match(panel,/<RotateCcw size=\{15\} \/> Iniciar retorno/);
  assert.doesNotMatch(panel,/const label = canStartReturn/);
  assert.doesNotMatch(panel,/mode=\{canStartReturn \? "return" : "reopen"\}/);
});

test("certificado tem status consultado no banco, emissão distinta de impressão", async () => {
  const page=read("src/features/orders/presentation/OrderDetailsPage.tsx");
  assert.ok((await transformWithEsbuild(page,"OrderDetailsPage.tsx",{loader:"tsx"})).code);
  assert.match(page,/queryKey: warrantyCertificateKey/);
  assert.match(page,/queryFn: \(\) => loadWarrantyCertificate/);
  assert.match(page,/refetchOnMount: "always"/);
  assert.match(page,/const issueWarranty = async \(\) => \{/);
  assert.match(page,/const existing = await loadWarrantyCertificate/);
  assert.match(page,/const certificate = existing \|\| await issueWarrantyCertificate/);
  assert.match(page,/const printWarranty = async \(\) => \{/);
  const printing=page.split("const printWarranty = async () => {")[1].split("\n  };")[0];
  assert.match(printing,/const certificate = await loadWarrantyCertificate/);
  assert.doesNotMatch(printing,/issueWarrantyCertificate/);
  assert.match(page,/warrantyCertificateQuery.data \? "Imprimir certificado de garantia" : "Emitir certificado de garantia"/);
  assert.match(page,/warrantyCertificateQuery.data.expires_at/);
  assert.match(page,/Certificado não emitido. Use a ação Emitir certificado antes de imprimir/);
});

test("envio do certificado pelo SAC também não pode criá-lo implicitamente", () => {
  const page=read("src/features/orders/presentation/OrderDetailsPage.tsx");
  const action=page.split('if(templateId==="warranty-certificate") {')[1].split("\n    }")[0];
  assert.match(action,/const certificate=await loadWarrantyCertificate/);
  assert.match(action,/Emita-o explicitamente nos detalhes da OS/);
  assert.doesNotMatch(action,/issueWarrantyCertificate/);
});
