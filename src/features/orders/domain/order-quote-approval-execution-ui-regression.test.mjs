import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("modal de aprovação mostra somente carregamento central até consultar os itens", async () => {
  const ui = read("src/features/orders/presentation/OrderQuoteWorkspace.tsx");
  assert.ok((await transformWithEsbuild(ui, "OrderQuoteWorkspace.tsx", { loader: "tsx" })).code);
  assert.match(ui, /approve: "Confirmar"/);
  assert.doesNotMatch(ui, /approve: "Confirmar aprovação"/);
  assert.match(ui, /const requestId=\+\+approvalLookupId\.current/);
  assert.match(ui, /if\(approvalLookupId\.current===requestId\)setExecutionItemsLoading\(false\)/);
  assert.match(ui, /description=\{confirmationAction==="approve" && executionItemsLoading \? undefined/);
  assert.match(ui, /footer=\{confirmationAction==="approve" && executionItemsLoading \? undefined/);
  assert.match(ui, /\(busy \|\| \(confirmationAction==="approve" && executionItemsLoading\)\)/);
  assert.doesNotMatch(ui, /Consultando itens da execução/);
});

test("aprovação mostra produtos e serviços diretamente na subseção da OS", async () => {
  const quote = read("src/features/orders/presentation/OrderQuoteWorkspace.tsx");
  const details = read("src/features/orders/presentation/OrderDetailsPage.tsx");
  assert.ok((await transformWithEsbuild(details, "OrderDetailsPage.tsx", { loader: "tsx" })).code);
  assert.match(quote, /proposal\?\.status==="approved"\s*\? <section aria-label="Produtos e serviços da OS"/);
  assert.match(quote, /<OrderProductsServicesSection\s+order=\{order\} canEdit=\{canEdit\}/);
  assert.match(quote, /onOverviewChange=\{onOverviewChange\}/);
  assert.match(details, /onOverviewChange=\{handleItemsOverviewChange\}/);
  assert.doesNotMatch(quote, /showExecution|setShowExecution|Abrir produtos e serviços para execução/);
});

test("cards de execução reproduzem grade e preço do orçamento com progresso no rodapé", async () => {
  const execution = read("src/features/orders/presentation/OrderProductsServicesSection.tsx");
  const proposal = read("src/features/orders/presentation/OrderQuoteCommercialEditor.tsx");
  assert.ok((await transformWithEsbuild(execution, "OrderProductsServicesSection.tsx", { loader: "tsx" })).code);
  assert.match(proposal, /xl:grid-cols-2/);
  assert.match(execution, /grid-cols-1 gap-3 p-3 sm:gap-4 sm:p-4 xl:grid-cols-2/);
  assert.match(execution, /<header className="flex min-w-0 items-center justify-between/);
  assert.match(execution, /h-5 w-px shrink-0 bg-border/);
  assert.match(execution, /Quantidade<\/span>/);
  assert.match(execution, /Preço unitário<\/span>/);
  assert.match(execution, /Custo adicional<\/span>/);
  assert.match(execution, /<footer className="border-t border-border bg-muted\/20/);
  assert.match(execution, /: renderTaskProgress\(item\)/);
  assert.match(execution, /renderStatusTag\(item\)/);
  assert.match(execution, /renderTaskDetails\(item\)/);
  assert.match(execution, /Produto registrado na OS · acompanhamento técnico não aplicável/);
  assert.match(execution, /aria-valuenow=\{progress\}/);
});
