import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { actionEnabled } from "../../../../supabase/functions/_shared/sac-runtime.mjs";

const edge = await readFile(new URL("../../../../supabase/functions/sac-digital-api/index.ts",import.meta.url),"utf8");
const app = await readFile(new URL("../../../app/App.tsx",import.meta.url),"utf8");

test("self operator presence is enabled but arbitrary account presence changes are not", () => {
  assert.equal(actionEnabled("operator_auto_online"),true);
  assert.equal(actionEnabled("set_other_operator_online"),false);
});

test("provider presence update requires the authenticated operator binding and OAuth", () => {
  const actionStart=edge.indexOf("if (action === 'operator_auto_online')");
  const nextStart=edge.indexOf("if(action === 'begin_operator_authorization')",actionStart);
  assert.ok(actionStart>0 && nextStart>actionStart);
  const route=edge.slice(actionStart,nextStart);
  assert.match(route,/resolveMyOperatorBinding\(\)/);
  assert.match(route,/authenticateSacOperator\(credentials,binding\.id,\['profile','edit'\]\)/);
  assert.match(route,/method:'PATCH'/);
  assert.match(route,/body:JSON\.stringify\(\{type:'status',status:true\}\)/);
  assert.match(route,/after\.online===true/);
  assert.match(route,/online:null/);
  assert.doesNotMatch(route,/notification\/contact|contact\/forward|send_media/);
});

test("operator presence starts from the authenticated Union admin session", () => {
  assert.match(app,/function AuthenticatedSacAutoPresence\(\)/);
  assert.match(app,/pendingTerms\.length > 0/);
  assert.match(app,/pathname\.startsWith\("\/admin"\)/);
  assert.match(app,/bringMySacOperatorOnline\(activeOrganizationId\)/);
  assert.match(app,/attempted\.current === key/);
});
