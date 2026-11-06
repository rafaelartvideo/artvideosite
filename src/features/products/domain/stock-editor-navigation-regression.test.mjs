import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../../../../../", import.meta.url);
const stock = readFileSync(new URL("src/features/products/presentation/TabProducts.tsx", root), "utf8");
const adminPage = readFileSync(new URL("src/shared/ui/admin/AdminLayout.tsx", root), "utf8");

test("novo item não fecha durante sincronização da rota", () => {
  assert.match(stock, /const pendingEditorRouteRef = useRef\(false\)/);
  assert.match(stock, /pendingEditorRouteRef\.current = Boolean\(onRouteChange\)/);
  assert.match(stock, /if \(pendingEditorRouteRef\.current\) return;/);
  assert.match(stock, /pendingEditorRouteRef\.current = false;/);
  assert.match(stock, /onRouteChange\?\.\("new", null\)/);
});

test("estoque usa navegação instantânea, sem animar abertura ou fechamento", () => {
  assert.match(stock, /<AdminPage[\s\S]*?disableAnimation/);
  assert.match(adminPage, /disableAnimation = false/);
  assert.match(adminPage, /"!animate-none !transition-none"/);
});
