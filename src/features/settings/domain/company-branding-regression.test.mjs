import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = path => readFileSync(path, "utf8");

test("identidade visual permite desvincular ambas as logos e manter os campos vazios", () => {
  const component = source("src/shared/ui/admin/AdminMedia.tsx");
  const settings = source("src/features/settings/presentation/TabSettings.tsx");
  const repo = source("src/features/settings/infrastructure/company-settings.repository.ts");
  assert.match(component, /onRemove\?: \(\) => void/);
  assert.match(component, /onRemove\(\)/);
  assert.match(component, /Remover imagem/);
  assert.match(settings, /onRemove=\{\(\) => update\("company_logo_media_id", ""\)\}/);
  assert.match(settings, /onRemove=\{\(\) => update\("company_menu_logo_media_id", ""\)\}/);
  assert.match(repo, /logo_media_id: settings\.company_logo_media_id \|\| null/);
  assert.match(repo, /menu_logo_media_id: settings\.company_menu_logo_media_id \|\| null/);
});

test("identificação aceita CPF e CNPJ opcionais com validação adequada", () => {
  const settings = source("src/features/settings/presentation/TabSettings.tsx");
  assert.match(settings, /normalizeDigits\(loaded\.company_cnpj\)\.length === 11/);
  assert.match(settings, /AdminSegmentedControl value=\{documentType\}/);
  assert.match(settings, /documentType === "CPF" \? !isValidCpf\(form\.company_cnpj\) : !isValidCnpj\(form\.company_cnpj\)/);
  assert.match(settings, /documentType === "CPF" \? formatCpf\(event\.target\.value\) : formatCnpj\(event\.target\.value\)/);
  assert.doesNotMatch(settings, /form\.company_cnpj\.trim\(\)\) nextErrors/);
});

test("impressão usa CPF ou CNPJ, sem forçar logo ou subtítulo padrão", () => {
  const printer = source("src/features/documents/domain/order-print-document.ts");
  const company = source("src/features/settings/infrastructure/company-settings.repository.ts");
  assert.match(printer, /normalizeDigits\(company\.document\)\.length === 11 \? "CPF: "/);
  assert.match(printer, /normalizeDigits\(company\.document\)\.length === 14 \? "CNPJ: "/);
  assert.match(printer, /template\.show_logo \? companyLogo : ""/);
  assert.match(company, /subtitle: settings\.company_legal_name \|\| ""/);
  assert.doesNotMatch(company, /subtitle: settings\.company_legal_name \|\| "Assistência Técnica"/);
});

test("remover logo do menu não reaproveita automaticamente logo dos documentos", () => {
  const header = source("src/features/admin-shell/presentation/AdminHeader.tsx");
  const partner = source("src/features/partner-companies/presentation/PartnerCompanyEditorPage.tsx");
  assert.match(header, /const companyLogoMediaId = brandingQuery\.data\?\.company_menu_logo_media_id \|\| null/);
  assert.match(partner, /onRemove=\{\(\) => setField\("companyLogoMediaId", ""\)\}/);
  assert.match(partner, /onRemove=\{\(\) => setField\("menuLogoMediaId", ""\)\}/);
});
