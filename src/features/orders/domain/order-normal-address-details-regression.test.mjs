import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("Dados de endereço reaparecem entre Cliente e Equipamento em OS normais", async () => {
  const source = read("src/features/orders/presentation/OrderDetailsContent.tsx");
  assert.ok((await transformWithEsbuild(source, "OrderDetailsContent.tsx", { loader: "tsx" })).code);
  const customer = source.indexOf('<Section\n          title="Cliente"');
  const address = source.indexOf('<Section title="Dados de endereço">');
  const equipment = source.indexOf("<OrderEquipmentDetailsSection detail={detail}");
  assert.ok(customer >= 0 && address > customer && equipment > address,
    "o endereço está entre o cliente e o equipamento");
  assert.match(source, /!isReturnOrder && hasPermission\("orders\.section\.address"\)/);
  assert.match(source, /const customerAddress = \(customer\?\.addresses \|\| \[\]\)\.find/);
  assert.match(source, /customerAddress\[key\]/);
  assert.match(source, /"zip_code", "street", "number", "complement", "neighborhood", "city", "state"/);
  assert.match(source, /Nenhum endereço cadastrado para este cliente/);
});

test("OS de retorno usa layout independente e Local do atendimento continua preservado", () => {
  const source = read("src/features/orders/presentation/OrderDetailsContent.tsx");
  const page = read("src/features/orders/presentation/OrderDetailsPage.tsx");
  assert.match(source, /!isReturnOrder && hasPermission\("orders\.section\.service_location"\)/);
  assert.match(source, /<Section title="Local do atendimento">/);
  assert.match(source, /<InfoRow label="CEP" value=\{detail\.service_zip_code\}/);
  assert.match(source, /<InfoRow label="Rua" value=\{detail\.service_street\}/);
  assert.match(page, /returnDiagnosisActive\s*\? <>[\s\S]*?<OrderEquipmentDetailsSection/);
  assert.match(page, /<OrderDetailsContent/);
  assert.doesNotMatch(source, /!isReturnOrder && hasPermission\("orders\.section\.equipment"\)/);
});
