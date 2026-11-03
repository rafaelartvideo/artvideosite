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
  assert.match(sidebar,/!\\(isPlatformOperatorOrganization/);
});