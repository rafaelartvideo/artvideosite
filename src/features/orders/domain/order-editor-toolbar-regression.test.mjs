import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("Nova OS e Editar OS alinham retorno à esquerda e ações à direita", async () => {
  const actions = read("src/features/orders/presentation/OrderFormActions.tsx");
  const editor = read("src/features/orders/presentation/OrderEditorPage.tsx");
  const bridge = read("src/features/orders/presentation/OrderMobileEditBridge.tsx");

  for (const [path, source] of [
    ["OrderFormActions.tsx", actions],
    ["OrderEditorPage.tsx", editor],
    ["OrderMobileEditBridge.tsx", bridge],
  ]) {
    assert.ok((await transformWithEsbuild(source, path, { loader: "tsx" })).code.length > 0);
  }

  const backIndex = actions.indexOf("<BtnSecondary");
  const rightGroupIndex = actions.indexOf('className="ml-auto flex min-w-0 shrink-0 items-center justify-end gap-2"');
  const mobileIndex = actions.indexOf("{rightActions}");
  const saveIndex = actions.indexOf("<BtnPrimary");
  assert.ok(backIndex >= 0 && backIndex < rightGroupIndex && rightGroupIndex < mobileIndex && mobileIndex < saveIndex,
    "Voltar deve ficar à esquerda e Usar celular imediatamente antes de Salvar");
  assert.ok(actions.includes('className="!justify-between gap-2 sm:gap-3"'));
  assert.ok(editor.includes("editing={Boolean(editingOS)}"));
  assert.ok(editor.includes("rightActions={editingOS && hasPermission(\"orders.edit\")"));
  assert.ok(bridge.includes("<AdminUseMobileButton"));
});

test("Nova OS usa Criar com ícone de adição à direita e preserva estado de salvamento", () => {
  const actions = read("src/features/orders/presentation/OrderFormActions.tsx");
  assert.match(actions, /editing \? "Salvar" : "Criar"/);
  assert.match(actions, /loadingText=\{editing \? "Salvando\.\.\." : "Criando\.\.\."\}/);
  assert.match(actions, /\{!editing && <Plus size=\{16\}/);
  assert.match(actions, /loading=\{saving\}/);
  assert.match(actions, /\{canSave && \(/);
});

test("Usar celular usa UI sem gradiente e indicador verde compartilhado", async () => {
  const ui = read("src/shared/ui/admin/AdminUseMobileButton.tsx");
  const files = [
    "src/features/orders/presentation/OrderMobileEditBridge.tsx",
    "src/features/orders/presentation/DeviceCaptureBridge.tsx",
    "src/features/checklists/presentation/OrderChecklistMobileBridge.tsx",
  ];
  assert.ok((await transformWithEsbuild(ui, "AdminUseMobileButton.tsx", { loader: "tsx" })).code);
  assert.match(ui, /border-primary\/30/);
  assert.match(ui, /bg-card px-3 text-xs/);
  assert.match(ui, /animate-ping rounded-full bg-emerald-300/);
  assert.doesNotMatch(ui, /admin-primary-gradient|bg-\[#0057e7\]/);
  for (const file of files) assert.match(read(file), /<AdminUseMobileButton/);
  assert.match(read(files[2]), /showOnMobile=\{scope === "payment-proof"\}/);
});

test("retornos usam toolbar, navegação junto ao número e modal apenas com motivo", async () => {
  const controls = read("src/features/orders/presentation/OrderReturnsPanel.tsx");
  const details = read("src/features/orders/presentation/OrderDetailsPage.tsx");
  const editor = read("src/features/orders/presentation/OrderInformationSection.tsx");
  const migration = read("supabase/migrations/20261110123500_force_return_urgent_priority.sql");

  assert.ok((await transformWithEsbuild(controls, "OrderReturnsPanel.tsx", { loader: "tsx" })).code);
  assert.ok((await transformWithEsbuild(details, "OrderDetailsPage.tsx", { loader: "tsx" })).code);
  assert.match(details, /<OrderReturnSwitcher order=\{detail\} \/>/);
  const toolbar = read("src/features/orders/presentation/OrderDetailsActions.tsx");
  const completion = read("src/features/orders/application/useOrderCompletion.ts");
  assert.match(toolbar, /<OrderReturnActions/);
  assert.match(toolbar, /const returnReady =/);
  assert.match(completion, /Classifique a garantia do retorno antes de abrir a conclusão/);
  assert.doesNotMatch(details, /<OrderReturnActions/);
  assert.doesNotMatch(details, /<OrderReturnsPanel/);
  assert.doesNotMatch(controls, /<MoreHorizontal|<DropdownMenuTrigger/);
  assert.match(controls, /<BtnPrimary onClick=\{\(\) => \{ setReason\(""); setCreateOpen\(true\); \}\}/);
  assert.match(controls, /Iniciar retorno/);
  assert.match(controls, /Classificar garantia/);
  assert.match(controls, /<ArrowLeftRight size=\{13\}/);
  assert.match(controls, /Motivo do retorno <span className="text-red-600"/);
  assert.match(controls, /p_classification: "analysis"/);
  assert.doesNotMatch(controls, /Atendimentos e retornos|Relato na nova entrada|Serviços e peças anteriores \(somente leitura\)/);
  assert.doesNotMatch(controls, /Uma nova etapa será criada|Os serviços antigos não serão copiados/);
  assert.doesNotMatch(controls, /Classificação inicial/);
  assert.match(editor, /value=\{editingOS\?\.return_root_id \? "urgente" : form.priority\}/);
  assert.match(editor, /disabled=\{Boolean\(editingOS\?\.return_root_id\)\}/);
  assert.match(migration, /new.priority := 'urgente'/);
  assert.match(migration, /where return_root_id is not null/);
});
