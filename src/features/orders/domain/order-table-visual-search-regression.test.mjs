import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";
const read = path => readFileSync(path, "utf8");

test("solucionar tem ferramenta visível e pedir peças utiliza estilo 3", async () => {
  const ui=read("src/features/orders/presentation/OrderDetailsActions.tsx");
  assert.ok((await transformWithEsbuild(ui,"OrderDetailsActions.tsx",{loader:"tsx"})).code);
  assert.match(ui, /canRequestParts && <AdminButton variant="tertiary"/);
  assert.match(ui, /<Wrench className="h-5 w-5 shrink-0 md:h-4 md:w-4"/);
});

test("produto e serviço têm um único indicador de busca, desde o foco até os resultados", async () => {
  const execution=read("src/features/orders/presentation/OrderProductsServicesSection.tsx");
  const quote=read("src/features/orders/presentation/OrderQuoteCommercialEditor.tsx");
  for(const [name,content] of [["OrderProductsServicesSection.tsx",execution],["OrderQuoteCommercialEditor.tsx",quote]]) {
    assert.ok((await transformWithEsbuild(content,name,{loader:"tsx"})).code);
    assert.match(content, /<CatalogResults/);
  }
  assert.match(execution, /if \(!selectedProduct\) setProductSearching\(true\)/);
  assert.match(execution, /setProductOptions\(\[\]\);/);
  assert.match(execution, /setServiceOptions\(\[\]\);/);
  assert.doesNotMatch(execution, /serviceSearching && serviceSearchOpen && !selectedService && <span/);
  assert.match(quote, /if \(!selected\) setSearching\(true\)/);
  assert.doesNotMatch(quote, /isService && searching && searchOpen && !selected && <span/);
});

test("avulso usa estilo 3 e mesma largura/altura de adicionar com divisória", () => {
  for (const path of ["src/features/orders/presentation/OrderProductsServicesSection.tsx","src/features/orders/presentation/OrderQuoteCommercialEditor.tsx"]) {
    const ui=read(path);
    assert.match(ui, /variant="tertiary"[^\n]*className="h-\[42px\] w-\[130px\]/);
    assert.match(ui, /<span className="h-8 w-px shrink-0 bg-border" aria-hidden="true" \/>/);
    assert.match(ui, /sm:w-\[130px\] sm:px-3/);
  }
});

test("tabela de OS ganha espaço para situação, duas linhas e coluna Agendamento", async () => {
  const ui=read("src/features/orders/presentation/OrdersTable.tsx");
  const css=read("src/styles/index.css");
  const skeleton=read("src/features/orders/presentation/OrdersSkeletons.tsx");
  assert.ok((await transformWithEsbuild(ui,"OrdersTable.tsx",{loader:"tsx"})).code);
  assert.match(ui, /<th className="w-32 text-left">Agendamento<\/th>/);
  assert.doesNotMatch(ui, /Data de agendamento/);
  assert.match(ui, /<th className="w-28 text-left">Tipo de atendimento<\/th>/);
  assert.match(ui, /<th className="w-60 min-w-\[235px\] text-left">Situação<\/th>/);
  assert.match(ui, /orders-situation-clamp min-w-0 flex-1/);
  assert.match(css, /-webkit-line-clamp: 2/);
  assert.match(css, /text-align: left/);
  assert.match(skeleton, /\{ key: "situation", width: "240px" \}/);
});
