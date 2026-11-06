import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("Estoque uses the product editor for Novo item, with animation disabled", async () => {
  const wrapper = read("src/features/inventory/presentation/TabInventory.tsx");
  const editor = read("src/features/products/presentation/TabProducts.tsx");
  assert.match(wrapper, /return <TabProducts/);
  assert.match(editor, /title=\{editItem \? "Editar item" : "Novo item"\}/);
  assert.match(editor, /<AdminPage[\s\S]*?disableAnimation/);
  assert.ok((await transformWithEsbuild(editor, "TabProducts.tsx", { loader: "tsx" })).code);
});

test("Cancelar cannot re-open Novo item or flash loading while the old route is exiting", () => {
  const editor = read("src/features/products/presentation/TabProducts.tsx");
  assert.match(editor, /const closingEditorRouteRef = useRef\(false\)/);
  assert.match(editor, /const closeEditorRoute = \(\) => \{\s*closingEditorRouteRef\.current = Boolean\(onRouteChange\)/);
  assert.match(editor, /const closeEditor = \(\) => \{\s*if \(saving \|\| galleryUploading\) return;\s*closeEditorRoute\(\)/);
  assert.match(editor, /if \(closingEditorRouteRef\.current\) return;\s*pendingEditorRouteRef\.current = false;/);
  assert.match(editor, /routeResourceId && !drawerOpen && !closingEditorRouteRef\.current/);
  assert.match(editor, /const openNewPage = \(\) => \{[\s\S]*?closingEditorRouteRef\.current = false;/);
  assert.match(editor, /const openEditPage = \(item: any\) => \{[\s\S]*?closingEditorRouteRef\.current = false;/);
});

test("Save and Cancel use the same exit path without changing inventory persistence", () => {
  const editor = read("src/features/products/presentation/TabProducts.tsx");
  const close = editor.split("const closeEditorRoute = () => {")[1].split("\n  };")[0];
  assert.match(close, /setDrawerOpen\(false\)/);
  assert.match(close, /onRouteChange\?\.\(null, null\)/);
  assert.match(editor, /closeEditorRoute\(\);\s*setToast\(\{ msg: editItem/);
  assert.match(editor, /saveCompleteProduct/);
  assert.match(editor, /replaceRelatedProductCodes/);
});
