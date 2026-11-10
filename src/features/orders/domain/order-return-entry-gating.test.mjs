import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("retorno e reabertura ficam somente nos três pontos e consultam o certificado quando necessário", async () => {
  const table = read("src/features/orders/presentation/OrdersTable.tsx");
  const footer = read("src/features/orders/presentation/OrderDetailsActions.tsx");
  const actions = read("src/features/orders/presentation/OrderReturnsPanel.tsx");
  const dialog = read("src/features/orders/presentation/OrderReturnStartDialog.tsx");
  for (const [file, text] of [["OrdersTable", table], ["OrderDetailsActions", footer], ["OrderReturnsPanel", actions], ["OrderReturnStartDialog", dialog]]) {
    assert.ok((await transformWithEsbuild(text, file + ".tsx", { loader: "tsx" })).code);
  }
  assert.match(table, /<DropdownMenuItem onSelect=\{\(\) => setReturnTarget\(order\)\}/);
  assert.match(table, /<OrderReturnStartDialog order=\{returnTarget\}/);
  assert.doesNotMatch(footer, /OrderReturnActions|Iniciar retorno|Reabrir OS/);
  assert.doesNotMatch(actions, /OrderReturnActions|Iniciar retorno|Reabrir OS/);
  assert.match(dialog, /check_service_order_return_eligibility_v1/);
  assert.match(dialog, /reopen_service_order_as_new_v1/);
  assert.match(dialog, /Garantia válida até/);
  assert.match(dialog, /Reabrir OS/);
  assert.match(dialog, /mode\?: "return" \| "reopen"/);
  assert.match(table, /canReopenOrReturn/);
  assert.match(table, /canStartReturn \? "Iniciar retorno" : "Reabrir OS"/);
  assert.match(table, /<RotateCcw size=\{15\} \/> \{canStartReturn \? "Iniciar retorno" : "Reabrir OS"\}/);
  assert.doesNotMatch(actions, /Classificar garantia|<MoreHorizontal/);
});

test("diagnóstico obriga definir mesma ou outra peça antes de liberar o atendimento", async () => {
  const gate = read("src/features/orders/presentation/OrderReturnDiagnosisGate.tsx");
  const detail = read("src/features/orders/presentation/OrderDetailsPage.tsx");
  const footer = read("src/features/orders/presentation/OrderDetailsActions.tsx");
  for (const [file, text] of [["OrderReturnDiagnosisGate", gate], ["OrderDetailsPage", detail], ["OrderDetailsActions", footer]]) {
    assert.ok((await transformWithEsbuild(text, file + ".tsx", { loader: "tsx" })).code);
  }
  assert.match(gate, /classify_service_order_return_v2/);
  assert.match(gate, /same_part/);
  assert.match(gate, /different_part/);
  assert.match(gate, /<CheckCircle2 size=\{17\} \/> Confirmar/);
  assert.match(gate, /footerHost && createPortal/);
  assert.match(gate, /className="h-10 min-w-28 gap-2 px-4"/);
  assert.match(detail, /detail\.return_classification === "analysis"/);
  assert.match(detail, /<OrderReturnDiagnosisGate/);
  assert.match(detail, /setDetailSection\(kind === "different_part" \? "products-services" : "details"\)/);
  assert.match(detail, /const returnRequiresQuote =/);
  assert.match(footer, /quoteExecutionAllowed && !returnAwaitingDiagnosis/);
});

test("banco valida garantia, clona contexto e exige aprovação para peça diferente", () => {
  const guards = read("supabase/migrations/20261110153000_return_warranty_quote_guards.sql");
  const rpc = read("supabase/migrations/20261110154000_return_eligibility_diagnosis_and_new_os.sql");
  const permissions = read("supabase/migrations/20261110155000_return_quote_permissions_and_execution_guard.sql");
  assert.match(guards, /service_order_warranty_certificates/);
  assert.match(guards, /return_classification in \('unrelated','not_covered'\)/);
  assert.match(guards, /orcamento da nova peca precisa ser aprovado/);
  assert.match(rpc, /create_service_order_from_expired_warranty_v1/);
  assert.match(rpc, /service_order_technical_values/);
  assert.match(rpc, /service_order_media/);
  assert.match(rpc, /service_order_situation_media/);
  assert.match(rpc, /service_order_quote_photos/);
  assert.match(rpc, /return_classification=v_classification/);
  assert.match(permissions, /alter policy order_quote_create/);
  assert.match(permissions, /guard_return_items_before_diagnosis/);
  assert.match(permissions, /guard_return_used_before_diagnosis/);
});
