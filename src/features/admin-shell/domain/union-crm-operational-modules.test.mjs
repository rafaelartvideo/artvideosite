import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read=path=>readFileSync(path,"utf8");

test("Pedidos Avulsos e Painel do Técnico ficam no hub CRM da Union",async()=>{
  const hub=read("src/features/admin-shell/presentation/PlatformCrmHub.tsx");
  const sidebar=read("src/features/admin-shell/presentation/AdminSidebar.tsx");
  const app=read("src/app/Admin.tsx");
  assert.match(hub,/customerRequests: "Registre/);
  assert.match(hub,/technicianPanel: "Consulte/);
  assert.match(hub,/"customerRequests",[\s\S]*"technicianPanel"/);
  assert.match(sidebar,/isPlatformOperatorOrganization && \["technicianPanel", "customerRequests"\]\.includes\(item\.id\)/);
  assert.match(sidebar,/onNavigate\(item\.id as AdminTab\)/);
  assert.match(app,/activeTab === "customerRequests" \|\| activeTab === "technicianPanel"/);
  assert.match(app,/crmMode: true/);
  assert.match(app,/showCrmBackToolbar && <AdminStickyToolbar/);
  assert.match(app,/>Voltar para CRM<\/BtnSecondary>/);
  assert.match(app,/<Route path="customer-requests\/\*"/);
  assert.match(app,/<Route path="technician-panel\/\*"/);
  for(const [path,source] of [
    ["PlatformCrmHub.tsx",hub],["AdminSidebar.tsx",sidebar],["Admin.tsx",app]
  ]) assert.ok((await transformWithEsbuild(source,path,{loader:"tsx"})).code.length>200,path);
});

test("o menu das empresas parceiras não é alterado pelo filtro exclusivo da Union",()=>{
  const sidebar=read("src/features/admin-shell/presentation/AdminSidebar.tsx");
  const nav=read("src/features/admin-shell/navigation-config.ts");
  assert.match(nav,/\{ id: "customerRequests", label: "Pedidos Avulsos"/);
  assert.match(nav,/\{ id: "technicianPanel", label: "Painel do Técnico"/);
  assert.match(sidebar,/!\(isPlatformOperatorOrganization/);
});

test("PABX Union permanece montado ao navegar e encerra em troca de empresa ou usuario", async () => {
  const app = read("src/app/Admin.tsx");
  const phone = read("src/features/telephony/presentation/UnionPbxToolPage.tsx");
  assert.match(app, /const canAccessPbxTool = isPlatformOperatorOrganization && hasPermission\("pbx.view"\)/);
  assert.match(app, /const toolsContent = route.resourceId === "union-pbx"[\s\S]*?\? null/);
  const workspaceEnd = app.indexOf("</RetainedAdminWorkspace>");
  const phoneMount = app.indexOf("<UnionPbxToolPage", workspaceEnd);
  assert.ok(workspaceEnd > 0 && phoneMount > workspaceEnd, "softphone deve ficar fora da rota retida");
  assert.match(app, /key=\{\`\$\{user.id\}:\$\{activeOrganizationId\}\`\}/);
  assert.match(app, /isPageOpen=\{activeTab === "tools" && route.resourceId === "union-pbx" && route.subpage === null\}/);
  assert.match(phone, /<audio ref=\{remoteAudioRef\}/);
  assert.match(phone, /!isPageOpen && \(registration !== "offline" \|\| callState !== "idle"\)/);
  assert.match(phone, /callState === "incoming" && \(/);
  assert.match(phone, /sessionRef.current\?\.terminate\(\)/);
  assert.match(phone, /uaRef.current\?\.stop\(\)/);
  assert.doesNotMatch(phone, /localStorage|sessionStorage|service_role/);
  assert.ok((await transformWithEsbuild(phone, "UnionPbxToolPage.tsx", {loader:"tsx"})).code.length>200);
});


test("gerenciador de ramais é isolado da telefonia ativa e protegido por permissão",async()=>{
  const app=read("src/app/Admin.tsx");
  const manager=read("src/features/telephony/presentation/UnionPbxExtensionsPage.tsx");
  assert.match(app,/canManagePbxTool = canAccessPbxTool && hasPermission\("pbx.manage"\)/);
  assert.match(app,/route.subpage === "ramais"/);
  assert.match(app,/<UnionPbxExtensionsPage onBack=/);
  assert.match(app,/onManage=\{canManagePbxTool/);
  assert.match(manager,/\.from\("pbx_extensions"\)/);
  assert.match(manager,/\.eq\("organization_id", activeOrganizationId\)/);
  assert.match(manager,/Aguardando ativação na VPS/);
  assert.match(manager,/Legado protegido/);
  assert.doesNotMatch(manager,/SIP_PASSWORD|FVX_PASSWORD|service_role/);
  assert.ok((await transformWithEsbuild(manager,"UnionPbxExtensionsPage.tsx",{loader:"tsx"})).code.length>200);
});
