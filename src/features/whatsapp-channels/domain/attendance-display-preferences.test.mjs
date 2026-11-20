import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read=path=>readFileSync(path,"utf8");
const helper=read("src/features/whatsapp-channels/domain/attendance-display-preferences.ts");
const page=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");

test("Preferências de atendimentos são locais, por operador e empresa, com defaults seguros",async()=>{
  const built=await transformWithEsbuild(helper,"attendance-display-preferences.ts",{loader:"ts",format:"esm"});
  const mod=await import("data:text/javascript;base64,"+Buffer.from(built.code).toString("base64"));
  assert.deepEqual(mod.readAttendanceDisplayPreferences(null,null),
    {preserveUnreadOnView:false,markReadWhenAssuming:true,focusComposerOnOpen:true});
  const storage=new Map();
  const previous=globalThis.window;
  globalThis.window={localStorage:{
    getItem:(key)=>storage.get(key)??null,
    setItem:(key,value)=>storage.set(key,value),
  }};
  try {
    mod.saveAttendanceDisplayPreferences("org-1","manager-1",{
      preserveUnreadOnView:true,markReadWhenAssuming:false,focusComposerOnOpen:false,
    });
    assert.deepEqual(mod.readAttendanceDisplayPreferences("org-1","manager-1"),{
      preserveUnreadOnView:true,markReadWhenAssuming:false,focusComposerOnOpen:false,
    });
    assert.equal(mod.readAttendanceDisplayPreferences("org-1","operator-2").preserveUnreadOnView,false);
    assert.equal(mod.readAttendanceDisplayPreferences("org-2","manager-1").preserveUnreadOnView,false);
    storage.set(mod.attendancePreferenceKey("org-1","manager-1"),"invalid json");
    assert.equal(mod.readAttendanceDisplayPreferences("org-1","manager-1").preserveUnreadOnView,false);
  } finally {
    if(previous===undefined)delete globalThis.window;
    else globalThis.window=previous;
  }
});

test("Atendimentos possui menu local e não marca como lida ao apenas visualizar",async()=>{
  assert.ok((await transformWithEsbuild(page,"UnionWhatsAppInboxPage.tsx",{loader:"tsx"})).code.length>100);
  assert.match(page,/data-attendance-preferences-trigger="true"/);
  assert.match(page,/checked=\{attendancePreferences\.preserveUnreadOnView\}/);
  assert.match(page,/checked=\{attendancePreferences\.markReadWhenAssuming\}/);
  assert.match(page,/checked=\{attendancePreferences\.focusComposerOnOpen\}/);
  assert.match(page,/attendancePreferences\.preserveUnreadOnView \|\|[\s\S]*?selected\.unread_count<=0/);
  assert.match(page,/if\(attendancePreferences\?\.markReadWhenAssuming\)[\s\S]*?operateUnionWhatsAppInbox\(activeOrganizationId, selected\.id, "mark_read"\)/);
  assert.match(page,/attendancePreferences\?\.focusComposerOnOpen/);
  assert.match(page,/saveAttendanceDisplayPreferences\(activeOrganizationId,user\.id,next\)/);
  assert.doesNotMatch(page,/role_permissions_save[\s\S]{0,150}preserveUnreadOnView/);
});
