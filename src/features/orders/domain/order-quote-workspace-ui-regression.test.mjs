import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const source = file => readFileSync(file, "utf8");

test("envio do orçamento confirma de forma simples e informa apenas o que falta", async () => {
  const file = source("src/features/orders/presentation/OrderQuoteWorkspace.tsx");
  assert.ok((await transformWithEsbuild(file, "OrderQuoteWorkspace.tsx", { loader: "tsx" })).code);
  assert.match(file, /submit: "Confirmar"/);
  assert.match(file, /!modalFeedback && <BtnPrimary/);
  assert.match(file, /if\(!draft\.diagnosis\.trim\(\)\)/);
  assert.match(file, /if\(!draft\.proposed_solution\.trim\(\)\)/);
  assert.match(file, /if\(!draft\.items\.length\)/);
  assert.match(file, /setModalFeedback\(\{type:"error",message:"Para encaminhar o orçamento, "/);
});

test("busca mantém a lupa no campo e os resultados fora do fluxo do formulário", async () => {
  const file = source("src/features/orders/presentation/OrderQuoteCommercialEditor.tsx");
  assert.ok((await transformWithEsbuild(file, "OrderQuoteCommercialEditor.tsx", { loader: "tsx" })).code);
  assert.match(file, /<CatalogResults\s+open=\{searchOpen && !selected\}/);
  assert.doesNotMatch(file, /<CatalogResults\s+contained/);
});

test("itens do orçamento têm grade dupla, valor sem card e fixação persistível", async () => {
  const file = source("src/features/orders/presentation/OrderQuoteCommercialEditor.tsx");
  const repository = source("src/features/orders/infrastructure/order-quote.repository.ts");
  assert.match(file, /xl:grid-cols-2/);
  assert.match(file, /<Pin size=\{15\}/);
  assert.match(file, /pinned:!item\.pinned/);
  assert.match(file, /<Trash2 size=\{15\}/);
  assert.match(file, /h-5 w-px shrink-0 bg-border/);
  assert.match(repository, /pinned\?: boolean/);
});

test("Estilo 4 mantém contorno do Estilo 3 com cores vermelhas em ambos os temas", async () => {
  const shared = source("src/shared/ui/admin/AdminLayout.tsx");
  const css = source("src/styles/index.css");
  const quote = source("src/features/orders/presentation/OrderQuoteWorkspace.tsx");

  assert.ok((await transformWithEsbuild(shared, "AdminLayout.tsx", { loader: "tsx" })).code);
  assert.ok((await transformWithEsbuild(quote, "OrderQuoteWorkspace.tsx", { loader: "tsx" })).code);
  assert.match(shared, /tertiary: "admin-action-blue-outline border"/);
  assert.match(shared, /quaternary: "admin-action-red-outline border"/);
  assert.match(css, /\.admin-crm \.admin-action-red-outline \{/);
  assert.match(css, /\.admin-crm\.dark \.admin-action-red-outline/);
  assert.match(css, /\.admin-crm \.admin-action-red-outline:hover/);
  assert.match(quote, /<AdminButton variant="quaternary" disabled=\{busy\} onClick=\{\(\)=>openAction\("reject"\)\}/);
  assert.doesNotMatch(quote, /<AdminButton variant="secondary" disabled=\{busy\} onClick=\{\(\)=>openAction\("reject"\)\}/);
});
