import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

test("anexos de imagem compartilham os formatos e conversão do visualizador", async () => {
  const viewer = readFileSync("src/features/orders/presentation/OrderImages.tsx", "utf8");
  const documents = readFileSync("src/features/orders/presentation/OrderDocumentsPage.tsx", "utf8");
  for (const [name, source] of [["OrderImages.tsx", viewer], ["OrderDocumentsPage.tsx", documents]]) {
    assert.ok((await transformWithEsbuild(source, name, { loader: "tsx" })).code);
    assert.ok(source.includes("ORDER_IMAGE_DOWNLOAD_OPTIONS.map"));
  }
  for (const [format, label] of [["original", "Baixar original"], ["png", "Baixar em PNG"], ["jpeg", "Baixar em JPEG"], ["pdf", "Baixar em PDF"]]) {
    assert.ok(viewer.includes(JSON.stringify(format) + ", " + JSON.stringify(label)));
  }
  assert.ok(documents.includes("url ? isImage ?"));
  assert.ok(documents.includes('if (isImage && format !== "original")'));
  assert.ok(documents.includes("await downloadOrderImage({ key: document.id, mediaId: document.media_id, url, name }, format, 0)"));
  assert.ok(documents.includes("await downloadRemoteFile(url, name)"));
  assert.ok(documents.includes("onSelect={() => void downloadAttachment(format)}"));
  assert.ok(documents.includes("onClick={() => void downloadAttachment()}"));
  assert.ok(documents.includes('disabled={downloading}'));
});
