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


test("WhatsApp da Union usa canais próprios e separa motor de operação", () => {
  const platform = read("src/features/integrations/presentation/PlatformIntegrationsPage.tsx");
  const tenant = read("src/features/integrations/presentation/IntegrationsPage.tsx");
  const admin = read("src/app/Admin.tsx");
  const navigation = read("src/features/admin-shell/navigation-config.ts");

  assert.match(platform, /showingOwnChannels/);
  assert.match(platform, /<WhatsAppChannelsPage/);
  assert.match(platform, /Canais da Union/);
  assert.match(platform, /Atendimentos da Union/);
  assert.match(platform, /Gerenciar motor WuzAPI/);
  assert.match(admin, /onConfigure=\{\(\) => navigate\(\x60\$\{adminPath\("integrations"\)\}\?channels=1\x60\)\}/);
  assert.match(tenant, /hasModule\("whatsapp"\)/);
  assert.match(navigation, /hasModule\("sac_digital"\) \|\| hasModule\("whatsapp"\)/);
});

test("WhatsApp exige a liberação do módulo também nas duas Edge Functions", () => {
  const channels = read("supabase/functions/whatsapp-channels/index.ts");
  const inbox = read("supabase/functions/union-whatsapp-inbox/index.ts");
  for (const edge of [channels, inbox]) {
    assert.match(edge, /from\("organization_modules"\)/);
    assert.match(edge, /eq\("organization_id",\s*org\)/);
    assert.match(edge, /eq\("module_key",\s*"whatsapp"\)/);
    assert.match(edge, /whatsappModule\?\.is_enabled\s*!==\s*true/);
    assert.match(edge, /integração WhatsApp não está liberada para esta empresa/);
  }
});
