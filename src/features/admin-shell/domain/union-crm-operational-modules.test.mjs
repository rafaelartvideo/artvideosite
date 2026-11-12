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
  assert.match(app, /const canAccessPbxTool = \(isPlatformOperatorOrganization \|\| hasModule\("pbx"\)\) && hasPermission\("pbx.view"\)/);
  assert.match(app, /const toolsContent = route.resourceId === "union-pbx"[\s\S]*?route\.subpage === "ramais"/);
  const workspaceEnd = app.indexOf("</RetainedAdminWorkspace>");
  const phoneMount = app.indexOf("<UnionPbxToolPage", workspaceEnd);
  assert.ok(workspaceEnd > 0 && phoneMount > workspaceEnd, "softphone deve ficar fora da rota retida");
  assert.match(app, /key=\{\`\$\{user.id\}:\$\{activeOrganizationId\}\`\}/);
  assert.match(app, /isPageOpen=\{activeTab === "tools" && route.resourceId === "union-pbx"\}/);
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


test("a ponte assinada do PABX não exige portas públicas, credenciais FVX ou service role no navegador", async () => {
  const panel=read("src/features/telephony/presentation/UnionPbxAgentPanel.tsx");
  const manager=read("src/features/telephony/presentation/UnionPbxExtensionsPage.tsx");
  const edge=read("supabase/functions/union-pbx-agent/index.ts");
  const worker=read("scripts/union-pbx-agent/agent.py");
  assert.match(manager, /<UnionPbxAgentPanel organizationId=\{activeOrganizationId\}/);
  assert.match(panel, /\.rpc\("pbx_register_agent"/);
  assert.match(panel, /\.rpc\("pbx_list_agents"/);
  assert.match(panel, /\.rpc\("pbx_disable_agent"/);
  assert.match(manager, /\.rpc\("pbx_retry_extension"/);
  assert.match(edge, /crypto\.subtle\.verify\("Ed25519"/);
  assert.match(edge, /\.lt\("last_sequence",seq\)/);
  assert.match(edge, /\.eq\("organization_id",agent\.organization_id\)/);
  assert.match(worker, /assert_no_calls\(\)/);
  assert.match(worker, /context=DIALPLAN_CONTEXT if PROFILE_ID is not None else 'union-internal'/);
  assert.match(worker, /module reload res_pjsip\.so/);
  assert.doesNotMatch(worker, /extensions\.d\/union-fvx\.conf/);
  assert.doesNotMatch(panel, /SUPABASE_SERVICE_ROLE_KEY|password=|private\.pem/);
  assert.ok((await transformWithEsbuild(panel,"UnionPbxAgentPanel.tsx",{loader:"tsx"})).code.length>200);
});


test("PABX vinculado ao funcionário usa segredo efêmero e preserva ramal 301",async()=>{
  const screen=read("src/features/telephony/presentation/UnionPbxToolPage.tsx");
  const handoff=read("src/features/telephony/application/managed-browser-credentials.ts");
  const edge=read("supabase/functions/union-pbx-agent/index.ts");
  const agent=read("scripts/union-pbx-agent/agent.py");
  assert.match(screen,/useState\(isPlatformOperatorOrganization \? SIP_USER : ""\)/);
  assert.match(screen,/if \(!isPlatformOperatorOrganization\) return;/);
  assert.match(screen,/findMyManagedPbxExtension\(activeOrganizationId, controller.signal\)/);
  assert.match(screen,/acquireManagedPbxCredentials\(/);
  assert.match(screen,/startSip\(SIP_USER,password,generation\)/);
  assert.match(screen,/Conectar meu ramal/);
  assert.match(handoff,/pbx_request_browser_login/);
  assert.match(handoff,/pbx_take_browser_login/);
  assert.match(handoff,/modulusLength:2048/);
  assert.match(handoff,/name:"RSA-OAEP"/);
  assert.match(handoff,/false,\["encrypt","decrypt"\]/);
  assert.match(edge,/action==="report_login"/);
  assert.match(edge,/\.eq\("organization_id",agent\.organization_id\)/);
  assert.match(agent,/rsa_padding_mode:oaep/);
  assert.match(agent,/encrypt_login_for_browser/);
  assert.doesNotMatch(handoff,/localStorage|sessionStorage|SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(screen,/localStorage|sessionStorage|SUPABASE_SERVICE_ROLE_KEY/);
  assert.ok((await transformWithEsbuild(screen,"UnionPbxToolPage.tsx",{loader:"tsx"})).code.length>200);
  assert.ok((await transformWithEsbuild(handoff,"managed-browser-credentials.ts",{loader:"ts"})).code.length>200);
});


test("PABX chama somente numeros internos cadastrados, sem alterar discagem externa",async()=>{
  const screen=read("src/features/telephony/presentation/UnionPbxToolPage.tsx");
  const agent=read("scripts/union-pbx-agent/agent.py");
  assert.match(screen,/type InternalDirectoryEntry/);
  assert.match(screen,/\.from\("pbx_extensions"\)/);
  assert.match(screen,/\.eq\("organization_id",activeOrganizationId\)/);
  assert.match(screen,/dialableNumbers\.has\(destination\)/);
  assert.match(screen,/sip:\$\{destination\}@\$\{SIP_HOST\}/);
  assert.match(screen,/const callInternal = \(\) =>/);
  assert.match(screen,/registration !== "registered"/);
  assert.match(agent,/DIALPLAN_CONTEXT = "union-pbx-local-extensions"/);
  assert.match(agent,/def install_internal_routes\(\):/);
  assert.match(agent,/def render_internal_routes\(overrides=None, recording_override=None\):/);
  assert.match(agent,/if recording is not None:raw=recording\.decorate\(runtime_api\(\),raw,'internal',recording_override\)/);
  assert.match(agent,/assert_no_calls\(\)/);
  assert.match(agent,/Dial\(PJSIP\/\{endpoint\},25\)/);
  assert.doesNotMatch(agent,/Dial\(PJSIP\/union-fvx/);
  assert.ok((await transformWithEsbuild(screen,"UnionPbxToolPage.tsx",{loader:"tsx"})).code.length>200);
});


test("PABX Union: filas da empresa nunca redirecionam FVX automaticamente",async()=>{
  const app=read("src/app/Admin.tsx");
  const page=read("src/features/telephony/presentation/UnionPbxQueuesPage.tsx");
  const phone=read("src/features/telephony/presentation/UnionPbxToolPage.tsx");
  const edge=read("supabase/functions/union-pbx-agent/index.ts");
  const agent=read("scripts/union-pbx-agent/agent.py");
  assert.match(app,/route.subpage === "filas"/);
  assert.match(app,/canManagePbxTool \? <UnionPbxQueuesPage/);
  assert.match(app,/onManageQueues=\{canManagePbxTool/);
  const tabs=read("src/features/telephony/presentation/UnionPbxSectionTabs.tsx");
  assert.match(tabs,/label: "Filas"/);
  assert.match(phone,/onManageQueues\?\.\(\)/);
  assert.match(page,/hasPermission\("pbx.manage"\)/);
  assert.match(page,/\.eq\("organization_id",activeOrganizationId\)/);
  assert.match(page,/\.rpc\("pbx_save_queue"/);
  assert.match(page,/\.rpc\("pbx_retry_queue"/);
  assert.match(page,/O número|número \(11\) 4290-1575 continua direcionado|número \(11\) 4290-1575/);
  assert.match(edge,/queue_jobs:queueJobs/);
  assert.match(edge,/body.action==="report_queue"/);
  assert.match(edge,/\.eq\("organization_id",agent.organization_id\)/);
  assert.match(agent,/def install_queues\(\):/);
  assert.match(agent,/def apply_queue_job\(job,org_id\):/);
  assert.match(agent,/QUEUE_MAIN_INCLUDE =/);
  assert.match(agent,/assert_no_calls\(\)/);
  assert.doesNotMatch(agent,/extensions\.d\/union-fvx\.conf/);
  assert.doesNotMatch(page,/SUPABASE_SERVICE_ROLE_KEY|localStorage|sessionStorage/);
  assert.ok((await transformWithEsbuild(page,"UnionPbxQueuesPage.tsx",{loader:"tsx"})).code.length>200);
});


test('monitoramento PBX usa uma assinatura realtime por empresa e telemetria assinada',async()=>{
  const page=read('src/features/telephony/presentation/UnionPbxQueuesPage.tsx');
  const live=read('src/features/telephony/presentation/UnionPbxQueueLiveStatus.tsx');
  const agent=read('scripts/union-pbx-agent/agent.py');
  const edge=read('supabase/functions/union-pbx-agent/index.ts');
  assert.ok(page.includes('usePbxQueueLive('));
  assert.ok(page.includes('<QueueLiveDetails'));
  assert.ok(live.includes('pbx_queue_live_status'));
  assert.ok(live.includes('removeChannel(channel)'));
  assert.ok(live.includes('ACTIVE_WINDOW_MS = 95_000'));
  assert.ok(agent.includes('def gather_queue_telemetry()'));
  assert.ok(agent.includes('capabilities=runtime_capability(protocol)'));
  assert.ok(agent.includes('signed_request({"action":"poll", "telemetry": telemetry, **capabilities})'));
  assert.ok(agent.includes('protocol, availability_processor = availability_capability()'));
  assert.ok(edge.includes('telemetry.length <= 10'));
  assert.ok(edge.includes('agent.organization_id'));
  assert.ok(!live.includes('SUPABASE_SERVICE_ROLE_KEY'));
  assert.ok((await transformWithEsbuild(live,'UnionPbxQueueLiveStatus.tsx',{loader:'tsx'})).code.length>200);
});


test("entrada FVX: planejar destino sem acionar Asterisk ou publicar troca automaticamente",async()=>{
  const app=read("src/app/Admin.tsx");
  const phone=read("src/features/telephony/presentation/UnionPbxToolPage.tsx");
  const page=read("src/features/telephony/presentation/UnionPbxInboundPage.tsx");
  const sql=read("supabase/migrations/20261104141218_pbx_inbound_route_plan_inert.sql");
  const agent=read("scripts/union-pbx-agent/agent.py");
  const edge=read("supabase/functions/union-pbx-agent/index.ts");
  assert.match(app,/route.subpage === "entrada"/);
  assert.match(app,/canManagePbxTool && isPlatformOperatorOrganization \? <UnionPbxInboundPage/);
  assert.match(app,/onManageInbound=\{canManagePbxTool/);
  const tabs=read("src/features/telephony/presentation/UnionPbxSectionTabs.tsx");
  assert.match(tabs,/label: "Entrada FVX"/);
  assert.match(tabs,/canManageInbound \?/);
  assert.match(phone,/onManageInbound\?\.\(\)/);
  assert.match(page,/hasPermission\("pbx.manage"\)/);
  assert.match(page,/\.eq\("organization_id",activeOrganizationId\)/);
  assert.match(page,/\.rpc\("pbx_save_inbound_route_plan"/);
  assert.match(page,/Salvar planejamento/);
  assert.match(page,/Nenhuma alteração foi aplicada à VPS/);
  assert.match(sql,/public\.pbx_inbound_route_plans/);
  assert.match(sql,/private\.is_platform_organization/);
  assert.match(sql,/private\.has_organization_permission\(p_organization_id,'pbx.manage'\)/);
  assert.match(sql,/provisioning_status='applied'/);
  assert.doesNotMatch(edge,/pbx_inbound_route_plans|report_inbound/);
  assert.doesNotMatch(agent,/union-fvx-router|inbound-enable/);
  assert.doesNotMatch(page,/SUPABASE_SERVICE_ROLE_KEY|localStorage|sessionStorage/);
  assert.ok((await transformWithEsbuild(page,"UnionPbxInboundPage.tsx",{loader:"tsx"})).code.length>200);
});
