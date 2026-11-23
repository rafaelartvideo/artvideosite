import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = file => readFileSync(file, "utf8");

test("equipamento usa a configuração de colunas ou o padrão de três na impressão", () => {
  const printer = read("src/features/documents/domain/order-print-document.ts");
  const registry = read("src/features/documents/domain/print-field-registry.ts");
  const section = registry.match(/key: "equipment",[\s\S]*?defaultColumns: ([123])/);
  assert.equal(section?.[1], "3");
  assert.match(printer, /const equipmentColumns = Math\.max\(2,Math\.min\(3,template\.layout\.section_columns\?\.equipment \?\? section\.defaultColumns\)\)/);
  assert.match(printer, /grid columns-"\+equipmentColumns/);
  assert.match(printer, /fields\.map\(field=>"\<div class='field'\>/);
  assert.match(printer, /\.columns-3\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/);
});

test("editor salva e reabre o layout de colunas sem substituir a escolha do usuário", () => {
  const editor = read("src/features/documents/presentation/PrintTemplateEditor.tsx");
  const repository = read("src/features/documents/infrastructure/documents.repository.ts");
  assert.match(editor, /\[section\.key\]:columns==="3"\?3:2/);
  assert.match(repository, /settings: value\.layout/);
  assert.match(repository, /layout: normalizePrintLayoutSettings\(template\.settings\)/);
  assert.match(repository, /columns: value\.layout\.section_columns\?\.\[section\.key\] \?\? section\.defaultColumns/);
});

test("orçamento organiza problema/diagnóstico e solução/validade em duas colunas", () => {
  const printer = read("src/features/documents/domain/order-print-document.ts");
  const editor = read("src/features/documents/presentation/PrintTemplateEditor.tsx");
  assert.match(printer, /row\(\["quote\.problem_description","quote\.diagnosis","quote\.proposed_solution","quote\.valid_until"\],columnCount,"details"\)/);
  assert.match(printer, /row\(\["quote\.discount_amount","quote\.total"\],2,"final"\)/);
  assert.match(printer, /\.quote-row-final \.field:last-child\{background:#f0f4f8\}/);
  assert.match(printer, /\.quote-row\.columns-3\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/);
  assert.match(editor, /!\["quote_items","signatures","used_parts","checklists"\]\.includes\(section\.key\)/);
  assert.match(editor, /\[section\.key\]:columns==="3"\?3:2/);
});

test("segmentos oferecem documentos editáveis com assinatura online sem sobrescrever modelos anteriores", () => {
  const migration = read("supabase/migrations/20261105172500_union_segment_document_templates_online_signature.sql");
  assert.match(migration, /private\.union_segment_document_blueprints/);
  assert.match(migration, /private\.seed_union_segment_document_templates/);
  assert.match(migration, /after insert on public\.organization_segments/);
  assert.match(migration, /allow_online_signature',true/);
  assert.match(migration, /document_type in \('ORCAMENTO','OS','ENTRADA'\)/);
  assert.match(migration, /lower\(btrim\(name\)\)=lower\(btrim\(d\.template_config->>'name'\)\)/);
  assert.match(migration, /\{"quote":2\}/);
});

test("documentos padrão por segmento permanecem somente entrada e orçamento", () => {
  const migration = read("supabase/migrations/20261105174000_limit_union_segment_documents_to_order_and_quote_refresh_test.sql");
  assert.match(migration, /delete from private\.union_segment_document_blueprints where document_type='ENTRADA'/);
  assert.match(migration, /foreach v_type in array array\['OS','ORCAMENTO'\]/);
  assert.match(migration, /v_source\.settings \|\| jsonb_build_object\('section_columns'/);
  assert.match(migration, /delete from public\.print_template_sections where template_id=v_target\.id/);
  assert.match(migration, /'Orçamento Técnico'/);
  assert.match(migration, /count\(\*\) from private\.union_segment_document_blueprints\)<>2/);
  assert.match(migration, /count\(\*\) from public\.print_templates where organization_id=v_teste\)<>2/);
});

test("Informações da OS oferece checkboxes para tipo de atendimento e fechamento em 3 colunas reais", () => {
  const registry=read("src/features/documents/domain/print-field-registry.ts");
  const print=read("src/features/documents/domain/order-print-document.ts");
  const info=registry.split('key: "order",')[1].split('key: "service",')[0];
  assert.match(info,/key: "order.service_type", label: "Tipo de atendimento"/);
  assert.match(info,/key: "order.completed_at", label: "Data de fechamento", kind: "datetime"/);
  assert.match(print,/"order.service_type": nameOf\(order.service_type\)/);
  assert.match(print,/"order.completed_at": date\(order.completed_at\)/);
  const wide=print.split("const fullWidthFields = new Set([")[1].split("]);")[0];
  assert.doesNotMatch(wide,/"order.internal_notes"/);
  assert.doesNotMatch(wide,/"order.customer_notes"/);
  assert.match(print,/grid columns-" \+ columnCount/);
  assert.match(print,/\.columns-3\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/);
});

test("termos só ficam visíveis quando a OS foi fechada com a saída correspondente",async()=>{
  const source=read("src/features/orders/domain/order-terminal-document-visibility.ts");
  const {code}=await transformWithEsbuild(source,"order-terminal-document-visibility.ts",{loader:"ts"});
  const module=await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
  const visible=module.isOrderTerminalDocumentVisible;
  const canSign=module.isOrderTerminalSignatureEligible;
  const descarte="TERMO_DESCARTE";
  const devolucao="TERMO_DEVOLUCAO_SEM_REPARO";
  const open={closure_outcome:null,completed_at:null};
  const finishedDisposal={closure_outcome:"disposal_confirmed",completed_at:"2026-11-17T15:00:00Z"};
  const finishedReturn={closure_outcome:"returned_unrepaired",completed_at:"2026-11-17T15:00:00Z"};
  assert.equal(visible(descarte,open),false);
  assert.equal(visible(devolucao,open),false);
  assert.equal(visible(descarte,{...finishedDisposal,completed_at:null}),false);
  assert.equal(visible(descarte,finishedDisposal),true);
  assert.equal(visible(devolucao,finishedDisposal),false);
  assert.equal(visible(devolucao,finishedReturn),true);
  assert.equal(visible(descarte,finishedReturn),false);
  const legacy={closure_outcome:"rejected_quote_return",completed_at:finishedReturn.completed_at};
  assert.equal(visible(devolucao,legacy),false);
  assert.equal(canSign(devolucao,legacy),true);
  assert.equal(canSign(descarte,legacy),false);
  assert.equal(canSign(devolucao,open),false);
  assert.equal(visible("ORCAMENTO",open),true);
  const detail=read("src/features/orders/presentation/OrderDetailsPage.tsx");
  const requests=read("src/features/orders/presentation/OrderSignatureRequestsSection.tsx");
  const send=read("src/features/orders/presentation/OrderSignatureRequestDialog.tsx");
  assert.match(detail,/visiblePrintTemplates\.filter\(template => quoteWorkflowEnabled/);
  assert.match(detail,/isOrderTerminalDocumentVisible\(template.document_type, detail\)/);
  assert.match(requests,/visibleRequests\.map\(request/);
  assert.match(requests,/isOrderTerminalSignatureEligible/);
  assert.match(detail,/signedReturnTerm/);
  assert.match(send,/preferredDocumentType === template.document_type && isTerminalDocumentType\(preferredDocumentType\)/);
  // O encerramento ainda tem acesso ao modelo para colher assinaturas antes da confirmação.
  assert.match(detail,/templates=\{printTemplates.templates\}/);
});
