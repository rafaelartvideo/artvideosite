import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = file => readFileSync(file, "utf8");

test("Mesma peça e Outra peça abrem confirmação antes da RPC e mantêm motivo/diagnóstico", async () => {
  const gate = read("src/features/orders/presentation/OrderReturnDiagnosisGate.tsx");
  assert.ok((await transformWithEsbuild(gate, "OrderReturnDiagnosisGate.tsx", { loader: "tsx" })).code);
  assert.match(gate, /const \[confirmationOpen, setConfirmationOpen\] = useState\(false\)/);
  assert.match(gate, /setConfirmationOpen\(true\)/);
  assert.match(gate, /open=\{confirmationOpen\}/);
  assert.match(gate, /title=\{damageKind === "same_part" \? "Confirmar garantia procedente" : "Confirmar outro defeito"\}/);
  assert.match(gate, /Deseja confirmar que o defeito é na mesma peça/);
  assert.match(gate, /Deseja confirmar que o defeito é em outra peça/);
  assert.match(gate, /Garantia procedente: o atendimento será liberado sem cobrança/);
  assert.match(gate, /será necessário encaminhar um orçamento e aguardar aprovação/);
  assert.match(gate, /<BtnSecondary disabled=\{busy\}/);
  assert.match(gate, /<BtnPrimary disabled=\{!canConfirm\} loading=\{busy\}/);
  assert.match(gate, /if \(busy \|\| !confirmationOpen \|\| !canClassify\) return/);
  assert.match(gate, /p_damage_kind: damageKind/);
  assert.match(gate, /p_diagnosis: diagnosis\.trim\(\)/);
  assert.match(gate, /p_solution: solution\.trim\(\)/);
  assert.match(gate, /setConfirmationOpen\(false\);\s*onClassified\(damageKind, diagnosis\.trim\(\), solution\.trim\(\)\)/);
  assert.match(gate, /notifyAdmin\(damageKind === "same_part"/);
});

test("Ambos os resultados levam à seção correta e a OS é recarregada do banco", async () => {
  const page = read("src/features/orders/presentation/OrderDetailsPage.tsx");
  assert.ok((await transformWithEsbuild(page, "OrderDetailsPage.tsx", { loader: "tsx" })).code);
  assert.match(page, /return_classification: kind === "same_part" \? "covered" : "unrelated"/);
  assert.match(page, /setDetailSection\(kind === "different_part" \? "products-services" : "details"\)/);
  assert.match(page, /void details\.retryDetailLoad\(\)/);
  assert.match(page, /returnRequiresQuote \|\| \(!detail\?\.return_root_id/);
  assert.match(page, /<OrderReturnDiagnosisGate/);
  assert.match(page, /<OrderQuoteWorkspace/);
  assert.match(page, /<OrderDetailsContent/);
});

test("Trocar OS preserva cabeçalho e subseções, mas usa skeleton somente abaixo delas", async () => {
  const page = read("src/features/orders/presentation/OrderDetailsPage.tsx");
  const tab = read("src/features/orders/presentation/TabOrders.tsx");
  const hook = read("src/features/orders/application/useOrderDetails.ts");
  const skeletons = read("src/features/orders/presentation/OrdersSkeletons.tsx");
  for (const [name, source] of [["OrderDetailsPage",page],["TabOrders",tab],["OrdersSkeletons",skeletons]]) {
    assert.ok((await transformWithEsbuild(source, name + ".tsx", { loader: "tsx" })).code);
  }
  assert.match(page, /!returnDiagnosisActive && <OrderDetailSectionTabs/);
  assert.match(page, /showSwitchLoading\s*\? <OrderDetailsContentSkeleton/);
  assert.match(page, /<OrderDetailsContentSkeleton section=\{detailSection\} returnDiagnosis=\{returnDiagnosisActive\}/);
  assert.doesNotMatch(page, /data-order-switch-overlay|<LoaderCircle/);
  assert.match(hook, /hadHydratedOrder: Boolean\(lastHydratedOrderId\)/);
  assert.match(tab, /detailsController\.hadHydratedOrder && !detailsController\.detailHydrated/);
  assert.match(tab, /transitionPending=\{switchingRoutedOrder\}/);
  assert.match(tab, /!detailHasError && !switchingRoutedOrder/);
  assert.match(skeletons, /export function OrderDetailsContentSkeleton/);
  assert.match(skeletons, /data-order-switch-skeleton="true"/);
  assert.match(skeletons, /<SectionSkeleton lines=\{returnDiagnosis \? 4 : 3\}/);
});
