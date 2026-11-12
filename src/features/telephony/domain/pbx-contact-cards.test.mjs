import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";
const read = path => readFileSync(path, "utf8");

test("PBX formats Brazilian numbers without changing internal extensions", async () => {
  const filename = "src/features/telephony/domain/pbx-display.ts";
  const {code} = await transformWithEsbuild(read(filename), filename, {loader:"ts",format:"esm"});
  const {formatPbxNumber} = await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
  assert.equal(formatPbxNumber("5511999888777"), "(11) 99988-8777");
  assert.equal(formatPbxNumber("11999888777"), "(11) 99988-8777");
  assert.equal(formatPbxNumber("1133332222"), "(11) 3333-2222");
  assert.equal(formatPbxNumber("301"), "301");
});

test("operator has Estado column, missed callback, cached avatar fallback and contact history", async () => {
  const path="src/features/telephony/presentation/UnionPbxOperatorWorkspace.tsx";
  const content=read(path);
  for (const label of ['Estado</th>','<PbxContactActivity','onReturnCall(number)','usePbxSavedContactCards',
    'brokenAvatar','onError={() => setBrokenAvatar','<PhoneMissed','<PhoneOutgoing','<PhoneIncoming']) {
    assert.ok(content.includes(label), label);
  }
  assert.doesNotMatch(content, /<th[^>]*>Situação<\/th>/);
  assert.ok((await transformWithEsbuild(content,path,{loader:"tsx"})).code.length > 100);
});

test("activity timeline is tenant scoped, only queries on selection, returns missed calls", async () => {
  const path="src/features/telephony/presentation/PbxContactActivity.tsx";
  const content=read(path);
  for (const value of ['organizationId','loadCallHistory','AbortController','Histórico com o contato',
    'Ver tudo','onDialNumber(numberToCall)','callBusy','callDuration']) {
    assert.ok(content.includes(value), value);
  }
  assert.ok((await transformWithEsbuild(content,path,{loader:"tsx"})).code.length>100);
});

test("server grants cached-only lookup solely to service role and validates pbx access", () => {
  const sql=read("supabase/migrations/20261112132333_pbx_cached_contact_cards_by_phone_v1.sql");
  const auth=read("supabase/migrations/20261112132512_pbx_contact_access_v1.sql");
  const edge=read("supabase/functions/union-pbx-contact-cards/index.ts");
  assert.match(sql,/revoke all on function public\.pbx_resolve_cached_contacts_v1\(uuid,text\[\]\) from public, anon, authenticated/);
  assert.match(sql,/grant execute on function public\.pbx_resolve_cached_contacts_v1\(uuid,text\[\]\) to service_role/);
  assert.match(auth,/private\.pbx_has_permission\(p_organization_id, 'pbx.view'\)/);
  assert.match(edge,/scoped\.rpc\("pbx_contact_access_v1"/);
  assert.match(edge,/admin\.rpc\("pbx_resolve_cached_contacts_v2"/);
  assert.match(edge,/\.createSignedUrl\(path,3600\)/);
  assert.doesNotMatch(edge,/signedBridge\(|cachedWhatsAppAvatar\(|presence_subscribe/);
  assert.ok(edge.length < 12000);
  assert.match(edge,/action==="save"/);
  assert.match(edge,/action==="list"/);
  assert.match(edge,/code:"already_crm"/);
});

test("identity lookup deduplicates visible numbers and expires signed-photo memo", async () => {
  const path="src/features/telephony/application/pbx-saved-contact-cards.ts";
  const content=read(path);
  assert.match(content,/Array\.from\(new Set/);
  assert.match(content,/\.slice\(0, 12\)/);
  assert.match(content,/CACHE_FOUND_MS = 15/);
  assert.match(content,/AbortController/);
  assert.match(content,/union-pbx-contact-cards/);
  assert.ok((await transformWithEsbuild(content,path,{loader:"ts"})).code.length>100);
});
