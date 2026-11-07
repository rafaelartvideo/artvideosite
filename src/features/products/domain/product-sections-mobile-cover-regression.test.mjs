import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = file => readFileSync(file, "utf8");

test("atributos e códigos relacionados seguem Section do CRM", async () => {
  const page = read("src/features/products/presentation/TabProducts.tsx");
  const matrix = read("src/features/products/presentation/ProductVariationMatrix.tsx");
  for (const [name, source] of [["TabProducts.tsx", page], ["ProductVariationMatrix.tsx", matrix]]) {
    assert.ok((await transformWithEsbuild(source, name, { loader: "tsx" })).code);
  }
  const relations = page.slice(
    page.indexOf('<TabsContent value="relationships"'),
    page.indexOf('<TabsContent value="commercial"'),
  );
  assert.ok(relations.includes('<Section title="Criar atributos e variações"'));
  assert.ok(relations.includes('<ProductVariationMatrix'));
  assert.ok(relations.includes('<Section title="Códigos relacionados"'));
  assert.ok(relations.includes('actions={<AdminButton'));
  assert.ok(relations.includes('Adicionar código'));
  assert.ok(relations.includes('form.related_codes.map((item, index)'));
  assert.ok(!matrix.includes('>Criar variações</h3>'), "O cabeçalho da Section substitui o título duplicado");
});

test("Categoria, Marca, Modelo e Condição ficam em linhas individuais no celular", () => {
  const page = read("src/features/products/presentation/TabProducts.tsx");
  const general = page.slice(
    page.indexOf('<TabsContent value="general"'),
    page.indexOf('<TabsContent value="commercial"'),
  );
  assert.ok(general.includes('grid min-w-0 grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2 sm:gap-4'));
  const labels = ["Categoria", "Marca", "Modelo", "Condição do produto"];
  const positions = labels.map(label => general.indexOf(`label="${label}"`));
  assert.ok(positions.every(position => position >= 0));
  assert.ok(positions.every((p, i) => i === 0 || p > positions[i - 1]));
  assert.ok(!general.includes('grid min-w-0 grid-cols-2 gap-3 sm:col-span-2 sm:gap-4'));
});

test("foto de capa mostra Câmera ao lado de Adicionar com o mesmo upload", async () => {
  const page = read("src/features/products/presentation/TabProducts.tsx");
  const media = read("src/shared/ui/admin/AdminMedia.tsx");
  assert.ok((await transformWithEsbuild(media, "AdminMedia.tsx", { loader: "tsx" })).code);
  assert.ok(page.includes('removeIconOnly\n                      photoActions\n                      coverFill\n                      label="Foto de capa"'));
  assert.ok(media.includes('photoActions && <AdminButton'));
  assert.ok(media.includes('onClick={() => cameraInputRef.current?.click()}'));
  assert.ok(media.includes('capture="environment"'));
  assert.ok(media.includes('onChange={handleFile}'));
  assert.ok(media.includes('uploadMediaFile(bucket, file, organizationId)'));
  assert.ok(media.includes('<Camera size={14} /> Câmera'));
});
