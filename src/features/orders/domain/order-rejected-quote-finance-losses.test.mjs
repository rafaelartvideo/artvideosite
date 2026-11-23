import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";
import { financeRoute } from "../../finance/domain/finance-foundation.mjs";

const read = path => readFileSync(path, "utf8");

test("financeiro abre a aba Perdas e preserva paginação sem baixar todas as propostas", async () => {
  assert.deepEqual(financeRoute("losses", null), { section:"losses", registry:null });
  const tab = read("src/features/finance/presentation/TabFinance.tsx");
  const labels = read("src/features/finance/presentation/FinanceSectionTabs.tsx");
  const losses = read("src/features/finance/presentation/FinanceLossesSection.tsx");
  assert.ok((await transformWithEsbuild(tab,"TabFinance.tsx",{loader:"tsx"})).code);
  assert.ok((await transformWithEsbuild(losses,"FinanceLossesSection.tsx",{loader:"tsx"})).code);
  assert.match(tab, /hasPermission\("finance\.reports\.view"\)\) sections\.push\("losses"\)/);
  assert.match(tab, /<FinanceLossesSection onInitialReady=\{markSectionReady\}/);
  assert.match(labels, /losses: "Perdas"/);
  assert.match(losses, /get_financial_losses_summary_v1/);
  assert.match(losses, /\.range\(\(page-1\)\*pageSize,page\*pageSize-1\)/);
});

test("orçamento reprovado permite devolução documentada sem execução de reparo", async () => {
  const quote = read("src/features/orders/presentation/OrderQuoteWorkspace.tsx");
  const dialog = read("src/features/orders/presentation/OrderTerminalExitDialog.tsx");
  const migration=read("supabase/migrations/20261123095700_unify_signed_unrepaired_returns.sql");
  const page = read("src/features/orders/presentation/OrderDetailsPage.tsx");
  assert.ok((await transformWithEsbuild(quote,"OrderQuoteWorkspace.tsx",{loader:"tsx"})).code);
  assert.ok((await transformWithEsbuild(dialog,"OrderTerminalExitDialog.tsx",{loader:"tsx"})).code);
  assert.ok((await transformWithEsbuild(page,"OrderDetailsPage.tsx",{loader:"tsx"})).code);
  assert.match(quote, /Finalizar devolução/);
  assert.match(quote, /proposal\?\.status==="rejected" && !order\.completed_at/);
  assert.match(quote, /onRequestReturn\?\.\(/);
  assert.match(page, /setTerminalOutcome\("returned_unrepaired"\)/);
  assert.match(dialog, /completeOrderTerminalExit/);
  assert.match(dialog, /signedRequests/);
  assert.match(dialog, /attachOrderSituationDocument/);
  assert.match(migration, /revoke all on function public\.close_rejected_quote_return_v1/);
  assert.match(page, /DEVOLVIDA SEM REPARO/);
  assert.match(page, /signedReturnTerm/);
  assert.match(page, /regularizeLegacyReturn/);
  // A situação de avaliação não deve aparecer como ativa após fechar a devolução.
  assert.match(page, /!\(detail\.completed_at && detail\.closure_outcome === "rejected_quote_return"\)/);
  const table = read("src/features/orders/presentation/OrdersTable.tsx");
  assert.ok((await transformWithEsbuild(table,"OrdersTable.tsx",{loader:"tsx"})).code);
  assert.match(table, /const isRejectedQuoteReturnClosed/);
  assert.match(table, /order\.completed_at && order\.closure_outcome === "rejected_quote_return"/);
  assert.equal((table.match(/situationDisplay\(o\)/g)||[]).length,2);
  assert.match(table, /Última situação:/);
});

test("perdas preservam valor, motivo e versão sem criar título financeiro", () => {
  const loss = read("supabase/migrations/20261117101700_finance_losses_quote_rejections.sql");
  const closure = read("supabase/migrations/20261117101800_close_rejected_quote_return.sql");
  const details = read("supabase/migrations/20261117102100_service_order_workspace_return_outcome.sql");
  assert.match(loss, /CREATE TABLE IF NOT EXISTS public\.financial_losses/);
  assert.match(loss, /source_id,quote_version/);
  assert.match(loss, /status='recovered'/);
  assert.match(loss, /status='superseded'/);
  assert.match(loss, /private\.has_effective_organization_permission\(organization_id,'finance\.reports\.view'\)/);
  assert.match(closure, /close_rejected_quote_return_v1/);
  assert.match(closure, /new\.closure_outcome='rejected_quote_return'/);
  assert.match(closure, /Anexe a evidência de entrega/);
  assert.match(closure, /v_quote\.status<>'rejected'/);
  assert.doesNotMatch(closure, /insert into public\.financial_entries/i);
  assert.match(details, /'closure_outcome', so\.closure_outcome/);
});
