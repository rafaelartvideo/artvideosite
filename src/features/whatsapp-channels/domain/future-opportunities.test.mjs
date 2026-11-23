import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {transformWithEsbuild} from "vite";
const read=(path)=>readFileSync(path,"utf8");
const migration=read("supabase/migrations/20261123144742_union_whatsapp_future_opportunities.sql");
const scopedMigration=read("supabase/migrations/20261123150148_union_whatsapp_future_opportunity_staff_scope.sql");
const repo=read("src/features/whatsapp-channels/infrastructure/future-opportunities.repository.ts");
const ui=read("src/features/whatsapp-channels/presentation/FutureOpportunities.tsx");
const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
const profile=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactDetails.tsx");
const directory=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactsDialog.tsx");
const dashboard=read("src/features/dashboard/presentation/DashboardAttendances.tsx");

test("oportunidade é persistente após finalizar o protocolo e isolada por empresa",()=>{
  assert.match(migration,/create table if not exists public\.union_whatsapp_future_opportunities/);
  assert.match(migration,/conversation_id uuid references public\.union_whatsapp_conversations\(id\) on delete set null/);
  assert.match(migration,/contact_id uuid references public\.union_whatsapp_contacts\(id\) on delete set null/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/has_effective_organization_permission\(organization_id,'whatsapp.inbox.view'\)/);
  assert.match(migration,/has_effective_organization_permission\(organization_id,'whatsapp.inbox.send'\)/);
  assert.match(migration,/union_wa_future_contact_idx/);
  assert.match(migration,/union_whatsapp_future_opportunity_history/);
  assert.doesNotMatch(migration,/alter publication supabase_realtime/i);
});
test("contato do WhatsApp mantém suas próprias oportunidades, inclusive sem conversa",async()=>{
  assert.match(profile,/FutureOpportunityContactSection/);
  assert.match(directory,/FutureOpportunityContactSection/);
  assert.match(directory,/conversation_id:null/);
  assert.match(inbox,/Registrar oportunidade futura/);
  assert.match(inbox,/FutureOpportunitiesWorkspace/);
  assert.match(repo,/\.eq\("organization_id",identity.organization_id\)/);
  assert.match(repo,/\.eq\("chat_jid",identity.chat_jid\)/);
  assert.match(repo,/\.eq\("account_phone",identity.account_phone\)/);
  assert.ok((await transformWithEsbuild(ui,"FutureOpportunities.tsx",{loader:"tsx"})).code.length>100);
  assert.ok((await transformWithEsbuild(repo,"future-opportunities.repository.ts",{loader:"ts"})).code.length>100);
});
test("consentimento, conversão e análise não disparam campanhas automáticas",()=>{
  assert.match(ui,/Cliente autorizou contato futuro sobre esse serviço/);
  assert.match(ui,/Não envia nenhuma mensagem automaticamente/);
  assert.match(ui,/locateServiceOrder/);
  assert.match(ui,/Histórico da oportunidade/);
  assert.match(ui,/Nenhuma oportunidade encontrada/);
  assert.match(dashboard,/view==="opportunities"/);
  assert.match(dashboard,/enabled:Boolean\(organizationId&&view==="opportunities"\)/);
  assert.doesNotMatch(ui,/sendWhatsApp|sendBulkMessage/);
});

test("oportunidades respeitam as permissões de gestores, fila, responsáveis e participantes",()=>{
  assert.match(scopedMigration,/private\.union_whatsapp_read_accounts\(\)/);
  assert.match(scopedMigration,/private\.union_whatsapp_read_organizations\('view_all'\)/);
  assert.match(scopedMigration,/private\.union_whatsapp_read_organizations\('view_assigned'\)/);
  assert.match(scopedMigration,/private\.union_whatsapp_read_organizations\('view_queues'\)/);
  assert.match(scopedMigration,/union_whatsapp_conversation_participants/);
  assert.match(scopedMigration,/private\.union_whatsapp_allowed\(p_org,\s*'send'\)/);
  assert.match(scopedMigration,/union_wa_future_history_select/);
});
test("Nova OS vinculada atualiza oportunidade e dashboard, sem perder a OS se vínculo falhar",()=>{
  assert.match(inbox,/onNewOrder=\{/);
  assert.match(inbox,/onEmbeddedCreated=\{\(orderId:string\)=>/);
  assert.match(inbox,/markFutureOpportunityConverted\(org,opportunityId,orderId\)/);
  assert.match(inbox,/OS criada, mas não foi possível vincular/);
  assert.match(ui,/Para marcar como convertida, vincule uma OS existente/);
  assert.match(ui,/void client\.invalidateQueries\(\{queryKey:\["dashboard","future-opportunities",identity.organization_id\]\}\)/);
});
