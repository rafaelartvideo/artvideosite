import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=path=>readFileSync(path,"utf8");

test("motor global aparece somente na Central da Union",()=>{
  const management=read("src/features/management/presentation/ManagementPage.tsx");
  const ui=read("src/features/management/presentation/UnionWhatsAppEnginePage.tsx");
  const partner=read("src/features/whatsapp-channels/presentation/WhatsAppChannelsPage.tsx");
  assert.match(management,/activeOrganization\?\.is_platform_operator===true/);
  assert.match(management,/canManage&&activeOrganization/);
  assert.match(management,/UnionWhatsAppEnginePage/);
  assert.match(ui,/hasPermission\("platform\.management\.manage"\)/);
  assert.doesNotMatch(partner,/UnionWhatsAppEnginePage|Motor WhatsApp/);
});

test("a Edge valida permissão e organização operadora no servidor",()=>{
  const edge=read("supabase/functions/union-whatsapp-engine/index.ts");
  assert.match(edge,/scoped\.auth\.getUser\(\)/);
  assert.match(edge,/admin\.rpc\("platform_operator_organization_id"\)/);
  assert.match(edge,/operator!==org/);
  assert.match(edge,/scoped\.rpc\("my_organization_permissions"/);
  assert.match(edge,/row\.permission_key==="platform\.management\.manage"/);
  assert.match(edge,/action!=="check"/);
  assert.doesNotMatch(edge,/docker|spawn\(|exec\(|logout|disconnect/);
});

test("ponte exige HMAC antes do status e não executa Docker",()=>{
  const bridge=read("services/union-wuzapi-bridge/server.mjs");
  const start=bridge.indexOf("async function engineInfo()");
  const end=bridge.indexOf("async function operate(",start);
  const info=bridge.slice(start,end);
  assert.ok(start>0&&end>start);
  assert.match(info,/engine-release\.json/);
  assert.match(info,/engine_reachable/);
  assert.doesNotMatch(info,/spawn\(|docker|sudo|exec\(/);
  assert.ok(bridge.indexOf("verified(req.headers, raw)")<bridge.indexOf("await operate(body)"));
  assert.match(bridge,/if \(action === "engine_info"\) return engineInfo\(\)/);
});

test("atualizações ficam travadas até existir executor seguro",()=>{
  const ui=read("src/features/management/presentation/UnionWhatsAppEnginePage.tsx");
  const edge=read("supabase/functions/union-whatsapp-engine/index.ts");
  const workflow=read(".github/workflows/wuzapi-release-monitor.yml");
  const script=read("services/union-wuzapi-bridge/engine-status-refresh.sh");
  assert.match(edge,/maintenance_enabled:false/);
  assert.match(ui,/Atualização remota:/);
  assert.match(workflow,/schedule:/);
  assert.match(workflow,/issues: write/);
  assert.match(script,/docker inspect/);
  assert.doesNotMatch(script,/docker (?:restart|stop|rm)|compose (?:up|down)/);
});
