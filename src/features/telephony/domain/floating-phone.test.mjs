import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read=path=>readFileSync(path,"utf8");

test("mini-PABX uses the real dialer and never disconnects the SIP session from a quick control",async()=>{
  const floatingPath="src/features/telephony/presentation/UnionPbxFloatingPhone.tsx";
  const pagePath="src/features/telephony/presentation/UnionPbxToolPage.tsx";
  const floating=read(floatingPath),page=read(pagePath);
  for(const snippet of [
    "Mini-PABX Union","Expandir discador","Recolher mini-PABX",
    "Restaurar posição do mini-PABX","Arraste para mover o mini-PABX",
    "snapToEdge","setExpanded(true)","onPointerMove={pointerMove}",
    "onOpenFull","Ramal ",
  ]) assert.ok(floating.includes(snippet),snippet);
  assert.match(page,/dialer=\{isPageOpen \? dialerContent : null\}/);
  assert.match(page,/<UnionPbxFloatingPhone[\s\S]*?\{dialerContent\}<\/UnionPbxFloatingPhone>/);
  assert.equal((page.match(/<UnionPbxCallActions/g)||[]).length,1);
  assert.doesNotMatch(floating,/onClick=\{stop\}|>Desconectar</);
  assert.doesNotMatch(floating,/sipUser/);
  assert.match(page,/extension=\{ownNumber \?\? null\}/);
  assert.match(page,/item\.endpoint_name === sipUser/);
  assert.ok((await transformWithEsbuild(floating,floatingPath,{loader:"tsx"})).code.length>150);
  assert.ok((await transformWithEsbuild(page,pagePath,{loader:"tsx"})).code.length>150);
});


test("PABX displays the selected extension during connection and avoids mixed-color status borders",()=>{
  const page=read("src/features/telephony/presentation/UnionPbxToolPage.tsx");
  const workspace=read("src/features/telephony/presentation/UnionPbxOperatorWorkspace.tsx");
  assert.match(page,/const \[connectionNumber, setConnectionNumber\] = useState<number \| null>\(null\)/);
  assert.match(page,/setConnectionNumber\(managedExtension\.number\)/);
  assert.match(page,/setConnectionNumber\(301\)/);
  assert.match(page,/setConnectionNumber\(null\)/);
  assert.match(page,/const ownNumber = connectionNumber \?\?/);
  assert.match(page,/extensionLabel=\{ownNumber \? `Ramal \$\{ownNumber\}`/);
  assert.match(page,/extension=\{ownNumber \?\? null\}/);
  assert.match(workspace,/border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300/);
  assert.doesNotMatch(workspace,/border-amber-400\/30 bg-amber-500\/10/);
});

test("mini-PABX and full panel share CRM and history below the active-call controls",async()=>{
  const floatingPath="src/features/telephony/presentation/UnionPbxFloatingPhone.tsx";
  const pagePath="src/features/telephony/presentation/UnionPbxToolPage.tsx";
  const panelPath="src/features/telephony/presentation/PbxCrmContactPanel.tsx";
  const floating=read(floatingPath),page=read(pagePath),panel=read(panelPath);
  assert.doesNotMatch(floating,/<PbxCrmContactPanel/);
  assert.match(page,/<PbxCrmContactPanel organizationId=\{activeOrganizationId\} phone=\{remoteParty\}/);
  assert.match(page,/<PbxContactActivity organizationId=\{activeOrganizationId\} number=\{remoteParty\}/);
  assert.match(page,/displayingCall && pbxContactPhoneKey\(remoteParty\)/);
  assert.match(page,/callKeypadExpanded \? "Recolher teclado de discagem" : "Expandir teclado de discagem"/);
  assert.match(page,/callState === "active" && callKeypadExpanded/);
  assert.match(panel,/hasPermission\("customers.view"\)/);
  assert.match(panel,/hasPermission\("orders.details.view"\)/);
  assert.doesNotMatch(page,/Internas: \{callModeLabel|Externas: \{callModeLabel/);
  assert.ok((await transformWithEsbuild(floating,floatingPath,{loader:"tsx"})).code.length>150);
  assert.ok((await transformWithEsbuild(page,pagePath,{loader:"tsx"})).code.length>150);
});

test("queue retries retain caller context without exposing stale answer actions",async()=>{
  const pagePath="src/features/telephony/presentation/UnionPbxToolPage.tsx";
  const floatingPath="src/features/telephony/presentation/UnionPbxFloatingPhone.tsx";
  const page=read(pagePath),floating=read(floatingPath);
  assert.match(page,/INCOMING_RETRY_GRACE_MS = 8_000/);
  assert.match(page,/failed && session\.direction === "incoming"/);
  assert.match(page,/!wasConfirmed && !locallyRejected && ua\.isRegistered/);
  assert.match(page,/if \(retryRef\.current !== pending\) return/);
  assert.match(page,/previousRetry\.phone !== phone/);
  assert.match(page,/if \(callState === "incoming"\) locallyRejectedRef\.current = sessionRef\.current/);
  assert.match(page,/const displayingCall = callState !== "idle" \|\| incomingRetry/);
  assert.match(page,/const showIdleDialer = callState === "idle" && !incomingRetry/);
  assert.match(page,/incomingRetry && <p role="status"/);
  assert.match(page,/retrying=\{incomingRetry\}/);
  assert.match(floating,/retrying\?"Aguardando novo toque/);
  assert.doesNotMatch(page,/incomingRetry && <AdminButton[^>]*onClick=\{answer\}/);
  assert.ok((await transformWithEsbuild(page,pagePath,{loader:"tsx"})).code.length>150);
  assert.ok((await transformWithEsbuild(floating,floatingPath,{loader:"tsx"})).code.length>150);
});

test("mini-PABX snaps to viewport edges, supports keyboard reposition and limits visual height",()=>{
  const floating=read("src/features/telephony/presentation/UnionPbxFloatingPhone.tsx");
  assert.match(floating,/const MARGIN = 12/);
  assert.match(floating,/const DEFAULT_MARGIN = 20/);
  assert.match(floating,/snapToEdge\(point,nodeRef\.current\)/);
  assert.match(floating,/window\.innerWidth/);
  assert.match(floating,/window\.innerHeight/);
  assert.match(floating,/event\.key==="Home"/);
  assert.match(floating,/max-h-\[calc\(100dvh-1\.5rem\)\]/);
  assert.match(floating,/overflow-y-auto/);
});

test("mini-PABX stays docked and within viewport after dial mode changes resize its height",async()=>{
  const floatingPath="src/features/telephony/presentation/UnionPbxFloatingPhone.tsx";
  const phonePath="src/features/telephony/presentation/UnionPbxToolPage.tsx";
  const floating=read(floatingPath);
  const phone=read(phonePath);
  assert.match(floating,/new ResizeObserver\(update\)/);
  assert.match(floating,/observer\?\.observe\(node\)/);
  assert.match(floating,/positionForDock\(dock,node\)/);
  assert.match(floating,/dockRef\.current=snapped\.dock/);
  assert.match(floating,/w-\[min\(430px,calc\(100vw-1\.5rem\)\)\]/);
  assert.match(floating,/w-\[min\(370px,calc\(100vw-1\.5rem\)\)\]/);
  assert.match(floating,/whitespace-nowrap text-xs font-bold/);
  assert.match(phone,/data-pbx-dial-mode="true"/);
  assert.match(phone,/border-primary bg-card text-primary ring-1 ring-inset ring-primary/);
  assert.ok((await transformWithEsbuild(floating,floatingPath,{loader:"tsx"})).code.length>150);
  assert.ok((await transformWithEsbuild(phone,phonePath,{loader:"tsx"})).code.length>150);
});

test("settings navigation restores originating channel configuration and keeps modal actions in fixed footer",()=>{
  const source=read("src/features/whatsapp-channels/presentation/WhatsAppAttendanceSettings.tsx");
  assert.match(source,/sectionTrail/);
  assert.match(source,/backToPrevious/);
  assert.match(source,/onSectionChange=\{next=>\{if\(isSection\(next\)\)openSection\(next\);\}\}/);
  assert.match(source,/footer=\{/);
  assert.match(source,/createConnectionRequest=\{createRequest\}/);
  assert.match(source,/footerTarget=\{footerTarget\}/);
});


test("Mini-PABX e mini-Atendimentos usam a mesma borda de destaque da toolbar fixa",()=>{
  const pbx=read("src/features/telephony/presentation/UnionPbxFloatingPhone.tsx");
  const whatsapp=read("src/features/whatsapp-channels/presentation/UnionWhatsAppFloatingPanel.tsx");
  const css=read("src/styles/index.css");
  for(const floating of [pbx,whatsapp]){
    assert.match(floating,/data-admin-floating-panel="true"/);
    assert.match(floating,/rounded-2xl border border-border bg-card/);
  }
  assert.match(css,/\.admin-crm\[data-admin-floating-panel="true"\] \{/);
  assert.match(css,/border-color: var\(--primary\) !important/);
  assert.match(css,/\.dark \.admin-crm\[data-admin-floating-panel="true"\]/);
  assert.match(css,/border-color: var\(--primary-light\) !important/);
  assert.match(css,/\[data-admin-sticky-toolbar="true"\]/);
});
