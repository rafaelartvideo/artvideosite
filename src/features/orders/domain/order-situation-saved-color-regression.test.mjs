import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("badge de situação prioriza sempre a cor salva, mesmo em nomes reconhecidos", async () => {
  const feedback = read("src/shared/ui/admin/AdminFeedback.tsx");
  assert.ok((await transformWithEsbuild(feedback, "AdminFeedback.tsx", { loader: "tsx" })).code);
  assert.match(feedback, /const savedColor = color\?\.trim\(\)/);
  assert.match(feedback, /const customColor = Boolean\(savedColor && isHexColor\(savedColor\)\)/);
  assert.match(feedback, /if \(!customColor\) \{/);
  assert.match(feedback, /customColor \? "border-solid" : STATUS_TONE_CLASSES\[tone\]\.badge/);
  assert.match(feedback, /backgroundColor: `\$\{savedColor\}18`/);
  assert.match(feedback, /borderColor: `\$\{savedColor\}66`/);
  assert.match(feedback, /color: savedColor/);
  assert.match(feedback, /boxShadow: "none"/);
  assert.match(feedback, /animation: "none"/);
  assert.doesNotMatch(feedback, /tone === "neutral" && Boolean\(color/);
});

test("lista de OS usa a situação cadastrada nos badges desktop e mobile", async () => {
  const table = read("src/features/orders/presentation/OrdersTable.tsx");
  assert.ok((await transformWithEsbuild(table, "OrdersTable.tsx", { loader: "tsx" })).code);
  const badge = /<StatusBadge status=\{\(o\.situation as any\)\.name\} color=\{\(o\.situation as any\)\?\.color\} \/>/g;
  assert.equal((table.match(badge) || []).length, 2, "mesma cor salva no celular e desktop");
});

test("legenda de OS compartilha a cor da barra vertical, sem cores duplicadas", async () => {
  const table = read("src/features/orders/presentation/OrdersTable.tsx");
  const palette = read("src/features/orders/domain/order-status-palette.ts");
  const tones = read("src/shared/domain/status-tone.ts");
  assert.ok((await transformWithEsbuild(table, "OrdersTable.tsx", { loader: "tsx" })).code);
  assert.match(table, /\(\["Aberta", "Fechada", "Cancelada"\] as const\)\.map\(status =>/);
  assert.match(table, /backgroundColor: getOrderStatusHex\(status\)/);
  assert.equal((table.match(/backgroundColor: getOrderStatusHex\(\(o\.order_status as any\)\?\.name/g) || []).length, 2,
    "As barras vertical desktop e mobile devem consumir a mesma paleta da legenda.");
  assert.match(palette, /STATUS_TONE_HEX\[tone\]/);
  assert.match(tones, /success: "#059669"/);
  assert.match(tones, /progress: "#3b82f6"/);
  assert.match(tones, /danger: "#dc2626"/);
  assert.doesNotMatch(table, /rounded-full bg-\[#16a34a\]|rounded-full bg-\[#0057e7\]/);
});

test("conclusão usa verde #059669 e cancelamento aplica o estilo 4 de rejeitar orçamento", async () => {
  const conclusion = read("src/features/orders/presentation/OrderConclusionButton.tsx");
  const details = read("src/features/orders/presentation/OrderDetailsActions.tsx");
  const kanban = read("src/features/orders/presentation/OrdersKanban.tsx");
  const dialog = read("src/features/orders/presentation/OrderCancelDialog.tsx");
  const quote = read("src/features/orders/presentation/OrderQuoteWorkspace.tsx");
  for (const [name, source] of [
    ["OrderConclusionButton", conclusion],
    ["OrderDetailsActions", details],
    ["OrdersKanban", kanban],
    ["OrderCancelDialog", dialog],
  ]) assert.ok((await transformWithEsbuild(source, name + ".tsx", { loader: "tsx" })).code);

  assert.match(conclusion, /bg-\[#059669\]/);
  assert.doesNotMatch(conclusion, /bg-\[#B9FC01\]/);
  assert.match(quote, /variant="quaternary"[^>]*onClick=\{\(\)=>openAction\("reject"\)\}/);
  assert.match(details, /variant="quaternary" onClick=\{\(\) => setCancelOpen\(true\)\}/);
  assert.match(kanban, /<AdminButton variant="quaternary" size="sm"[^>]*setCancelTarget\(order\)/);
  assert.match(dialog, /variant="quaternary"/);
  assert.match(dialog, /onClick=\{\(\) => void onConfirm\(reason\.trim\(\)\)\}/);
  assert.match(dialog, /loadingText="Cancelando\.\.\."/);
});
