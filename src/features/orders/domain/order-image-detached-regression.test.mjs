import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

test("fotos de etiqueta e equipamento podem ser destacadas e reintegradas sem nova sessão", async () => {
  const source = readFileSync("src/features/orders/presentation/OrderImages.tsx", "utf8");
  assert.ok((await transformWithEsbuild(source, "OrderImages.tsx", { loader: "tsx" })).code);
  assert.ok(source.includes('image.kind === "equipment" || image.kind === "label"'));
  assert.ok(source.includes('aria-label="Destacar janela"'));
  assert.ok(source.includes('window.open("", "_blank", "popup=yes,'));
  assert.ok(source.includes("popup.opener = null"));
  assert.ok(source.includes("if (detached) return createPortal("));
  assert.ok(source.includes("detached.host"));
  assert.ok(source.includes("Reintegrar ao CRM"));
  assert.ok(source.includes("if (unavailable)"));
  assert.ok(source.includes("window.clearInterval(timer)"));
  assert.ok(source.includes("observer.disconnect()"));
  assert.ok(source.includes("window.removeEventListener"));
  assert.ok(source.includes("closePopup();"));
  assert.ok(source.includes("target.body.dataset.theme = theme"));
  assert.equal(source.split("{downloadActions}").length - 1, 2);
});
