import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
