import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path,"utf8");
const migration = read("supabase/migrations/20261110171000_service_type_warranty_and_reopen_os.sql");

test("configuração da garantia somente em tipos com orçamento: banco e formulário", async () => {
  const screen = read("src/features/service-types/presentation/ServiceTypesAdminPanel.tsx");
  assert.ok((await transformWithEsbuild(screen,"ServiceTypesAdminPanel.tsx",{loader:"tsx"})).code);
  assert.match(screen,/label="Gerar certificado de garantia"/);
  assert.match(screen,/\{form\.quote_workflow_enabled && <div/);
  assert.match(screen,/generates_warranty: form\.quote_workflow_enabled && form\.generates_warranty/);
  assert.match(screen,/quote_workflow_enabled: value, generates_warranty: value \? current\.generates_warranty : false/);
  assert.match(migration,/check \(not generates_warranty or quote_workflow_enabled\)/);
  assert.match(migration,/new\.generates_warranty := false/);
  assert.match(migration,/and st\.quote_workflow_enabled and st\.generates_warranty/);
  assert.match(migration,/issue_service_order_warranty_v1/);
});

test("Reabrir OS cria um novo número com dados e fotos, sem fluxo de retorno", () => {
  const start = read("src/features/orders/presentation/OrderReturnStartDialog.tsx");
  const panel = read("src/features/orders/presentation/OrderReturnsPanel.tsx");
  const table = read("src/features/orders/presentation/OrdersTable.tsx");
  assert.match(start,/reopen_service_order_as_new_v1/);
  assert.match(start,/mode\?: "return" \| "reopen"/);
  assert.match(start,/Confirmar reabertura/);
  assert.match(panel,/const label = canStartReturn \? "Iniciar retorno" : "Reabrir OS"/);
  assert.match(table,/canStartReturn \? "Iniciar retorno" : "Reabrir OS"/);
  assert.match(migration,/FUNCTION public\.reopen_service_order_as_new_v1/);
  assert.match(migration,/v_source\.customer_id/);
  assert.match(migration,/v_source\.equipment_type_id/);
  assert.match(migration,/service_order_quote_photos/);
  assert.match(migration,/Novo atendimento a partir da OS/);
  assert.match(migration,/Retorno R1 disponivel somente para tipos com orcamento e garantia habilitada/);
});

test("retornos não podem usar Editar OS nem por URL", async () => {
  const actions = read("src/features/orders/presentation/OrderDetailsActions.tsx");
  const table = read("src/features/orders/presentation/OrdersTable.tsx");
  const editor = read("src/features/orders/application/useOrderEditorWorkflow.ts");
  const state = read("src/features/orders/infrastructure/orders.repository.ts");
  for (const [file,source] of [["OrderDetailsActions.tsx",actions],["OrdersTable.tsx",table],["useOrderEditorWorkflow.ts",editor]]) {
    assert.ok((await transformWithEsbuild(source,file,{loader:"tsx"})).code);
  }
  assert.match(actions,/!detail\.return_root_id && !returnAwaitingDiagnosis/);
  assert.match(table,/canEditOrder && !order\.return_root_id/);
  assert.match(editor,/if\(order\?\.return_root_id\)/);
  assert.match(editor,/if\(currentOrder\?\.return_root_id\)/);
  assert.match(editor,/if\(editingOrder\?\.return_root_id\)/);
  assert.match(state,/\.select\("is_solved,return_root_id,diagnosis/);
});

test("sem garantia, a conclusão financeira não tenta emitir nem imprimir certificado", async () => {
  const hook = read("src/features/orders/application/useOrderCompletion.ts");
  const modal = read("src/features/orders/presentation/OrderCompletionModal.tsx");
  const detail = read("src/features/orders/presentation/OrderDetailsPage.tsx");
  assert.ok((await transformWithEsbuild(hook,"useOrderCompletion.ts",{loader:"tsx"})).code);
  assert.ok((await transformWithEsbuild(modal,"OrderCompletionModal.tsx",{loader:"tsx"})).code);
  assert.ok((await transformWithEsbuild(detail,"OrderDetailsPage.tsx",{loader:"tsx"})).code);
  assert.match(hook,/const generatesWarranty =/);
  assert.match(hook,/if \(generatesWarranty\) void loadWarrantyOptions/);
  assert.match(hook,/if \(generatesWarranty\) \{\s*setCertificateBusy\(true\)/);
  assert.match(modal,/\{completion\.generatesWarranty && <Section title="Certificado de garantia"/);
  assert.match(modal,/\{completion\.generatesWarranty && \(completion\.issuedCertificate \?/);
  assert.match(detail,/detail\.completed_at && generatesWarranty && <DropdownMenuItem/);
  assert.match(migration,/Este tipo de atendimento nao emite garantia/);
});
