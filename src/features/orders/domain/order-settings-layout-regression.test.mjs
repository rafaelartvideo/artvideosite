import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("Documentos abre Anexos por padrão, sem descrições em Anexos e Impressão", async () => {
  const documents = read("src/features/documents/presentation/TabDocuments.tsx");
  assert.ok((await transformWithEsbuild(documents, "TabDocuments.tsx", { loader: "tsx" })).code);
  assert.match(documents, /: "attachments"\);/);
  assert.match(documents, /setSection\(routeResourceId \? "printing" : "attachments"\)/);
  assert.match(documents, /\["printing", "attachments", "labels", "printers"\]/);
  assert.doesNotMatch(documents, /Cadastre os tipos exibidos ao adicionar arquivos aos documentos de uma OS/);
  assert.doesNotMatch(documents, /Crie e configure os modelos disponíveis no menu Imprimir dos detalhes da OS/);
  assert.doesNotMatch(documents, /<DocumentsAreaHeader\s+title="Anexos"/);
  assert.doesNotMatch(documents, /<DocumentsAreaHeader\s+title="Impressão"/);
});

test("engrenagem das OS aparece junto do título, não no grupo de ações", async () => {
  const header = read("src/features/orders/presentation/OrdersHeader.tsx");
  assert.ok((await transformWithEsbuild(header, "OrdersHeader.tsx", { loader: "tsx" })).code);
  assert.match(header, /title=\{<span className="inline-flex flex-wrap items-center gap-2"/);
  assert.match(header, /Ordens de Serviço\s*\{canConfigure && onConfigure/);
  assert.match(header, /<Settings2 size=\{18\}/);
  assert.equal((header.match(/<Settings2 size=\{18\}/g) || []).length, 1);
});

test("campos da OS são apresentados em duas colunas com descrições e selects padrão", async () => {
  const rules = read("src/features/orders/presentation/OrderRulesSettings.tsx");
  assert.ok((await transformWithEsbuild(rules, "OrderRulesSettings.tsx", { loader: "tsx" })).code);
  assert.match(rules, /sm:grid-cols-2/);
  assert.match(rules, /fieldDescriptions\[key\]/);
  assert.match(rules, /<AdminSelect ariaLabel=\{"Exigência: " \+ title\}/);
  assert.match(rules, /<AdminSelect ariaLabel=\{"Etapa: " \+ title\}/);
  assert.match(rules, /<AdminSelect ariaLabel="Aplicar a"/);
  assert.doesNotMatch(rules, /<RuleSelect/);
  assert.doesNotMatch(rules, /Salvar regras/);
});

test("salvamento único grava somente alterações de regras e evidências de conclusão", async () => {
  const dialog = read("src/features/orders/presentation/OrderSettingsDialog.tsx");
  const rules = read("src/features/orders/presentation/OrderRulesSettings.tsx");
  assert.ok((await transformWithEsbuild(dialog, "OrderSettingsDialog.tsx", { loader: "tsx" })).code);
  assert.match(dialog, /const anyChanges = rulesDirty \|\| proofDirty \|\| deliveryDirty/);
  assert.match(dialog, /if \(rulesDirty\) await rulesRef\.current\?\.saveChanges\(\)/);
  assert.match(dialog, /if \(proofDirty \|\| deliveryDirty\)/);
  assert.match(dialog, /require_delivery_evidence_on_completion: requireDeliveryEvidence/);
  assert.match(dialog, /scope: "orders"/);
  assert.match(dialog, /disabled=\{!anyChanges/);
  assert.equal((dialog.match(/>Salvar<\/BtnPrimary>/g) || []).length, 1);
  assert.match(rules, /changedEntries/);
  assert.match(rules, /Object\.entries\(drafts\)/);
  assert.match(rules, /setDrafts\(previous/);
  assert.match(rules, /saveChanges: async \(\) =>/);
});
