import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const order = read("src/features/orders/presentation/OrderDetailsPage.tsx");
const modal = read("src/features/whatsapp-channels/presentation/WhatsAppConversationModal.tsx");
const edge = read("supabase/functions/union-whatsapp-inbox/index.ts");
const adapter = read("src/features/orders/presentation/OrderWhatsAppConversationDialog.tsx");
const join = edge.slice(edge.indexOf('if(action==="os_join" || action==="contact_join")'), edge.indexOf('if(action==="start")'));

test("WhatsApp da OS disponível em todas as empresas com acesso autorizado", () => {
  for (const content of [order, modal, edge, adapter]) {
    assert.doesNotMatch(content, /TESTE_WHATSAPP_OS_ORGANIZATION_ID|TESTE_ORGANIZATION|5bcd7ec7-38f0-4dda-a84c-10429bd46b23|Recurso disponível somente na empresa Teste/);
  }
  assert.match(order, /const canUseWhatsAppModal = !monitorView && Boolean\(detail\?\.organization_id\) && hasPermission\("whatsapp.inbox.view"\)/);
  assert.match(order, /if \(!canUseWhatsAppModal \|\| !detail\)/);
  assert.match(order, /onWhatsApp=\{!monitorView && \(canUseWhatsAppModal \|\| canSendSac\)/);
  assert.match(modal, /organizationId !== activeOrganizationId \|\| !canViewInbox/);
  assert.match(modal, /operateUnionWhatsAppInbox\([\s\S]*?"os_join"/);
  assert.match(join, /if\(!canRead \|\| !permissions\.has\("orders.details.view"\)\)/);
});

test("A rota de abertura continua isolando OS, cliente, canal e operador por empresa", () => {
  assert.ok(join.startsWith('if(action==="os_join" || action==="contact_join")'));
  assert.match(edge, /if\(whatsappModule\?\.is_enabled!==true\)/);
  assert.match(edge, /const canRead=permissions\.has\("whatsapp.inbox.view"\) && Boolean\(staffRole\)/);
  assert.match(join, /\.eq\("organization_id",org\)\.eq\("id",orderId\)/);
  assert.match(join, /\.eq\("organization_id",org\)[\s\S]*?\.eq\("id",order.customer_id\)/);
  assert.match(join, /\.eq\("organization_id",org\)[\s\S]*?\.eq\("provider","wuzapi"\)/);
  assert.match(join, /\.eq\("organization_id",org\)\.eq\("channel_id",channel.id\)\.eq\("account_phone",channel.phone\)/);
  assert.match(join, /allowed\("collaborate"\)/);
  assert.match(join, /\.eq\("organization_id",org\)\.eq\("conversation_id",thread.id\)/);
});

test("Cadastros e Clientes abrem o mesmo modal de Atendimentos da OS", () => {
  const registration=read("src/features/registrations/presentation/RegistrationDetails.tsx");
  const contacts=read("src/features/registrations/presentation/RegistrationContactsPage.tsx");
  const customer=read("src/features/customers/presentation/CustomerDetailsPage.tsx");
  const action=read("src/features/whatsapp-channels/presentation/WhatsAppContactAction.tsx");
  for (const page of [registration,contacts,customer]) {
    assert.match(page, /<WhatsAppContactAction/);
    assert.doesNotMatch(page, /<CompanyWhatsAppAction/);
  }
  assert.match(registration, /entityId=\{selected\.id\}/);
  assert.match(contacts, /entityContactId=\{contact\.id\}/);
  assert.match(customer, /customerId=\{detail\?\.id\}/);
  assert.match(action, /useWhatsAppConversationModal/);
  assert.match(modal, /source\.kind==="order" \? "os_join" : "contact_join"/);
  assert.match(join, /\.from\("entities"\)/);
  assert.match(join, /\.from\("entity_contacts"\)/);
  assert.match(join, /\.eq\("organization_id",org\)\.eq\("entity_id",entityId\)/);
  assert.match(join, /\.from\("customers"\)/);
  assert.match(join, /allowed\("collaborate"\)/);
});

test("Atalhos da OS e Cadastros mostram o histórico sem reabrir protocolo encerrado", () => {
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const crm=read("src/features/whatsapp-channels/presentation/UnionWhatsAppCrmMenu.tsx");
  assert.match(modal, /onEmbeddedReady=\{setEmbeddedReady\}/);
  assert.match(modal, /Carregando atendimento\.\.\./);
  assert.match(inbox, /embedded && !protocolFilter && selected\.status === "finished" && canAction\("start"\)/);
  assert.match(inbox, /"Iniciar novo protocolo"/);
  assert.match(inbox, /!embedded && !protocolFilter && selected\.status === "finished" && canAction\("reopen"\)/);
  assert.match(inbox, /embedded && selected\.status==="finished" \? " · Histórico completo"/);
  assert.match(inbox, /setProtocolFilter\(null\)/);
  assert.match(inbox, /embedded \? Promise\.resolve\(\) : refresh\(true\)/);
  assert.match(crm, /LoaderCircle size=\{16\} className="animate-spin text-primary"/);
  assert.match(crm, /Consultando dados do CRM\.\.\./);
});

test("WhatsApp e Nova OS usam modais moviveis sem duplicar fundo escuro", () => {
  const dialog=read("src/shared/ui/admin/AdminLayout.tsx");
  const editor=read("src/features/orders/presentation/OrderEditorPage.tsx");
  const tab=read("src/features/orders/presentation/TabOrders.tsx");
  const actions=read("src/features/orders/presentation/OrderFormActions.tsx");
  assert.match(dialog, /draggable = false/);
  assert.match(dialog, /showOverlay = true/);
  assert.match(dialog, /onPointerDown=\{draggable \? startDialogDrag : undefined\}/);
  assert.match(dialog, /showOverlay=\{showOverlay\}/);
  assert.match(modal, /title="Atendimento WhatsApp"\s+draggable/);
  assert.match(modal, /Nova OS/);
  assert.match(modal, /<EmbeddedNewOrder/);
  assert.match(modal, /initialCustomerId=\{newOrder\.customerId\}/);
  assert.match(modal, /organizationIdOverride=\{organizationId\}/);
  assert.match(editor, /if \(embeddedDialog\) return <AdminDialog/);
  assert.match(editor, /draggable showOverlay=\{false\}/);
  assert.match(editor, /editorBody/);
  assert.match(actions, /inDialog= false|inDialog = false/);
  assert.match(tab, /embeddedDialog=\{embeddedCreate\}/);
  assert.match(tab, /onEmbeddedCreated\?\.\(savedOrderId\)/);
});

test("Nova OS reaproveita cliente confirmado sem criar vinculos por telefone ambiguo", () => {
  const order=read("src/features/orders/presentation/OrderDetailsPage.tsx");
  const tab=read("src/features/orders/presentation/TabOrders.tsx");
  assert.match(order, /customerId: detail\.customer_id \|\| undefined/);
  assert.match(modal, /source\.customerId \|\| null/);
  assert.match(modal, /"customer_match"/);
  assert.match(modal, /if \(!found\.ambiguous\) customerId = found\.customer\?\.id \|\| null/);
  assert.match(tab, /getOrderCustomerById\(/);
  assert.match(tab, /selectCustomer\(data\)/);
});
