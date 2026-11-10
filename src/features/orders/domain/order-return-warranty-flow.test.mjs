import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("classificação obrigatória antes da conclusão, na toolbar, lista e hook", async () => {
  const actions = read("src/features/orders/presentation/OrderDetailsActions.tsx");
  const table = read("src/features/orders/presentation/OrdersTable.tsx");
  const completion = read("src/features/orders/application/useOrderCompletion.ts");
  for (const [path, source] of [["OrderDetailsActions.tsx", actions],["OrdersTable.tsx",table],["useOrderCompletion.ts",completion]]) {
    assert.ok((await transformWithEsbuild(source, path, { loader: "tsx" })).code);
  }
  assert.match(actions, /const returnReady =/);
  assert.match(actions, /returnReady && !detail\.completed_at/);
  assert.match(table, /return_classification !== "analysis"/);
  assert.match(completion, /Classifique a garantia do retorno antes de abrir a conclusão/);
  assert.match(completion, /if \(returnAwaitingClassification\)/);
});

test("garantia procedente ou cortesia: abatimento integral sem pagamento e com bloqueio no banco", async () => {
  const sql = read("supabase/migrations/20261110143000_service_order_returns_warranty_completion.sql");
  const hook = read("src/features/orders/application/useOrderCompletion.ts");
  const modal = read("src/features/orders/presentation/OrderCompletionModal.tsx");
  assert.ok((await transformWithEsbuild(modal, "OrderCompletionModal.tsx", { loader: "tsx" })).code);
  assert.match(sql, /v_order\.return_classification in \('covered','courtesy'\)/);
  assert.match(sql, /v_discount_amount:=v_subtotal/);
  assert.match(sql, /return_classification,'analysis'/);
  assert.match(sql, /coalesce\(new\.final_total,0\)=0/);
  assert.match(hook, /const targetFinalTotal = targetCoverageFree \? 0 :/);
  assert.match(hook, /const discountAmount = coverageFree \? subtotal :/);
  assert.match(modal, /completion\.coverageFree/);
  assert.match(modal, /[Nn]ão serão gerados recebimentos/);
});
