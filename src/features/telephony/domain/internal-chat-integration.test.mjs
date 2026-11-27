import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {transformWithEsbuild} from "vite";
const read=path=>readFileSync(path,"utf8");
const root="supabase/migrations/20261127";
const base=read(root+"140000_internal_chat_persistent_calls.sql");
const presence=read(root+"140100_internal_chat_presence_pbx.sql");
const groups=read(root+"140200_internal_chat_groups_attachments.sql");
const metrics=read(root+"140300_internal_chat_scope_recent_metrics.sql");
const uiPath="src/features/internal-chat/presentation/InternalChat.tsx";
const pbxPath="src/features/telephony/presentation/UnionPbxToolPage.tsx";
const headerPath="src/features/admin-shell/presentation/AdminHeader.tsx";
const ui=read(uiPath);
test("persistent calls remain pending until response or sender cancellation",()=>{
  assert.ok(!base.includes("expires_at"));
  assert.ok(base.includes("where kind='call' and response is null"));
  assert.ok(base.includes("new.response='cancelled' and old.sender_id<>auth.uid()"));
  assert.ok(base.includes("pg_advisory_xact_lock"));
  assert.ok(ui.includes('.is("response",null)'));
  assert.ok(ui.includes('status==="SUBSCRIBED")invalidate()'));
});
test("chat uses isolated recipients, group membership and private storage",()=>{
  assert.ok(groups.includes("private.internal_chat_group_member(organization_id,group_id)"));
  assert.ok(groups.includes("group_id is not null and recipient_id is null and kind='text'"));
  assert.ok(groups.includes("internal_chat_can_remove_upload"));
  assert.ok(groups.includes("'internal-chat-files','internal-chat-files',false,10485760"));
  assert.ok(groups.includes("not exists(select 1 from public.internal_chat_messages m where m.attachment_path=p_path)"));
  assert.ok(presence.includes("extension='presence'"));
  assert.ok(metrics.includes("not denied.is_allowed"));
  assert.ok(metrics.includes("internal_chat.metrics.view"));
  for(const sql of [base,presence,groups,metrics]){
    assert.ok(!sql.split("\n").some(line=>line.endsWith("as $")||line==="$;"));
    assert.ok(sql.trim().endsWith("commit;"));
  }
});
test("no continuous polling, one chat mount, voice reuses existing dialer",async()=>{
  assert.ok(!ui.includes("setInterval("));
  assert.ok(!ui.includes("refetchInterval"));
  assert.ok(ui.includes("config:{private:true}"));
  assert.ok(ui.includes("const pageSize = 30"));
  assert.equal(read(headerPath).split("<InternalChat />").length-1,1);
  assert.ok(ui.includes("CHAT_PBX_PREFILL"));
  const pbx=read(pbxPath);
  assert.ok(pbx.includes("window.addEventListener(CHAT_PBX_PREFILL,onChatDial)"));
  assert.ok(pbx.includes('setDialMode("internal");setDialTarget(String(detail.number));onOpen()'));
  for(const path of [uiPath,pbxPath,headerPath])assert.ok((await transformWithEsbuild(read(path),path,{loader:"tsx"})).code);
});

test("chat polish protects reply boundaries, idempotency, deletion and settings",()=>{
 const polish=read(root+"140400_internal_chat_polish.sql");
 const reliability=read("src/features/internal-chat/application/chat-reliability.ts");
 for(const fragment of ["internal_chat_client_token_idx","Resposta fora da conversa","sender_id=auth.uid()","internal_chat_search_idx","enable row level security","internal_chat_guard_features","v_used+v_size>v_quota","internal_chat_notify_preferences","internal_chat_notify_settings"])assert.ok(polish.includes(fragment),fragment);
 assert.ok(polish.includes("m.deleted_at is null"));
 assert.ok(!polish.split("\n").some(line=>line.endsWith("as $")||line==="$;"));
 assert.ok(reliability.includes("client_token:item.token"));
 assert.ok(reliability.includes("navigator.locks.request"));
 assert.ok(ui.includes('window.addEventListener("online",online)'));
 assert.ok(ui.includes("Aguardando envio"));
 assert.ok(ui.includes("internal_chat_search_v1"));
 assert.ok(ui.includes("MediaRecorder"));
 assert.ok(ui.includes("compressChatImage"));
 assert.ok(ui.includes("internal_chat_settings_save_v1"));
 assert.ok(ui.includes("notifyOnce"));
});

test("chat docking clamps to viewport, snaps and resets to header",async()=>{
 const dockPath="src/features/internal-chat/presentation/useChatDock.ts";
 const dock=read(dockPath);
 const sql=read(root+"140500_internal_chat_directory_profiles.sql");
 assert.ok(dock.includes("setPointerCapture"));
 assert.ok(dock.includes("localStorage.setItem"));
 assert.ok(dock.includes("ResizeObserver"));
 assert.ok(ui.includes("dock.arrow"));
 assert.ok(ui.includes("Restaurar posição original"));
 assert.ok(ui.includes("internal_chat_directory_v2"));
 assert.ok(sql.includes("private.internal_chat_directory(p_org)"));
 assert.ok(sql.includes("emp.organization_id=p_org"));
 assert.ok(sql.includes("m.organization_id=p_org"));
 assert.ok((await transformWithEsbuild(dock,dockPath,{loader:"ts"})).code);
 const geometry=dock.slice(dock.indexOf("type Position="),dock.indexOf("function load("));
 const {code}=await transformWithEsbuild(geometry,"geometry.ts",{loader:"ts",format:"esm"});
 const {constrainChatPosition}=await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
 assert.deepEqual(constrainChatPosition({x:-100,y:999},360,530,1000,800),{x:10,y:260});
 assert.deepEqual(constrainChatPosition({x:20,y:245},360,530,1000,800,true),{x:10,y:260});
 assert.deepEqual(constrainChatPosition({x:200,y:100},360,530,1000,800,true),{x:200,y:100});
});
