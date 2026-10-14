import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

const checks = [
  {
    path: "src/features/equipment/presentation/EquipmentBrands.tsx",
    expected: ["Number(bSelected) - Number(aSelected)", "a.name.localeCompare(b.name", "draft.brands.some("],
  },
  {
    path: "src/features/equipment/presentation/EquipmentServiceSelector.tsx",
    expected: ["Number(chosen.has(b.id)) - Number(chosen.has(a.id))", "a.name.localeCompare(b.name"],
  },
  {
    path: "src/features/equipment/presentation/EquipmentAdminPanel.tsx",
    expected: ["Number(type.technicalFields.some(link => link.technical_field_id === b.id))", "Number(brandEquipmentIds.includes(b.id)) - Number(brandEquipmentIds.includes(a.id))"],
  },
  {
    path: "src/features/segments/presentation/UnionCatalogAdminPage.tsx",
    expected: ["Number(b.selected) - Number(a.selected)", "a.name.localeCompare(b.name"],
  },
];

for (const { path, expected } of checks) {
  test(`marcados vêm primeiro no componente ${path}`, async () => {
    const source = read(path);
    for (const fragment of expected) {
      assert.ok(source.includes(fragment), `Regra de ordenação ausente: ${fragment}`);
    }
    await assert.doesNotReject(transformWithEsbuild(source, path, { loader: "tsx", jsx: "automatic" }));
  });
}
