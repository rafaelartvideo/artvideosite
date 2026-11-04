import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("integrações são acessíveis no menu da Union e a OLX sai do menu operacional", async () => {
  const sidebar = read("src/features/admin-shell/presentation/AdminSidebar.tsx");
  const nav = read("src/features/admin-shell/navigation-config.ts");
  const app = read("src/app/Admin.tsx");
  const tenant = read("src/features/integrations/presentation/IntegrationsPage.tsx");

  assert.match(sidebar, /isPlatformOperatorOrganization && \(hasPermission\("organizations\.view"\)/);
  assert.match(sidebar, /id: "integrations", label: "Integrações", icon: Plug/);
  assert.doesNotMatch(nav.slice(nav.indexOf("export const operationItems"), nav.indexOf("export const utilityItems")), /id: "integrations"/);
  assert.match(app, /<PlatformIntegrationsPage onBack=/);
  assert.match(app, /<IntegrationsPage onBack=/);
  assert.doesNotMatch(tenant, /OlxIntegrationPage|selected\("olx"\)/);
  assert.match(tenant, /Canais de Atendimento/);
  assert.match(tenant, /SAC Digital/);

  for (const [file, source] of [
    ["AdminSidebar.tsx", sidebar],
    ["Admin.tsx", app],
    ["IntegrationsPage.tsx", tenant],
    ["PlatformIntegrationsPage.tsx", read("src/features/integrations/presentation/PlatformIntegrationsPage.tsx")],
    ["OlxIntegrationPage.tsx", read("src/features/integrations/presentation/OlxIntegrationPage.tsx")],
  ]) {
    assert.ok((await transformWithEsbuild(source, file, { loader: "tsx" })).code.length > 100, file);
  }
});

test("distribuição reutiliza organization_modules, aplica permissões e não desloca Mercado Pago", () => {
  const platform = read("src/features/integrations/presentation/PlatformIntegrationsPage.tsx");
  const repository = read("src/features/partner-companies/infrastructure/partner-companies.repository.ts");
  const migration = read("supabase/migrations/20261104090000_union_platform_olx_integration_catalog.sql");
  const nav = read("src/features/admin-shell/navigation-config.ts");
  assert.match(platform, /setOrganizationModuleEnabled\(company\.id, selected, enabled, user\?\.id\)/);
  assert.match(platform, /organizations\.modules\.manage/);
  assert.match(platform, /Em homologação/);
  assert.match(repository, /\.from\("organization_modules"\)\.upsert|\.from\("organization_modules"\)[\s\S]*?\.upsert/);
  assert.match(migration, /insert into public\.system_modules/);
  assert.match(migration, /'olx'/);
  assert.match(nav, /id: "sitePayments"/);
  assert.doesNotMatch(platform, /mercado_pago|artvideo_store_payment/);
});
