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


test("PBX uses icon-only call controls with hold and resume colors and an expandable transfer picker", async () => {
  const path = "src/features/telephony/presentation/UnionPbxCallActions.tsx";
  const source = read(path);
  for (const phrase of ["Controles da ligação", "Silenciar microfone", "Ativar microfone",
    "Colocar em espera", "Retomar chamada", "Transferir chamada", "Desligar",
    "bg-amber-500/10", "bg-emerald-500/10", "transferOpen", "AdminSelect",
    "onHangup", "onMute"]) assert.ok(source.includes(phrase), phrase);
  assert.doesNotMatch(source, /Chamada em espera/);
  assert.ok((await transformWithEsbuild(source,path,{loader:"tsx"})).code.length > 100);
});

test("PBX opens finished calls rather than first row, and direct dial/save actions are adjacent", () => {
  const source=read("src/features/telephony/presentation/UnionPbxOperatorWorkspace.tsx");
  const phone=read("src/features/telephony/presentation/UnionPbxToolPage.tsx");
  assert.doesNotMatch(source, /results\[0\]\?\.id/);
  assert.match(source,/completedHandledRef/);
  assert.match(source,/setSelectedId\(matching\.id\)/);
  assert.match(source,/onReturnCall\(selectedNumber\)/);
  assert.match(source,/Salvar contato/);
  assert.match(source,/Editar/);
  assert.doesNotMatch(source,/Contato salvo no PABX/);
  assert.match(phone,/setCompletedCall\(previous/);
  assert.match(phone,/held \? "Em espera" : "Em ligação"/);
  assert.match(phone,/formatPbxNumber\(remoteParty\)/);
});

test("PBX keeps recent table columns separate and does not refetch agenda on every tab change", async () => {
  const operator=read("src/features/telephony/presentation/UnionPbxOperatorWorkspace.tsx");
  const directory=read("src/features/telephony/presentation/PbxContactDirectory.tsx");
  const timeline=read("src/features/telephony/presentation/PbxContactActivity.tsx");
  assert.match(operator,/min-w-\[820px\] table-fixed/);
  assert.match(operator,/contactsVisited/);
  assert.match(operator,/mode==="contatos" \? "contents" : "hidden"/);
  assert.match(directory,/Preparando agenda/);
  assert.doesNotMatch(directory,/Sincronizando agenda/);
  assert.match(timeline,/loadedQueryRef/);
  assert.match(timeline,/initialLoad/);
  assert.doesNotMatch(timeline,/Carregando histórico/);
  for(const path of ["src/features/telephony/presentation/PbxContactDirectory.tsx",
    "src/features/telephony/presentation/PbxContactActivity.tsx"]) {
    assert.ok((await transformWithEsbuild(read(path),path,{loader:"tsx"})).code.length > 100);
  }
});
