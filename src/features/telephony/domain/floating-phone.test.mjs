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
  assert.match(page,/extension=\{managedExtension\?\.number \?\? ownNumber \?\? null\}/);
  assert.match(page,/item\.endpoint_name === sipUser/);
  assert.ok((await transformWithEsbuild(floating,floatingPath,{loader:"tsx"})).code.length>150);
  assert.ok((await transformWithEsbuild(page,pagePath,{loader:"tsx"})).code.length>150);
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
