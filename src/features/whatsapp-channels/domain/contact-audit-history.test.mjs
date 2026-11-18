import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=path=>readFileSync(new URL("../../../../"+path,import.meta.url),"utf8");
const edge=read("supabase/functions/union-whatsapp-inbox/index.ts");
const schema=read("supabase/migrations/20261118010000_union_whatsapp_contact_audit_history.sql");
const timeline=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactHistory.tsx");
const contacts=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactsDialog.tsx");
const repository=read("src/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository.ts");

test("edits are audited server-side with the authenticated operator, not a client-provided user",()=>{
  assert.match(edge,/const actorId=userData\.user\.id;/);
  assert.match(edge,/contacts_save:"manage_contacts"/);
  assert.match(edge,/action==="contacts_save" && !String\(body\.chat_jid\|\|""\)\.trim\(\)/);
  assert.match(edge,/\? "create_contacts"/);
  assert.match(edge,/if\(!raw\)\{/);
  assert.match(edge,/if\(existingContact\)/);
  assert.match(edge,/admin\.rpc\("union_whatsapp_save_contact_audited"/);
  assert.match(edge,/p_contact_phone:number,p_actor:actorId/);
  const saveBranch=edge.slice(edge.indexOf('if(action==="contacts_save")'),edge.indexOf('if(action==="contacts_apply_names")'));
  assert.doesNotMatch(saveBranch,/await mergeContactRows\(/);
  assert.match(schema,/create or replace function public\.union_whatsapp_save_contact_audited/);
  assert.match(schema,/p_actor uuid/);
  assert.match(schema,/actor_user_id,actor_name_snapshot,action,changed_fields/);
  assert.match(schema,/if v_changed<>'\{\}'::jsonb then/);
});

test("contact audit is scoped and private, with paged reads and no anonymous access",()=>{
  assert.match(schema,/enable row level security/);
  assert.match(schema,/revoke all on public\.union_whatsapp_contact_audit from public, anon, authenticated/);
  assert.match(schema,/to service_role/);
  assert.match(schema,/revoke all on function public\.union_whatsapp_save_contact_audited/);
  assert.match(edge,/contacts_history:"view_contacts"/);
  assert.match(edge,/eq\("organization_id",org\)\.eq\("channel_id",channel\.id\)/);
  assert.match(edge,/eq\("account_phone",channel\.phone\)\.eq\("contact_id",contact\.id\)/);
  assert.match(edge,/\.range\(offset,offset\+50\)/);
});

test("general history merges changes with messages and works for contacts without a conversation",()=>{
  assert.match(repository,/"contacts_history"/);
  assert.match(repository,/history\?: UnionWhatsAppContactChange\[\]/);
  assert.match(timeline,/\.\.\.items\.map\(item=>\(\{key:"message:"/);
  assert.match(timeline,/\.\.\.changes\.map\(change=>\(\{key:"change:"/);
  assert.match(timeline,/timeline\.sort/);
  assert.match(timeline,/Alterado por: /);
  assert.match(timeline,/Anterior: /);
  assert.match(timeline,/Novo: /);
  assert.match(timeline,/if\(!conversation\)return;/);
  assert.match(contacts,/contactJid=\{selected\.chat_jid\}/);
  assert.match(contacts,/conversation=\{contactConversation\?\.chat_jid===selected\.chat_jid\?contactConversation:null\}/);
});
