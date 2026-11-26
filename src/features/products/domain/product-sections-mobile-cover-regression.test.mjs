import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = file => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

test("atributos e códigos relacionados seguem Section do CRM na aba Geral", async () => {
  const page = read("src/features/products/presentation/TabProducts.tsx");
  const matrix = read("src/features/products/presentation/ProductVariationMatrix.tsx");
  for (const [name, source] of [["TabProducts.tsx", page], ["ProductVariationMatrix.tsx", matrix]]) {
    assert.ok((await transformWithEsbuild(source, name, { loader: "tsx" })).code);
  }
  const generalStart = page.indexOf('<TabsContent value="general"');
  const commercialStart = page.indexOf('<TabsContent value="commercial"');
  assert.ok(generalStart >= 0 && commercialStart > generalStart);
  const general = page.slice(generalStart, commercialStart);
  assert.ok(!page.includes('<TabsContent value="relationships"'));
  const relations = general.slice(general.indexOf('Criar atributos e variações'));
  assert.ok(general.indexOf('Criar atributos e variações') > general.indexOf('label="Nome do item"'));
  assert.ok(relations.indexOf('Códigos relacionados') > relations.indexOf('<ProductVariationMatrix'));
  assert.ok(relations.includes('Criar atributos e variações'));
  assert.ok(relations.includes('aria-label="Ajuda sobre criar atributos e variações"'));
  assert.ok(relations.includes('{variantOptions.length}/{MAX_VARIATION_ATTRIBUTES} atributos'));
  assert.ok(relations.includes('actions={<span className="whitespace-nowrap text-sm font-extrabold text-foreground">'));
  assert.ok(relations.includes('<ProductVariationMatrix'));
  assert.ok(relations.includes('Códigos relacionados'));
  assert.ok(relations.includes('aria-label="Ajuda sobre códigos relacionados"'));
  assert.ok(relations.includes('actions={<AdminButton'));
  assert.ok(relations.includes('Adicionar código'));
  assert.ok(relations.includes('form.related_codes.map((item, index)'));
  assert.ok(relations.includes('justify-center text-center text-xs text-muted-foreground">Nenhum código relacionado cadastrado.'));
  assert.ok(!relations.includes('description="Defina atributos, gere as combinações disponíveis'));

  assert.ok(!matrix.includes('>Criar variações</h3>'), "O cabeçalho da Section substitui o título duplicado");
});

test("Categoria, Subcategoria, Marca, Modelo e Condição ficam em linhas individuais no celular", () => {
  const page = read("src/features/products/presentation/TabProducts.tsx");
  const general = page.slice(
    page.indexOf('<TabsContent value="general"'),
    page.indexOf('<TabsContent value="commercial"'),
  );
  assert.ok(general.includes('grid min-w-0 grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2 sm:gap-4'));
  const labels = ["Categoria", "Subcategoria", "Marca", "Modelo", "Condição do produto"];
  const positions = labels.map(label => general.indexOf(`label="${label}"`));
  assert.ok(positions.every(position => position >= 0));
  assert.ok(positions.every((p, i) => i === 0 || p > positions[i - 1]));
  assert.ok(!general.includes('grid min-w-0 grid-cols-2 gap-3 sm:col-span-2 sm:gap-4'));
});

test("fotos do produto ficam em Geral, com câmera, capa e limite compartilhado com loja", async () => {
  const page = read("src/features/products/presentation/TabProducts.tsx");
  assert.ok((await transformWithEsbuild(page, "TabProducts.tsx", { loader: "tsx" })).code);
  const general = page.slice(page.indexOf('<TabsContent value="general"'), page.indexOf('<TabsContent value="commercial"'));
  const store = page.slice(page.indexOf('<TabsContent value="store"'));
  assert.ok(general.includes('title="Fotos do produto"'));
  assert.ok(!store.includes('title="Fotos da loja"'));
  assert.ok(!store.includes('ref={galleryFileInputRef}'));
  assert.ok(!general.includes('<ImageUpload'));
  assert.ok(general.includes('galleryCameraInputRef.current?.click()'));
  assert.ok(general.includes('capture="environment"'));
  assert.ok(general.includes('onChange={handleGalleryUpload}'));
  assert.ok(page.includes('uploadMediaFile("product-images", file, activeOrganizationId)'));
  assert.ok(general.includes('4 - storePhotos.length'));
  assert.ok(general.includes('form.cover_media_id === image.media_id'));
  assert.ok(general.includes('cover_media_id: next?.media_id || ""'));
  assert.ok(page.includes('galleryPhotoCount < 4'));
  assert.ok(page.includes('gallery_media_ids: Array.from(new Set([form.cover_media_id, ...galleryMedia.map(image => image.media_id)].filter(Boolean))).slice(0, 4)'));
  assert.ok(store.includes('coverPreviewUrl'));
  assert.ok(page.includes('request !== galleryRequestRef.current'));
  assert.ok(page.includes('galleryLoadState !== "ready"'));
  assert.ok(general.includes('Tentar novamente'));
  const advanced = general.indexOf("Características avançadas (opcional)");
  assert.ok(advanced > general.indexOf("Códigos relacionados"));
  assert.ok(advanced > general.indexOf("Modelos de aparelhos compatíveis"));
  assert.ok(advanced > general.indexOf("Fotos do produto"));
  assert.ok(general.trimEnd().endsWith("</TabsContent>"));
});

test("ajuda contextual substitui mensagens redundantes e avisa atributo duplicado sob seu input", async () => {
  const page = read("src/features/products/presentation/TabProducts.tsx");
  const matrix = read("src/features/products/presentation/ProductVariationMatrix.tsx");
  const variations = read("src/features/products/presentation/ProductVariationsEditor.tsx");
  for (const [name, source] of [
    ["TabProducts.tsx", page],
    ["ProductVariationMatrix.tsx", matrix],
    ["ProductVariationsEditor.tsx", variations],
  ]) assert.ok((await transformWithEsbuild(source, name, { loader: "tsx" })).code);

  assert.ok(page.includes('aria-label="Ajuda sobre criar atributos e variações"'));
  assert.ok(page.includes('Ex.: cor, voltagem, tamanho, acabamento ou modelo.'));
  assert.ok(page.includes('{variantOptions.length}/{MAX_VARIATION_ATTRIBUTES} atributos'));
  assert.ok(matrix.includes('<AttributeFieldHelp field="nome do atributo"'));
  assert.ok(matrix.includes("Não repita nomes de atributos no mesmo produto."));
  assert.ok(matrix.includes('<AttributeFieldHelp field="valores do atributo"'));
  assert.ok(matrix.includes("Preencha todos os nomes e valores antes de gerar combinações."));
  assert.ok(matrix.includes('const duplicateName = Boolean(normalizedName)'));
  assert.ok(matrix.includes('aria-invalid={duplicateName}'));
  assert.ok(matrix.includes('duplicateName && <p role="alert"'));
  assert.ok(!matrix.includes("Adicione um atributo com valores para gerar combinações."));
  assert.ok(!matrix.includes("Preencha o nome e pelo menos um valor de cada atributo."));
  assert.ok(!matrix.includes("0 combinações possíveis"));
  assert.ok(!matrix.includes("até {availableSlots} adicionais, mais o produto principal."));
  assert.ok(!matrix.includes("Preencha todos os nomes e valores e não repita nomes de atributos."));
  assert.ok(variations.includes("Nenhuma variação vinculada ainda."));
  assert.ok(variations.includes("min-h-20 items-center justify-center text-center"));
  assert.ok(page.includes("Nenhum código relacionado cadastrado."));
  assert.ok(page.includes('min-h-20 items-center justify-center text-center'));
});
