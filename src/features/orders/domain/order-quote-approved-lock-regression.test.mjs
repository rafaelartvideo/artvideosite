import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("OS aprovada bloqueia edição comercial, sem desativar tarefas e agendamento", async () => {
  const execution = read("src/features/orders/presentation/OrderProductsServicesSection.tsx");
  const quote = read("src/features/orders/presentation/OrderQuoteWorkspace.tsx");
  assert.ok((await transformWithEsbuild(execution, "OrderProductsServicesSection.tsx", { loader: "tsx" })).code);
  assert.ok((await transformWithEsbuild(quote, "OrderQuoteWorkspace.tsx", { loader: "tsx" })).code);
  assert.match(execution, /const commercialEditable = editable && !commercialLocked/);
  assert.match(execution, /\{commercialEditable && <div className="grid gap-4 lg:grid-cols-2">/);
  assert.match(execution, /\{commercialEditable && <AdminIconButton ariaLabel=\{"Remover "/);
  assert.match(execution, /if \(!commercialEditable\) return/);
  assert.match(execution, /if \(unchanged \|\| !commercialEditable\) return/);
  assert.match(execution, /disabled=\{!commercialEditable \|\| savingItemId === item.id\}/);
  assert.match(execution, /if \(!commercialEditable \|\| !order\?\.id \|\| discountSaveRevision === 0\) return/);
  assert.match(execution, /if \(!schedulingItem \|\| !editable \|\| scheduleSaving\) return/);
  assert.match(quote, /order=\{order\} canEdit=\{canEdit\} commercialLocked formatCurrency=\{formatCurrency\}/);
  assert.match(execution, /!commercialEditable && !commercialLocked/);
  assert.doesNotMatch(execution, /Orçamento aprovado: itens e valores só podem ser alterados/);
});

test("tag orçamento aprovado some após solucionar ou concluir, sem alterar aprovação", async () => {
  const details = read("src/features/orders/presentation/OrderDetailsPage.tsx");
  const quoteBadge = read("src/features/orders/presentation/OrderQuoteStatusBadge.tsx");
  assert.ok((await transformWithEsbuild(details, "OrderDetailsPage.tsx", { loader: "tsx" })).code);
  assert.match(details, /const showQuoteStatusBadge = quoteWorkflowEnabled && quoteState\?\.orderId === detail\?\.id/);
  assert.match(details, /!\(quoteState\.status === "approved" && \(detail\?\.is_solved \|\| detail\?\.completed_at\)\)/);
  assert.match(details, /showQuoteStatusBadge && <OrderQuoteStatusBadge status=\{quoteState!\.status\}/);
  assert.match(details, /const quoteExecutionAllowed = !quoteWorkflowEnabled/);
  assert.match(quoteBadge, /approved: \{ label: "Aprovado"/);
});

test("menu de ações aparece ao lado da aba Orçamento só quando há aprovação", () => {
  const details = read("src/features/orders/presentation/OrderDetailsPage.tsx");
  const tabs = read("src/features/orders/presentation/OrderDetailSectionTabs.tsx");
  const quote = read("src/features/orders/presentation/OrderQuoteWorkspace.tsx");
  assert.match(details, /commercialActionsHostId=\{quoteWorkflowEnabled && detailSection === "products-services"/);
  assert.match(details, /actionsHostId=\{"os-quote-actions-" \+ detail.id\}/);
  assert.match(tabs, /id=\{commercialActionsHostId\}/);
  assert.match(quote, /actionsHost && proposal\?\.status==="approved"/);
  assert.match(quote, /createPortal\(/);
});

test("reabertura exige motivo, gera nova versão e nova aprovação", async () => {
  const quote = read("src/features/orders/presentation/OrderQuoteWorkspace.tsx");
  const repository = read("src/features/orders/infrastructure/order-quote.repository.ts");
  assert.match(quote, /onSelect=\{\(\)=>openAction\("reopen"\)\}/);
  assert.match(quote, /<MoreVertical size=\{18\}/);
  assert.match(quote, /aria-label="Ações do orçamento"/);
  assert.doesNotMatch(quote, /Produtos e serviços da OS/);
  assert.match(quote, /Justificativa para reabrir o orçamento/);
  assert.match(quote, /reason\.trim\(\)\.length<5/);
  assert.match(quote, /reopenApprovedOrderQuote\(org,orderId,reason\)/);
  assert.match(quote, /reconcile_mode:revisingApprovedQuote\?"replace":"reuse"/);
  assert.match(quote, /revisingApprovedQuote && !canReuseExecution/);
  assert.match(repository, /reopen_approved_service_order_quote_v1/);
  assert.match(repository, /approved_at,applied_at,updated_at/);
  assert.match(quote, /onStatusChange\?\.\(result\.status\)/);
});

test("Supabase impede alterações de itens e desconto após aprovação, preserva histórico", () => {
  const migration = read("supabase/migrations/20261106143238_approved_order_quote_reopen_with_reason_and_lock.sql");
  const discount = read("supabase/migrations/20261106143713_lock_approved_quote_discount.sql");
  const obsolete = read("supabase/migrations/20261106143911_disable_new_unsolvable_os.sql");
  const history = read("supabase/migrations/20261106144519_approved_quote_history_audit_helper.sql");
  assert.match(migration, /reopen_approved_service_order_quote_v1/);
  assert.match(migration, /reopen_approved_service_order_quote_v1\(uuid,uuid,text\) to authenticated/);
  assert.match(migration, /service_order_items_protect_approved_quote/);
  assert.match(migration, /service_order_quote_proposal_protect_workflow/);
  assert.match(migration, /service_order_item_task_photos/);
  assert.match(migration, /service_order_item_task_events/);
  assert.match(migration, /service_order_history_notes/);
  assert.match(migration, /reconcile_mode/);
  assert.match(migration, /app\.quote_commercial_mutation/);
  assert.match(discount, /Desconto aprovado bloqueado/);
  assert.match(obsolete, /service_orders_prevent_new_unsolvable/);
  assert.match(history, /record_approved_quote_reopening_v1/);
  assert.match(history, /service_order_history_notes/);
  assert.match(history, /private\.can_view_service_order/);
});

test("Solucionar remove campos e não solucionável; mostra cards com itens da OS", async () => {
  const resolution = read("src/features/orders/presentation/OrderResolutionPage.tsx");
  const listing = read("src/features/orders/presentation/OrderResolutionCommercialItems.tsx");
  const workflow = read("src/features/orders/application/useOrderResolution.ts");
  assert.ok((await transformWithEsbuild(resolution, "OrderResolutionPage.tsx", { loader: "tsx" })).code);
  assert.ok((await transformWithEsbuild(listing, "OrderResolutionCommercialItems.tsx", { loader: "tsx" })).code);
  assert.ok((await transformWithEsbuild(workflow, "useOrderResolution.ts", { loader: "ts" })).code);
  assert.doesNotMatch(resolution, /Resultado do atendimento|OS não pode ser solucionada|<InfoRow label="Versão"|<InfoRow label="Lacre"|<InfoRow label="Garantia"/);
  assert.doesNotMatch(workflow, /markServiceOrderUnsolvable|cannotSolveReason|solveDraft\.cannotSolve/);
  assert.match(resolution, /<OrderResolutionCommercialItems organizationId=/);
  assert.match(listing, /listOrderCommercialItems\(orderId\)/);
  assert.match(listing, /listOrderServiceTasks\(orderId\)/);
  assert.match(listing, /xl:grid-cols-2/);
  assert.match(listing, /role="progressbar"/);
});
