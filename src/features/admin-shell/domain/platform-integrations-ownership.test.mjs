import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("Integrações fica na Union e Conexões Operacionais não é mais um módulo", async () => {
  const sidebar = read("src/features/admin-shell/presentation/AdminSidebar.tsx");
  const nav = read("src/features/admin-shell/navigation-config.ts");
  const app = read("src/app/Admin.tsx");
  const routes = read("src/features/admin-shell/admin-routes.ts");

  assert.match(sidebar, /isPlatformOperatorOrganization && \(hasPermission\("organizations\.view"\)/);
  assert.match(sidebar, /id: "integrations", label: "Integrações", icon: Plug/);
  assert.doesNotMatch(nav.slice(nav.indexOf("export const operationItems"), nav.indexOf("export const utilityItems")), /id: "integrations"/);
  assert.match(routes, /integrations: "\/admin\/integrations"/);
  assert.match(app, /<PlatformIntegrationsPage onBack=/);
  assert.doesNotMatch(app, /<IntegrationsPage onBack=/);
  assert.match(app, /path="operation\/integrations\/\*"/); // link legado redirecionado
  assert.match(app, /path="integrations\/\*"/);

  for (const [file, source] of [
    ["AdminSidebar.tsx", sidebar],
    ["Admin.tsx", app],
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


test("configurações do WhatsApp Union permanecem e rotas da SAC legada são bloqueadas", () => {
  const platform = read("src/features/integrations/presentation/PlatformIntegrationsPage.tsx");
  const admin = read("src/app/Admin.tsx");
  const navigation = read("src/features/admin-shell/navigation-config.ts");
  const channels = read("src/features/whatsapp-channels/presentation/WhatsAppChannelsPage.tsx");
  const permissions = read("src/features/whatsapp-channels/presentation/WhatsAppRolePermissions.tsx");
  const attendanceSettings=read("src/features/whatsapp-channels/presentation/WhatsAppAttendanceSettings.tsx");
  const inbox = read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const operations=read("src/features/whatsapp-channels/presentation/WhatsAppOperationsSettings.tsx");
  const replies=read("src/features/whatsapp-channels/presentation/WhatsAppQuickRepliesSettings.tsx");
  const layout=read("src/shared/ui/admin/AdminLayout.tsx");

  assert.doesNotMatch(platform, /showingOwnChannels|<WhatsAppChannelsPage|Canais da Union/);
  assert.match(platform, /Atendimentos da Union/);
  assert.match(platform, /Gerenciar motor WuzAPI/);
  assert.match(admin, /route\.subpage === "canais"/);
  assert.match(admin, /route\.subpage\s*===\s*"configuracoes"/);
  assert.match(admin, /onConfigure=\{\(\) => navigateAdmin\("tools","union-whatsapp",route\.subpage==="configuracoes" \? null : "configuracoes"\)\}/);
  assert.doesNotMatch(admin, /onConfigure=\{\(\) => navigateAdmin\("tools", "sac-digital", "configuracoes"\)\}/);
  assert.match(admin, /<WhatsAppAttendanceSettings/);
  assert.doesNotMatch(admin, /<SacDigitalSettingsPage/);
  assert.match(channels, /<WhatsAppRolePermissions onBack=\{onBack\}/);
  assert.match(channels, /!embeddedSection && section !== "permissions" && <AdminStickyToolbar/);
  assert.match(attendanceSettings, /<WhatsAppChannelsPage/);
  assert.match(attendanceSettings, /<WhatsAppQuickRepliesSettings/);
  assert.match(attendanceSettings, /<WhatsAppRolePermissions/);
  assert.match(attendanceSettings, /onClick=\{\(\)=>openSection\(item.id\)\}/);
  assert.match(attendanceSettings, /sectionTrail/);
  assert.match(attendanceSettings, /backToPrevious/);
  assert.match(attendanceSettings, /role="menu"/);
  assert.match(attendanceSettings, /onClose=\{onClose\}/);
  assert.match(attendanceSettings, /Nova conexão/);
  assert.match(attendanceSettings, /Novo departamento/);
  assert.match(attendanceSettings, /transitionKey=\{section/);
  assert.match(attendanceSettings, /onInlinePaneChange=\{onInlinePaneChange\}/);
  assert.match(attendanceSettings, /disabled=\{Boolean\(inlinePane\?\.blocked\)\}/);
  assert.match(channels, /if\(embeddedSection && inlineStage\)/);
  assert.match(channels, /data-whatsapp-inline-stage/);
  assert.match(channels, /createPortal\(/);
  assert.match(operations, /embedded && inlineStage/);
  assert.match(operations, /!embedded && <AdminDialog/);
  assert.match(replies, /inlineStage==="reply-delete"/);
  assert.match(replies, /!embedded && <AdminDialog/);
  assert.match(layout, /transitionKey\?: string \| number \| null/);
  assert.match(layout, /previousPanelSizeRef/);
  assert.match(attendanceSettings, /ref=\{setFooterTarget\}/);
  assert.doesNotMatch(attendanceSettings, /<AdminDialog open=\{!section\}/);
  assert.match(inbox, /data-whatsapp-attendance-settings-trigger/);
  assert.match(channels, /createConnectionRequest/);
  assert.match(channels, /\{!embeddedSection && section !== "permissions"/);
  assert.match(permissions, /onBack \? <AdminStickyToolbar/);
  assert.match(permissions, /Salvar permissões/);
  assert.match(admin, /route\.resourceId === "sac-digital"[\s\S]*?<Navigate to=\{adminPath\("tools"\)\} replace/);
  assert.match(inbox, /aria-label="Configurações dos Atendimentos"/);
  assert.doesNotMatch(inbox, /settingsModal|settingsMenuRef/);
  assert.match(navigation, /if \(tab === "integrations"\) return true;/);
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
