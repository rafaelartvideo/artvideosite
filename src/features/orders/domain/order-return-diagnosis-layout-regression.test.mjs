import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("modal fora da garantia possui aviso acessível de alto contraste e exclamação", async () => {
  const dialog = read("src/features/orders/presentation/OrderReturnStartDialog.tsx");
  assert.ok((await transformWithEsbuild(dialog, "OrderReturnStartDialog.tsx", { loader: "tsx" })).code);
  assert.match(dialog, /<CircleAlert size=\{19\} strokeWidth=\{2\.5\} \/>/);
  assert.match(dialog, /role="alert" className="flex items-start gap-3 rounded-xl/);
  assert.match(dialog, /bg-amber-50/);
  assert.match(dialog, /text-amber-950/);
  assert.match(dialog, /dark:bg-amber-500\/15 dark:text-amber-100/);
  assert.match(dialog, /dark:text-slate-200/);
});

test("diagnóstico reutiliza a seção completa de equipamento como primeira seção", async () => {
  const detail = read("src/features/orders/presentation/OrderDetailsPage.tsx");
  const content = read("src/features/orders/presentation/OrderDetailsContent.tsx");
  assert.ok((await transformWithEsbuild(detail, "OrderDetailsPage.tsx", { loader: "tsx" })).code);
  assert.ok((await transformWithEsbuild(content, "OrderDetailsContent.tsx", { loader: "tsx" })).code);
  assert.match(content, /export function OrderEquipmentDetailsSection/);
  assert.match(content, /<Section title="Equipamento">/);
  assert.match(content, /<OrderDeviceUnlockReadOnly/);
  assert.match(content, /<OrderImageDownloadMenu images=\{labelImages\}/);
  assert.match(content, /<OrderImageDownloadMenu images=\{equipmentImages\}/);
  assert.match(content, /<OrderEquipmentDetailsSection detail=\{detail\} hasPermission=\{hasPermission\}/);
  const conditionalStart = detail.indexOf("{returnDiagnosisActive\n");
  const equipmentPosition = detail.indexOf("<OrderEquipmentDetailsSection detail={detail}", conditionalStart);
  const gatePosition = detail.indexOf("<OrderReturnDiagnosisGate", conditionalStart);
  assert.ok(conditionalStart >= 0 && equipmentPosition > conditionalStart && gatePosition > equipmentPosition,
    "equipamento vem antes do diagnóstico no fluxo de retorno");
  assert.match(detail, /!returnDiagnosisActive && canOpenDocumentsPage/);
  assert.match(detail, /!returnDiagnosisActive && hasPermission\("orders\.section\.parts"\)/);
  assert.match(detail, /!returnDiagnosisActive && \(detail\.situation as any\)\?\.name/);
});

test("cada opção de peça mantém sua descrição somente na interrogação de ajuda", async () => {
  const gate = read("src/features/orders/presentation/OrderReturnDiagnosisGate.tsx");
  assert.ok((await transformWithEsbuild(gate, "OrderReturnDiagnosisGate.tsx", { loader: "tsx" })).code);
  assert.match(gate, /Qual peça apresentou o defeito\?/);
  assert.match(gate, /role="radiogroup"/);
  assert.match(gate, /role="radio"/);
  assert.match(gate, /aria-checked=\{checked\}/);
  assert.match(gate, /relative inline-flex h-\[22px\] w-10/);
  assert.match(gate, /Coberto pela garantia. O fluxo de aprovação do orçamento será dispensado./);
  assert.match(gate, /Novo defeito. Será necessário enviar um orçamento e aguardar aprovação antes de executar./);
  assert.match(gate, /<PopoverTrigger asChild>/);
  assert.match(gate, /<CircleHelp size=\{15\} aria-hidden="true" \/>/);
  assert.match(gate, /aria-label=\{`Ajuda sobre \$\{option\.label\}`\}/);
  assert.match(gate, /<PopoverContent align="start" side="top" sideOffset=\{6\}/);
  assert.match(gate, /\{option\.description\}/);
  assert.doesNotMatch(gate, /\{checked && <span/);
  assert.doesNotMatch(gate, /AdminSegmentedControl|<ShieldCheck|<Wrench/);
  assert.doesNotMatch(gate, /<AdminButton/);
});

test("Confirmar aparece somente na toolbar sticky e mantém a validação dos três campos", async () => {
  const gate = read("src/features/orders/presentation/OrderReturnDiagnosisGate.tsx");
  const actions = read("src/features/orders/presentation/OrderDetailsActions.tsx");
  const detail = read("src/features/orders/presentation/OrderDetailsPage.tsx");
  assert.ok((await transformWithEsbuild(actions, "OrderDetailsActions.tsx", { loader: "tsx" })).code);
  assert.match(gate, /footerHost && createPortal\(/);
  assert.match(gate, /<BtnPrimary onClick=\{\(\) => void confirm\(\)\} disabled=\{!canConfirm\}/);
  assert.match(gate, /<CheckCircle2 size=\{17\} \/> Confirmar/);
  assert.match(gate, /diagnosis\.trim\(\)\.length >= 5 && solution\.trim\(\)\.length >= 5/);
  assert.match(gate, /Boolean\(damageKind\)/);
  assert.match(actions, /<AdminStickyToolbar/);
  assert.match(actions, /returnAwaitingDiagnosis && <div id=\{"os-return-diagnosis-toolbar-" \+ detail\.id\}/);
  assert.match(detail, /footerHostId=\{"os-return-diagnosis-toolbar-" \+ detail\.id\}/);
});
