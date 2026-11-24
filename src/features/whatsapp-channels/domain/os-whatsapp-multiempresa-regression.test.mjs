import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
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
  assert.match(order, /onWhatsApp=\{!monitorView && \(canUseWhatsAppModal \|\| canOpenExternalWhatsApp\)/);
  assert.match(order, /const canOpenExternalWhatsApp = hasPermission\("sac_digital.messages.send"\)/);
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

test("Modal da OS seleciona conversa vinculada sem esperar configuracoes secundarias", () => {
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const selection=inbox.slice(inbox.indexOf("// Navegação contextual do Dashboard"),
    inbox.indexOf("const checkChannel ="));
  assert.match(selection, /if\(embedded\)\{[\s\S]*?initialConversationId[\s\S]*?setSelectedId\(current=>current===initialConversationId\?current:initialConversationId\)/);
  assert.doesNotMatch(selection, /if\(embedded \|\| channelReady/);
  assert.match(inbox, /if\(embedded\)setReadyAccount\(identity\)/);
  assert.match(inbox, /if\(!embedded && !cancelled && organizationRef\.current===activeOrganizationId/);
});

test("WhatsApp da OS antecipa codigo sem antecipar consultas e revela a conversa progressivamente", () => {
  const order=read("src/features/orders/presentation/OrderDetailsPage.tsx");
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  assert.match(modal, /export function preloadEmbeddedWhatsAppConversation\(\)/);
  assert.match(modal, /inboxModulePromise = loadInboxModule\(\)/);
  assert.match(modal, /void preloadEmbeddedWhatsAppConversation\(\)\.catch\(\(\) => undefined\)/);
  assert.match(order, /if \(!visible \|\| !detail\?\.id \|\| !canUseWhatsAppModal\) return/);
  assert.match(order, /connection\?\.saveData/);
  assert.match(order, /window\.requestIdleCallback/);
  assert.match(order, /preloadEmbeddedWhatsAppConversation\(\)/);
  // A conversa continua protegida pelo os_join; nao prefetch de mensagens/contatos.
  assert.match(modal, /"order_recipients"/);
  assert.match(modal, /"os_join"/);
  assert.match(inbox, /if\(conversationOpeningError \|\| selected\?\.id===initialConversationId\)/);
  assert.match(inbox, /!conversationOpening && \(!embedded \|\| embeddedFullControls/);
  assert.match(inbox, /conversationOpening \? <div role="status"/);
  assert.match(inbox, /messagesResolvedId!==selectedId && !conversationOpeningError/);
});

test("Atalhos da OS e Cadastros mostram o histórico sem reabrir protocolo encerrado", () => {
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const crm=read("src/features/whatsapp-channels/presentation/UnionWhatsAppCrmMenu.tsx");
  assert.match(modal, /onEmbeddedReady=\{setEmbeddedReady\}/);
  assert.match(modal, /Carregando atendimento\.\.\./);
  assert.match(inbox, /embedded && !protocolFilter && selected\.status === "finished" && canAction\("start"\)/);
  assert.match(inbox, /onClick=\{startNewProtocol\}>Iniciar conversa/);
  assert.match(inbox, /!embedded && !protocolFilter && selected\.status === "finished"/);
  assert.match(inbox, /canAction\("reopen"\) && canAction\("start"\)/);
  assert.match(inbox, /embedded && selected\.status==="finished" \? " · Histórico completo"/);
  assert.match(inbox, /setProtocolFilter\(null\)/);
  assert.match(inbox, /embedded \? Promise\.resolve\(\) : refresh\(true\)/);
  assert.match(crm, /LoaderCircle size=\{17\} className="shrink-0 animate-spin text-primary"/);
  assert.match(crm, /Consultando dados do cliente\.\.\./);
  assert.doesNotMatch(crm, /animate-pulse space-y-2|aria-label="Consultando dados do CRM"/);
});

test("WhatsApp e Nova OS usam modais moviveis sem duplicar fundo escuro", () => {
  const dialog=read("src/shared/ui/admin/AdminLayout.tsx");
  const editor=read("src/features/orders/presentation/OrderEditorPage.tsx");
  const tab=read("src/features/orders/presentation/TabOrders.tsx");
  const actions=read("src/features/orders/presentation/OrderFormActions.tsx");
  assert.match(dialog, /draggable = false/);
  assert.match(dialog, /showOverlay = true/);
  assert.match(dialog, /ref=\{dragHeaderRef\}/);
  assert.match(dialog, /data-admin-dialog-drag-handle=\{draggable \? "true" : undefined\}/);
  assert.match(dialog, /showOverlay=\{floatingDesktop \? false : showOverlay\}/);
  assert.match(modal, /title="Atendimento WhatsApp"\s+draggable/);
  assert.match(modal, /Nova OS/);
  assert.match(modal, /<EmbeddedNewOrder/);
  assert.match(modal, /initialCustomerId=\{newOrder\.customerId\}/);
  assert.match(modal, /organizationIdOverride=\{organizationId\}/);
  assert.match(editor, /if \(embeddedDialog\) return <AdminDialog/);
  assert.match(editor, /draggable floating modal showOverlay=\{false\}/);
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
  assert.match(modal, /!found\.ambiguous \? found\.matched_customer_id \|\| found\.customer\?\.id \|\| null : null/);
  assert.match(tab, /getOrderCustomerById\(/);
  assert.match(tab, /selectCustomer\(data\)/);
});

test("Modais moviveis respeitam CSS global; Nova OS rola sem toolbar duplicada", () => {
  const css=read("src/styles/index.css");
  const dialog=read("src/shared/ui/admin/AdminLayout.tsx");
  const editor=read("src/features/orders/presentation/OrderEditorPage.tsx");
  const actions=read("src/features/orders/presentation/OrderFormActions.tsx");
  // Regression: drag must use native document mouse events and absolute
  // positioning with inline !important, not React state or Tailwind variables.
  assert.match(css, /top: calc\(50dvh \+ 2rem/);
  assert.match(dialog, /header\.addEventListener\("mousedown", onMouseDown, true\)/);
  assert.match(dialog, /document\.addEventListener\("mousemove", onMove, true\)/);
  assert.match(dialog, /document\.addEventListener\("mouseup", stopDrag, true\)/);
  assert.match(dialog, /node\.style\.setProperty\("left",/);
  assert.match(dialog, /node\.style\.setProperty\("top",/);
  assert.match(dialog, /node\.style\.setProperty\("translate", "none", "important"\)/);
  assert.match(dialog, /node\.style\.setProperty\("transform", "none", "important"\)/);
  assert.match(dialog, /position\(bounds\.left, bounds\.top\)/);
  assert.match(dialog, /clampAdminDialogPosition\(\{ left, top, width: bounds\.width, height: bounds\.height/);
  assert.doesNotMatch(dialog, /visibleWidth|visibleHeight/);
  assert.match(dialog, /header\.addEventListener\("dblclick", center\)/);
  assert.doesNotMatch(dialog, /setPointerCapture|setDragPosition|data-admin-dialog-positioned/);
  assert.match(dialog, /footerClassName/);
  assert.match(editor, /modal showOverlay=\{false\}/);
  assert.match(editor, /!overflow-y-auto !overscroll-contain !p-0/);
  assert.match(editor, /footerClassName="!border-t !border-border/);
  assert.match(dialog, /<GripHorizontal size=\{17\}/);
  assert.match(actions, /if \(inDialog\) return <div/);
  assert.match(actions, /return <AdminStickyToolbar className="!justify-between gap-2 sm:gap-3">/);
  assert.doesNotMatch(actions, /style=\{inDialog \?/);
});

test("Em atendimento prioriza a conversa com a mensagem mais recente inclusive no realtime", () => {
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const repository=read("src/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository.ts");
  assert.match(repository,/options.filter==="forwarded"\?"forwarded_at":"last_message_at"/);
  assert.match(repository,/\.order\(sort,\{ascending:options.filter==="waiting" && !options.sortByRecent,nullsFirst:false\}\)/);
  assert.match(inbox,/const latestMessageFirst=/);
  assert.match(inbox,/setConversations\(options.filter==="in_att"/);
  assert.match(inbox,/payload.eventType==="INSERT"/);
  assert.match(inbox,/row.direction==="incoming"/);
  assert.match(inbox,/last_message_at:sentAt/);
  assert.match(inbox,/updated.sort\(latestMessageFirst\)/);
  assert.match(inbox,/const visible=filter==="in_att"/);
  assert.match(inbox,/schedule\(threadId,true\)/);
});

test("O menu de documentos permanece no ^ e o atalho duplicado sai do compositor geral e do modal", () => {
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const modal=read("src/features/whatsapp-channels/presentation/WhatsAppConversationModal.tsx");
  assert.match(modal,/<EmbeddedWhatsAppConversation/);
  assert.match(inbox,/aria-label="Mais opções da conversa"/);
  assert.match(inbox,/Enviar documento da OS/);
  assert.match(inbox,/aria-label="Anexar imagem, áudio, vídeo ou arquivo"/);
  assert.doesNotMatch(inbox,/documentInputRef|aria-label=\{onPrepareOrderDocument\?/);
});

test("Mini-Atendimentos persiste fora das rotas e reutiliza o canal do CRM",()=>{
  const admin=read("src/app/Admin.tsx");
  const provider=read("src/features/whatsapp-channels/presentation/UnionWhatsAppActivityProvider.tsx");
  const floating=read("src/features/whatsapp-channels/presentation/UnionWhatsAppFloatingPanel.tsx");
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  assert.match(admin,/<UnionWhatsAppActivityProvider/);
  assert.match(admin,/enabled=\{canAccessWhatsAppTool\}/);
  assert.match(admin,/isPageOpen=\{activeTab === "tools" && route.resourceId === "union-whatsapp"\}/);
  assert.match(admin,/onOpenFull=\{\(\) => navigateAdmin\("tools", "union-whatsapp"\)\}/);
  assert.match(provider,/supabase.channel\("union-whatsapp-activity:"/);
  assert.equal((provider.match(/\.subscribe\(status=>/g)||[]).length,1);
  assert.match(provider,/listenersRef\.current\.forEach\(listener=>listener\(event\)\)/);
  assert.match(inbox,/stopShared=sharedActivity.subscribe/);
  assert.match(inbox,/if\(realtime\)void supabase.removeChannel\(realtime\)/);
  assert.match(inbox,/if\(sharedActivity && !embedded && !sharedActivity.isPageOpen\)return/);
  assert.match(floating,/data-whatsapp-floating="true"/);
  assert.match(floating,/data-whatsapp-expanded=\{expanded\?"true":"false"\}/);
  assert.match(floating,/snapToEdge/);
  assert.match(floating,/Restaurar posição do mini-Atendimentos/);
  assert.match(floating,/onSelect\(item.id\)/);
  assert.match(provider,/<ConversationModal/);
});

test("Alertas WhatsApp são limitados por empresa, operador e atividade recente",()=>{
  const provider=read("src/features/whatsapp-channels/presentation/UnionWhatsAppActivityProvider.tsx");
  assert.match(provider,/row.organization_id===organizationId&&row.channel_id===channelId/);
  assert.match(provider,/row.account_phone===channelPhone/);
  assert.match(provider,/row.direction==="incoming"/);
  assert.match(provider,/notifiedRef.current.has\(incoming.messageId\)/);
  assert.match(provider,/row.status==="waiting"\|\|row.assigned_to===userId/);
  assert.match(provider,/pageOpenRef.current\|\|expandedRef.current\|\|conversationOpenRef.current\|\|[\s\S]*?document.visibilityState!=="visible"/);
  assert.match(provider,/setTimeout\(\(\)=>setAlert/);
  assert.match(provider,/document.visibilityState!=="visible"/);
});

test("Mini-Atendimentos consulta prévias pequenas sem polling intenso nem mídia",()=>{
  const provider=read("src/features/whatsapp-channels/presentation/UnionWhatsAppActivityProvider.tsx");
  const repo=read("src/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository.ts");
  assert.match(repo,/pageSize\?:number/);
  assert.match(repo,/Math\.min\(INBOX_PAGE_SIZE,Math.max\(1,Math.floor\(options.pageSize\)\)\)/);
  assert.match(provider,/page:0,pageSize:8/);
  assert.match(provider,/now-lastCountsRef.current<8_000/);
  assert.match(provider,/lastCountsRef.current>120_000/);
  assert.match(provider,/setTimeout\(\(\)=>\{[\s\S]*?\},1_200\)/);
  assert.match(provider,/void supabase.removeChannel\(realtime\)/);
  assert.doesNotMatch(provider,/setInterval\(/);
  assert.doesNotMatch(provider,/listUnionWhatsAppMessages|media_view/);
  // Nenhum prefetch independente no provider: o próprio avatar observa a visibilidade.
  assert.doesNotMatch(provider,/fetchSharedAvatar|avatarRequestsRef|avatarCheckedAtRef/);
  assert.match(provider,/<UnionWhatsAppFloatingPanel/);
});


test("Mensagem recebida salva contato individual automaticamente, sem importar grupo nem sobrescrever nome salvo",()=>{
  const webhook=read("supabase/functions/union-whatsapp-webhook/index.ts");
  assert.match(webhook,/unsupported_chat/);
  assert.match(webhook,/if \(inserted\) \{/);
  assert.match(webhook,/if \(!isFromMe\) \{/);
  assert.match(webhook,/union_whatsapp_contacts/);
  assert.match(webhook,/const contactJid=savedContact\?\.chat_jid \|\| phoneJid \|\| chatJid/);
  assert.match(webhook,/ignoreDuplicates:true/);
  assert.match(webhook,/if\(phone && !known.contact_phone\)/);
  assert.doesNotMatch(webhook,/patch\.display_name=name/);
  const edge=read("supabase/functions/union-whatsapp-inbox/index.ts");
  assert.doesNotMatch(edge,/display_name\.not\.is\.null,device_name\.not\.is\.null,wuzapi_verified_saved\.eq\.true/);
});

test("Grupos WuzAPI ficam separados da agenda e não carregam os JIDs dos participantes",()=>{
  const bridge=read("services/union-wuzapi-bridge/server.mjs");
  const edge=read("supabase/functions/union-whatsapp-inbox/index.ts");
  const contacts=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactsDialog.tsx");
  const manager=read("src/features/whatsapp-channels/presentation/UnionWhatsAppGroupsManager.tsx");
  assert.match(bridge,/wuzapi\("\/group\/list",session\.token\)/);
  assert.match(bridge,/action==="groups_list"/);
  assert.match(bridge,/participants_count:/);
  assert.doesNotMatch(bridge.slice(bridge.indexOf('if(action==="groups_list")'),bridge.indexOf('if(action==="contacts_export")')),/participants:group\.Participants/);
  assert.match(edge,/contacts_groups:"manage_groups"/);
  assert.match(edge,/if\(action==="contacts_groups"\)/);
  assert.match(edge,/group[s]?\.length/);
  assert.doesNotMatch(contacts,/aria-pressed=\{tab==="groups"\}/);
  assert.doesNotMatch(contacts,/UnionWhatsAppGroupsManager/);
  assert.match(manager,/aria-label="Gerenciar grupo WhatsApp"/);
  assert.match(manager,/group_command:command/);
  assert.match(edge,/contacts_groups_manage:"manage_groups"/);
  assert.match(edge,/if\(!canManageGroups\)return json/);
  assert.doesNotMatch(contacts,/canManageGroups/);
});

test("Grupos são conversas do Atendimento: mesma disposição, painel de dados separado e composer fixo",()=>{
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const groupInbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppGroupsInbox.tsx");
  const groupChat=read("src/features/whatsapp-channels/presentation/UnionWhatsAppGroupChat.tsx");
  const groupManager=read("src/features/whatsapp-channels/presentation/UnionWhatsAppGroupsManager.tsx");
  const contacts=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactsDialog.tsx");
  assert.match(inbox,/groupConversationsOpen&&canAction\("manage_groups"\)&&activeOrganizationId&&activeChannelPhone/);
  assert.doesNotMatch(contacts,/onOpenGroups/);
  assert.match(inbox,/aria-label="Ações das conversas"/);
  assert.match(groupInbox,/lg:grid-cols-\[340px_minmax\(0,1fr\)\]/);
  assert.match(groupInbox,/aria-label="Buscar conversa de grupo"/);
  assert.match(groupInbox,/group=\{selected\} creating=\{false\}[\s\S]*?hideChat/);
  assert.match(groupInbox,/layout="conversation"/);
  assert.match(groupChat,/flex min-h-0 flex-1 flex-col overflow-hidden bg-card/);
  assert.match(groupChat,/shrink-0 border-t border-border bg-card/);
  assert.match(groupChat,/useLayoutEffect/);
  assert.match(groupChat,/role="separator"/);
  assert.doesNotMatch(groupChat,/group_command:"history"/);
  assert.match(groupManager,/!hideChat&&\(canManage\|\|canSend\)/);
});

test("Dados do CRM do contato são consultados somente após seleção e com permissões",()=>{
  const edge=read("supabase/functions/union-whatsapp-inbox/index.ts");
  const dialog=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactsDialog.tsx");
  assert.match(edge,/contacts_crm_match:"view_contacts"/);
  assert.match(edge,/if\(!permissions\.has\("customers\.view"\)\)/);
  assert.match(edge,/\.eq\("account_phone",channel\.phone\)\.eq\("chat_jid",jid\)\.maybeSingle\(\)/);
  assert.match(edge,/union_whatsapp_find_customer_by_phone/);
  assert.match(edge,/matches\.length!==1/);
  assert.match(edge,/permissions\.has\("orders\.details\.view"\)/);
  assert.match(dialog,/if\(!selected\|\|creating\|\|!canReadCrm\)/);
  assert.match(dialog,/"contacts_crm_match",\{chat_jid:selected\.chat_jid\}/);
  assert.match(dialog,/aria-label="Dados do cliente vinculado no CRM"/);
});

test("Mini-Atendimentos mantém o canto inferior, a altura e a lista em cache ao trocar abas",()=>{
  const provider=read("src/features/whatsapp-channels/presentation/UnionWhatsAppActivityProvider.tsx");
  const panel=read("src/features/whatsapp-channels/presentation/UnionWhatsAppFloatingPanel.tsx");
  const repository=read("src/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository.ts");
  assert.match(panel,/bottom:toolbarClearance>0\?/);
  assert.match(panel,/calc\(1rem \+ env\(safe-area-inset-bottom,0px\)\)/);
  assert.match(panel,/h-\[min\(555px,calc\(100dvh-2rem\)\)\]/);
  assert.match(panel,/aria-label="Carregando conversas"/);
  assert.match(panel,/Array\.from\(\{length:6\}/);
  assert.match(panel,/waitingLabel\(minutes\)/);
  assert.match(panel,/waitingClasses\(minutes\)/);
  assert.match(panel,/border-l-emerald-500\/70 bg-emerald-500\/10/);
  assert.match(panel,/WhatsAppContactAvatar/);
  assert.match(provider,/const \[lists,setLists\]=useState<Record<Filter,MiniList>>\(emptyLists\)/);
  assert.match(provider,/const MINI_LIST_TTL=45_000/);
  assert.match(provider,/const MINI_LIST_EVENT_THROTTLE=6_000/);
  assert.match(provider,/refreshLists\(\["in_att","waiting"\]\)/);
  assert.match(provider,/page:0,pageSize:8,sortByRecent:tab==="in_att"/);
  assert.doesNotMatch(provider,/setRows\(\[\]\)/);
  assert.match(repository,/sortByRecent\?:boolean/);
  assert.match(repository,/options\.filter==="waiting" && !options\.sortByRecent/);
});

test("Mini conversa fica estável e reutiliza fotos sem consulta em cada mudança de aba",()=>{
  const provider=read("src/features/whatsapp-channels/presentation/UnionWhatsAppActivityProvider.tsx");
  const panel=read("src/features/whatsapp-channels/presentation/UnionWhatsAppFloatingPanel.tsx");
  assert.match(provider,/const modalContext=useMemo\(\(\)=>conversationId && activeOrganizationId/);
  assert.match(provider,/context=\{modalContext\}/);
  const modal=read("src/features/whatsapp-channels/presentation/WhatsAppConversationModal.tsx");
  assert.match(modal,/const sourceKey = source.kind==="conversation"/);
  assert.match(modal,/phone, sourceKey, activeOrganizationId, canViewInbox/);
  assert.doesNotMatch(modal,/phone, source, activeOrganizationId, canViewInbox/);
  assert.match(provider,/hidden=\{Boolean\(conversationId\)\}/);
  assert.match(panel,/hidden\?"invisible pointer-events-none "/);
  assert.doesNotMatch(provider,/avatarRequestsRef|avatarCheckedAtRef|fetchSharedAvatar/);
  assert.doesNotMatch(panel,/avatars:Record<string,string\|null>/);
  assert.match(panel,/WhatsAppContactAvatar/);
  assert.doesNotMatch(provider,/setInterval\(/);
});

test("Filtro por operador do gestor usa paginação no banco e permissões do canal", () => {
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const repository=read("src/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository.ts");
  const edge=read("supabase/functions/union-whatsapp-inbox/index.ts");

  // Apenas gestores com view_all podem consultar operadores e filtrar.
  assert.match(inbox, /canManage && supportsOperatorFilter\(filter\) && <select aria-label="Filtrar operador"/);
  assert.match(inbox, /const supportsOperatorFilter=\(value:Filter\)=>value==="in_att" \|\| value==="finished" \|\| value==="forwarded"/);
  assert.match(inbox, /"operator_filter_list"/);
  assert.match(inbox, /operator:canManage && supportsOperatorFilter\(filter\) \? operatorFilter : "all"/);
  assert.match(inbox, /\[filter,departmentFilter,operatorFilter,debouncedQuery,conversationPage,readyAccount/);
  assert.match(edge, /operator_filter_list:"view_all"/);
  assert.match(edge, /action==="operator_filter_list"/);
  // A action precisa estar nas DUAS listas iniciais do validador:
  // sem conversation_id e ações permitidas. Se só existir no handler,
  // o servidor rejeita com HTTP 400 "Operação inválida" antes de executar.
  const validation=edge.slice(edge.indexOf('if (!uuid(org) ||'),edge.indexOf('return json({success:false,error:"Operação inválida."},400);'));
  assert.equal((validation.match(/"operator_filter_list"/g)||[]).length,2);
  assert.match(edge, /item\.is_active && item\.eligible && item\.can_attend/);

  // O filtro precisa chegar ao PostgREST antes do order/range, não cortar
  // os itens da página já recebida do banco.
  const operatorFilter=repository.indexOf('query=query.eq("assigned_to",options.operator)');
  const forwardedOperatorFilter=repository.indexOf('query=query.eq("forwarded_by",options.operator)');
  const pagination=repository.indexOf('.range(page*pageSize,(page+1)*pageSize)');
  assert.ok(operatorFilter>0 && pagination>operatorFilter);
  assert.ok(forwardedOperatorFilter>0 && pagination>forwardedOperatorFilter);
  assert.match(repository, /options\.canViewAll && options\.operator && options\.operator!=="all"/);
  assert.match(repository, /options\.filter==="in_att" \|\| options\.filter==="finished"/);
  assert.match(repository, /options\.filter==="forwarded"/);
  assert.match(repository, /query=query\.eq\("forwarded_by",options\.operator\)/);
  assert.match(inbox, /setConversationPage\(0\);setOperatorFilter\(event\.target\.value\)/);
  assert.match(inbox, /scopedConversations\.filter\(item=>item\.status==="in_att" && !hasForwarding\(item\)\)/);
  assert.match(inbox, /scopedConversations\.filter\(queueOnly\)/);

  // Departamento continua combinável; troca de empresa limpa o filtro.
  assert.match(inbox, /setDepartmentFilter\("all"\);\s*setOperatorFilter\("all"\)/);
  assert.match(repository, /query=query.eq\("department_id",options.department\)/);
});

test("Mini WhatsApp mostra primeiro quem aguarda há mais tempo, sem reordenar por mensagens novas",()=>{
  const provider=read("src/features/whatsapp-channels/presentation/UnionWhatsAppActivityProvider.tsx");
  const panel=read("src/features/whatsapp-channels/presentation/UnionWhatsAppFloatingPanel.tsx");
  const repository=read("src/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository.ts");
  assert.match(provider,/const waitingFirst=/);
  assert.match(provider,/Date.parse\(a.queue_entered_at\|\|a.created_at\)/);
  assert.match(provider,/Date.parse\(b.queue_entered_at\|\|b.created_at\)/);
  assert.match(provider,/const sortForTab=/);
  assert.match(provider,/sortByRecent:tab==="in_att"/);
  assert.match(provider,/sort\(sortForTab\(tab\)\)/);
  assert.match(repository,/options.filter==="waiting" && !options.sortByRecent\?"queue_entered_at"/);
  assert.match(panel,/filter==="waiting"\?"Mais tempo na fila primeiro":"Mensagens recentes primeiro"/);
  assert.match(panel,/import \{ WhatsAppBrandIcon \} from "@\/shared\/ui\/icons\/WhatsAppBrandIcon"/);
  assert.match(panel,/<WhatsAppBrandIcon size=\{18\} className="text-primary"\/>/);
  assert.doesNotMatch(panel,/<MessageCircle size=/);
});


test("Notificação fica ancorada ao ícone WhatsApp, segue o drag e não sai da tela",()=>{
  const floating=read("src/features/whatsapp-channels/presentation/UnionWhatsAppFloatingPanel.tsx");
  assert.match(floating,/ref=\{whatsappIconRef\}/);
  assert.match(floating,/ref=\{alertRef\}/);
  assert.match(floating,/origin=icon.getBoundingClientRect\(\)/);
  assert.match(floating,/setAlertGeometry\(/);
  assert.match(floating,/window.addEventListener\("resize",update\)/);
  assert.match(floating,/window.addEventListener\("scroll",update,true\)/);
  assert.match(floating,/ResizeObserver\(update\)/);
  assert.match(floating,/clamp\(center-bounds.width\/2,EDGE/);
  assert.match(floating,/const side:AlertGeometry\["side"\]/);
  assert.match(floating,/data-whatsapp-anchored-alert="true"/);
  assert.match(floating,/data-whatsapp-alert-arrow=\{alertGeometry\?\.side\|\|"above"\}/);
  assert.match(floating,/onClick=\{\(\)=>onSelect\(alert.id\)\}/);
  assert.doesNotMatch(floating,/bottom-\[calc\(11\.5rem/);
});

test("Sons distintos usam o mesmo Realtime, sem áudio fictício antes dos arquivos",()=>{
  const provider=read("src/features/whatsapp-channels/presentation/UnionWhatsAppActivityProvider.tsx");
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const sounds=read("src/features/whatsapp-channels/application/union-whatsapp-sounds.ts");
  assert.match(sounds,/notification:null/);
  assert.match(sounds,/conversation:null/);
  assert.match(sounds,/if\(!url \|\| !messageId/);
  assert.match(sounds,/document.visibilityState!=="visible"/);
  assert.match(sounds,/seenMessages.has\(key\)/);
  assert.match(sounds,/void audio.play\(\).catch/);
  assert.match(provider,/trackOpenConversation:\(id:string\)=>\(\)=>void/);
  assert.match(inbox,/sharedActivity.trackOpenConversation\(selectedId\)/);
  assert.match(provider,/playUnionWhatsAppSound\("notification",incoming.messageId\)/);
  assert.match(provider,/playUnionWhatsAppSound\("conversation",messageId\)/);
  assert.match(provider,/openConversationsRef.current.has\(id\)/);
  assert.equal((provider.match(/supabase.channel\(/g)||[]).length,1);
});

test("Avatar compartilhado evita spinner infinito e utiliza a mesma foto nos quatro locais",()=>{
  const visual=read("src/features/whatsapp-channels/presentation/WhatsAppInboxVisuals.tsx");
  const shared=read("src/features/whatsapp-channels/application/shared-whatsapp-avatar-cache.ts");
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const contacts=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactsDialog.tsx");
  const mini=read("src/features/whatsapp-channels/presentation/UnionWhatsAppFloatingPanel.tsx");
  const edit=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactEditDialog.tsx");
  const edge=read("supabase/functions/union-whatsapp-inbox/index.ts");
  assert.match(shared,/identity.organizationId\+":"\+identity.accountPhone\+":"\+identity.chatJid/);
  assert.match(shared,/const MAX_CONCURRENT=3/);
  assert.match(shared,/const MAX_ENTRIES=160/);
  assert.match(shared,/const FOUND_TTL=85\*60_000/);
  assert.match(shared,/const previous=pending.get\(key\)/);
  assert.match(shared,/const stored=peekSharedAvatar\(key\)/);
  assert.match(shared,/subscribeSharedAvatar/);
  assert.match(shared,/markSharedAvatarBroken/);
  assert.match(shared,/const genders=new Map/);
  assert.match(visual,/IntersectionObserver/);
  assert.match(visual,/rootMargin:"120px 0px"/);
  assert.match(visual,/setBrokenUrl\(imageUrl\)/);
  assert.match(visual,/markSharedAvatarBroken\(key,imageUrl,identity\)/);
  assert.match(visual,/useSyncExternalStore/);
  assert.match(visual,/readyToken===imageToken/);
  assert.doesNotMatch(visual,/useEffect\(\(\)=>setImageReady\(false\)/);
  assert.match(shared,/brokenRetryAfter/);
  assert.match(shared,/fetchSharedAvatar\(identity,true\)/);
  assert.match(shared,/forceRefresh=false/);
  assert.match(shared,/if\(!entry\|\|entry.url!==url\)return/);
  assert.match(shared,/cacheEpoch\+\+/);
  assert.match(visual,/src=\{fallback\}/);
  assert.match(visual,/genderValue==="M"/);
  assert.match(visual,/genderValue==="F"/);
  assert.doesNotMatch(visual,/LoaderCircle|Carregando foto/);
  for(const view of [inbox,contacts,mini,edit])assert.match(view,/identity=\{\{/);
  assert.doesNotMatch(inbox,/fetchSharedAvatar|avatarCheckedAtRef|previewIds/);
  assert.doesNotMatch(contacts,/fetchSharedAvatar|listAvatars|avatarCheckedAtRef/);
  assert.match(edge,/select\("id,gender,document,cnpj,phone,whatsapp,email,addresses:customer_addresses/);
  assert.match(edge,/customer_type,gender,document/);
});


test("Vinculação de terceiros à OS não altera os números do cadastro e permanece isolada por empresa",()=>{
  const migration=read("supabase/migrations/20261117160500_union_whatsapp_order_contacts.sql");
  const edge=read("supabase/functions/union-whatsapp-inbox/index.ts");
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const modal=read("src/features/whatsapp-channels/presentation/WhatsAppConversationModal.tsx");
  const crm=read("src/features/whatsapp-channels/presentation/UnionWhatsAppCrmMenu.tsx");
  const repository=read("src/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository.ts");

  assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.union_whatsapp_order_contacts/);
  assert.match(migration,/UNIQUE\(organization_id,service_order_id,conversation_id\)/);
  assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
  assert.match(migration,/REVOKE ALL ON TABLE public\.union_whatsapp_order_contacts FROM anon,authenticated/);
  assert.doesNotMatch(migration,/UPDATE (?:public\.)?customers\s+SET/i);

  const check=edge.slice(edge.indexOf('if (!uuid(org) ||'),edge.indexOf('return json({success:false,error:"Operação inválida."},400);'));
  assert.equal((check.match(/"order_recipients"/g)||[]).length,2);
  // Escolher destinatário é leitura da OS, não permissão para vincular conversas.
  assert.doesNotMatch(edge,/order_recipients:"link_orders"/);
  assert.match(edge,/if\(action==="order_recipients"\)/);
  assert.match(edge,/if\(action==="order_options" \|\| action==="order_link"\)/);
  assert.match(edge,/digits.length===11\|\|digits.length===14/);
  assert.match(edge,/\.eq\("organization_id",org\)\.eq\(column,digits\)/);
  assert.match(edge,/\.eq\("organization_id",org\)\.ilike\("os_number",query\+"%"\)/);
  assert.match(edge,/onConflict:"organization_id,service_order_id,conversation_id"/);
  assert.match(edge,/\.eq\("conversation_id",selectedLinkedConversation\)/);
  assert.match(edge,/Este contato não está vinculado à OS/);
  assert.doesNotMatch(edge.slice(edge.indexOf('if(action==="order_options" || action==="order_link")'),
    edge.indexOf('// Legacy clients receive')),/\.update\(\{(?:phone|whatsapp):/);

  assert.match(repository,/"order_recipients"/);
  assert.match(inbox,/Buscar OS por número ou CPF\/CNPJ/);
  assert.match(inbox,/service_order_id:id,unlink/);
  assert.doesNotMatch(inbox,/linkedOrders\.map/);
  assert.match(inbox,/role="search"/);
  assert.match(inbox,/void searchOrders\(\)/);
  assert.doesNotMatch(inbox,/orderSearch\?350:0/);
  assert.match(inbox,/ordersSearched&&<div/);
  assert.match(modal,/Escolha com quem falar sobre esta OS/);
  const recipientLookup=edge.slice(edge.indexOf('if(action==="order_recipients")'),
    edge.indexOf('// A OS e os cadastros compartilham'));
  assert.ok(recipientLookup.includes(String.raw`replace(/\D/g,"")`),"Os telefones devem ter pontuação removida");
  assert.ok(recipientLookup.includes(String.raw`/^55[1-9]\d{9,10}$/`),"Validação precisa aceitar dígitos reais");
  assert.ok(!recipientLookup.includes(String.raw`replace(/\\D/g,"")`),"Não usar barra duplicada na normalização");
  assert.ok(modal.includes('if(recipients.length>1)set({status:"choosing",recipients})'),
    "Selecionar destinatário apenas quando houver mais de um número");
  assert.ok(modal.includes('else if(recipients.length===1)void chooseOrderRecipient(recipients[0])'),
    "Um único número deve abrir automaticamente, sem tela de escolha");
  assert.match(recipientLookup,/const seen=new Set<string>\(\)/,
    "A lista de destinatários precisa remover números repetidos");
  assert.match(modal,/WhatsAppContactAvatar/);
  assert.match(modal,/recipient\.kind==="linked" \? "Vinculado" : recipient\.entity_contact_id \? "Contato adicional" : "Cadastro"/);
  assert.match(inbox,/Trocar número/);
  assert.match(modal,/order_recipients/);
  assert.match(modal,/linked_conversation_id:recipient\.conversation_id/);
  assert.match(modal,/registered_phone_field:recipient\.field/);
  assert.match(crm,/Vinculado por OS/);
  assert.match(crm,/Este número pertence a um contato vinculado à OS/);
});


test("Detalhes do contato mostram mídias, documentos e links sob demanda com autorização de conversa",()=>{
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const repo=read("src/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository.ts");
  const info=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactDetails.tsx");
  assert.match(inbox,/setContactDetailsOpen\(true\)/);
  assert.match(inbox,/UnionWhatsAppContactDetails/);
  assert.match(info,/Mídias, documentos e links/);
  assert.match(info,/listUnionWhatsAppSharedItems/);
  assert.match(info,/media_view/);
  assert.match(info,/Mostrar mais/);
  assert.match(info,/role="tablist"/);
  assert.match(info,/WhatsAppContactAvatar/);
  assert.match(repo,/\.eq\("organization_id",organizationId\)/);
  assert.match(repo,/\.eq\("channel_id",channelId\)/);
  assert.match(repo,/\.eq\("account_phone",accountPhone\)/);
  assert.match(repo,/\.eq\("conversation_id",conversationId\)/);
  assert.match(repo,/const SHARED_PAGE_SIZE=24/);
});


test("Prévia de mensagens e filtro de operadores mostram formatação e totais da aba",()=>{
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const edge=read("supabase/functions/union-whatsapp-inbox/index.ts");
  const repo=read("src/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository.ts");
  assert.match(inbox,/WhatsAppFormattedText text=\{item\.last_message/);
  assert.match(inbox,/operatorCounts\[person\.id\]\|\|0/);
  assert.match(inbox,/person\.name\.trim\(\)\.split\(\/\\s\+\/\)\[0\]/);
  assert.match(inbox,/department_filter:canManage\?departmentFilter:"all"/);
  assert.match(inbox,/canManage && <select aria-label="Filtrar departamento"/);
  assert.match(inbox,/conversationTotal\/50/);
  assert.match(inbox,/filter:filter as "in_att"\|"finished"\|"forwarded"/);
  assert.match(repo,/operator_counts\?: Record<string,number>/);
  assert.match(edge,/operator_counts:filterCounts/);
  assert.match(edge,/\.eq\("organization_id",org\)\.eq\("channel_id",requestedChannel\)/);
  assert.match(edge,/\.eq\("account_phone",account\)/);
});

test("Agenda WhatsApp tem área maior, menus CRM e rodapé fixo alinhado à paginação",()=>{
  const contacts=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactsDialog.tsx");
  assert.match(contacts,/fixed inset-x-0 bottom-0 top-16/);
  assert.match(contacts,/h-full max-h-\[960px\] min-h-0/);
  assert.match(contacts,/max-w-\[1180px\]/);
  assert.match(contacts,/setCrmPanel\("registration"\)/);
  assert.match(contacts,/setCrmPanel\("equipments"\)/);
  assert.match(contacts,/setCrmPanel\("orders"\)/);
  assert.match(contacts,/setCrmEquipmentId\(item\.id\)/);
  assert.match(contacts,/flex min-h-0 flex-col/);
  assert.match(contacts,/min-h-\[58px\] shrink-0/);
  assert.doesNotMatch(contacts,/Nome importado por arquivo \(VCF\/Excel\/CSV\):/);
  assert.doesNotMatch(contacts,/Nome da agenda sincronizada:/);
  assert.doesNotMatch(contacts,/Nome público do WhatsApp:/);
  assert.doesNotMatch(contacts,/O nome salvo na Union tem prioridade/);
});

test("Histórico geral permanece acessível pelo contato e mostra todos os protocolos",()=>{
  const history=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactHistory.tsx");
  const contact=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactDetails.tsx");
  const directory=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactsDialog.tsx");
  const repository=read("src/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository.ts");
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  assert.match(history,/Histórico geral do contato/);
  assert.match(history,/listUnionWhatsAppMessages\(organizationId,conversation\.id,/);
  assert.match(history,/conversation\.channel_id,conversation\.account_phone,null,state\.cursor\)/);
  assert.doesNotMatch(history,/protocolId:/);
  assert.match(history,/UnionWhatsAppProtocolHistory/);
  assert.match(history,/HistoryPager page=\{page\}/);
  assert.match(contact,/UnionWhatsAppContactHistory/);
  assert.match(directory,/UnionWhatsAppContactHistory/);
  assert.match(repository,/findUnionWhatsAppConversationByContact/);
  assert.match(repository,/\.eq\("chat_jid",chatJid\)/);
  assert.match(inbox,/variant="secondary" size="sm" title="Vincular OS deste cliente"/);
  assert.doesNotMatch(inbox,/title="Abrir OS vinculada"/,
    "O atalho OS no cabeçalho da conversa deve ser removido");
  assert.doesNotMatch(inbox,/aria-label="Protocolos do atendimento"/);
  assert.match(directory,/UnionWhatsAppContactHistory/);
});

test("Abrir WhatsApp pela OS ou Cadastros nao cria protocolo antes da primeira mensagem",()=>{
  const modal=read("src/features/whatsapp-channels/presentation/WhatsAppConversationModal.tsx");
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const repository=read("src/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository.ts");
  const edge=read("supabase/functions/union-whatsapp-inbox/index.ts");

  // A OS apenas consulta o cadastro. A tela completa fica em modo rascunho
  // sem nenhum protocolo até o envio explícito da primeira mensagem.
  assert.match(modal,/source\.kind==="order" \? "os_join" : "contact_join"/);
  const draft=read("src/features/whatsapp-channels/presentation/WhatsAppDraftConversation.tsx");
  assert.match(modal,/state\.status === "empty" && state\.canStart \? <WhatsAppDraftConversation/);
  assert.match(draft,/Nenhuma mensagem nesta conversa/);
  assert.match(draft,/aria-label="Mensagem"/);
  assert.match(draft,/onSubmit=\{event => \{ event\.preventDefault\(\); submit\(\); \}\}/);
  assert.doesNotMatch(draft,/operateUnionWhatsAppInbox|startUnionWhatsAppWithFirstMessage/);
  assert.match(draft,/if \(starting \|\| !message\.trim\(\)\) return;/);
  assert.match(draft,/void onSend\(message\.trim\(\)\)/);
  assert.match(modal,/onSend=\{sendFirstMessage\}/);
  assert.doesNotMatch(modal,/onClick=\{startConversation\}|setDrafting\(true\)/);
  assert.match(modal,/const conversationId=await startUnionWhatsAppWithFirstMessage\(/);
  assert.match(modal,/!message\.trim\(\)/);

  // Reabrir uma conversa finalizada na OS tambem requer uma mensagem.
  const finished=inbox.slice(inbox.indexOf("const startNewProtocol = () =>"),
    inbox.indexOf("const sendFinishedFirstMessage = async ()"));
  assert.match(finished,/setDraftingFinished\(true\)/);
  assert.doesNotMatch(finished,/operateUnionWhatsAppInbox/);
  assert.match(inbox,/const conversationId=await startUnionWhatsAppWithFirstMessage\(/);
  assert.match(inbox,/setDraftingFinished\(false\)/);

  // O servidor confirma o envio antes de gravar protocolo ou reabrir conversa.
  const first=edge.slice(edge.indexOf("const firstMessage=typeof body.first_message"),
    edge.indexOf("const {data:created,error:createError}=previouslyKnown"));
  assert.match(first,/providerId=await signedBridge\(/);
  assert.ok(first.indexOf("providerId=await signedBridge(")<
    first.indexOf('upsert({organization_id:org,channel_id:channel.id'));
  assert.match(first,/first_message_sent:true/);
  assert.match(repository,/first_message:text,client_message_id:clientMessageId/);
  assert.doesNotMatch(repository.slice(repository.indexOf("export async function startUnionWhatsAppWithFirstMessage")),
    /,"send_text"/);
});

test("Painel Dados do contato usa chaves distintas e fechamento único sem capturadores órfãos",()=>{
  const drawer=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactDetails.tsx");
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  assert.ok(inbox.includes('key={`contact-details:${selected.id}`}'));
  assert.ok(inbox.includes('key={`crm-menu:${selected.id}`}'));
  assert.doesNotMatch(inbox,/<UnionWhatsApp(?:ContactDetails|CrmMenu) key=\{selected\.id\}/);
  assert.match(drawer,/const requestClose=useCallback/);
  assert.equal((drawer.match(/onClick=\{requestClose\}/g)||[]).length,2);
  assert.match(drawer,/event\.preventDefault\(\)/);
  assert.match(drawer,/event\.stopPropagation\(\)/);
  assert.match(drawer,/className="fixed inset-0 cursor-default bg-transparent"/);
  assert.doesNotMatch(drawer,/closeOnPointer|swallowClick|onOutside|setTimeout|onPointerDown=|event\.detail/);
  assert.doesNotMatch(drawer,/document\.addEventListener\("click"/);
  assert.match(drawer,/window\.addEventListener\("keydown",onKey,true\)/);
  assert.match(drawer,/window\.removeEventListener\("keydown",onKey,true\)/);
  assert.match(drawer,/activeDialog!==drawerRef\.current/);
  assert.match(inbox,/onClose=\{closeContactDetails\}/);
});

test("o handler real fecha em click de mouse ou teclado e consome somente esse evento",async()=>{
  const {transform}=await import("esbuild");
  const source=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactDetails.tsx");
  const start=source.indexOf("  const requestClose=useCallback");
  const snippet=source.slice(start,source.indexOf("  useEffect",start));
  const {code}=await transform(snippet+"\nreturn requestClose;",{loader:"tsx"});
  let closes=0;
  const close=new Function("useCallback","onClose",code)(fn=>fn,()=>closes++);
  for(const detail of [0,1]){
    const event=new Event("click",{cancelable:true,bubbles:true});
    Object.defineProperty(event,"detail",{value:detail});
    close(event);
    assert.equal(event.defaultPrevented,true);
    assert.equal(event.cancelBubble,true);
  }
  assert.equal(closes,2);
});

test("o listener real de Escape limpa dez montagens e respeita outro diálogo ativo",async()=>{
  const {transform}=await import("esbuild");
  const source=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactDetails.tsx");
  const start=source.indexOf('  useEffect(()=>{\n    if(inline||preview)return;');
  assert.ok(start>=0);
  const ending='  },[requestClose,preview,inline]);';
  const snippet=source.slice(start,source.indexOf(ending,start)+ending.length);
  const {code}=await transform(snippet,{loader:"tsx"});
  const listeners=new Set();
  const fakeWindow={
    addEventListener:(type,handler,capture)=>{assert.equal(type,"keydown");assert.equal(capture,true);listeners.add(handler);},
    removeEventListener:(type,handler,capture)=>{assert.equal(type,"keydown");assert.equal(capture,true);listeners.delete(handler);},
  };
  const panel={contains:()=>false};
  class FakeElement { closest(){return {contains:()=>false};} }
  let closes=0;
  for(let i=0;i<10;i++){
    let cleanup;
    new Function("useEffect","inline","preview","drawerRef","window","Element","requestClose",code)(
      fn=>{cleanup=fn();},false,null,{current:panel},fakeWindow,FakeElement,()=>closes++);
    assert.equal(listeners.size,1);
    const handler=[...listeners][0];
    handler({key:"Escape",defaultPrevented:false,target:new FakeElement()});
    assert.equal(closes,i,"outro modal possui seu próprio Escape");
    handler({key:"Escape",defaultPrevented:false,target:null});
    assert.equal(closes,i+1);
    cleanup();
    assert.equal(listeners.size,0);
  }
});

test("Ações Editar e Nova adotam contraste compartilhado em todo CRM escuro",()=>{
  const css=read("src/styles/index.css");
  const admin=read("src/shared/ui/admin/AdminLayout.tsx");
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  assert.match(admin,/data-admin-button-variant=\{variant\}/);
  assert.match(admin,/data-admin-icon-button-variant=\{effectiveVariant\}/);
  assert.match(css, /--border: rgba\(180, 196, 222, 0\.28\)/);
  assert.match(css,/\.admin-crm\.dark button:is\(\[aria-label\^="Editar"\]/);
  assert.match(css,/color: #bac6ff/);
  assert.match(css,/data-admin-button-variant="secondary"/);
  assert.match(inbox,/<AdminButton variant="tertiary" size="sm" aria-label="Nova conversa"/);
  assert.match(inbox,/variant="tertiary" size="sm" title="Editar contato" aria-label="Editar contato"/);
  assert.doesNotMatch(inbox,/border-primary\/25 bg-primary\/10 px-2 text-\[11px\] font-bold text-primary/);
});

test("Dados de cadastro no WhatsApp exibem endereço completo, CPF/CNPJ e CEP mascarados",async()=>{
  const edge=read("supabase/functions/union-whatsapp-inbox/index.ts");
  const contacts=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactsDialog.tsx");
  const menu=read("src/features/whatsapp-channels/presentation/UnionWhatsAppCrmMenu.tsx");
  const formatSource=read("src/features/whatsapp-channels/domain/crm-contact-format.ts");
  const lookupStart=edge.indexOf('if(action==="contacts_crm_match")');
  const lookup=edge.slice(lookupStart,edge.indexOf('if(action==="contacts_list")',lookupStart));
  assert.match(lookup,/permissions\.has\("customers\.view"\)/);
  assert.match(lookup,/\.eq\("organization_id",org\)\.eq\("id",customerId\)/);
  assert.match(lookup,/addresses:customer_addresses\(id,street,number,complement,neighborhood,city,state,zip_code,reference,is_default\)/);
  assert.match(contacts,/addresses\?:CrmContactAddress\[\]\|null/);
  assert.match(contacts,/formatCrmDocument\(crmData\.customer\.cnpj\|\|crmData\.customer\.document\)/);
  assert.match(contacts,/formatCrmFullAddress\(address\)/);
  assert.match(contacts,/orderedCrmAddresses\(crmData\.customer\.addresses\)/);
  assert.match(menu,/formatCrmFullAddress\(address\)/);
  assert.match(menu,/formatCrmDocument\(customer\.cnpj \|\| customer\.document\)/);
  for(const [path,source] of [
    ["UnionWhatsAppContactsDialog.tsx",contacts],
    ["UnionWhatsAppCrmMenu.tsx",menu],
    ["crm-contact-format.ts",formatSource],
  ])assert.ok((await transformWithEsbuild(source,path,{loader:path.endsWith(".tsx")?"tsx":"ts"})).code.length>0);
  // Executar o formatador real usando o módulo de formatação compartilhado.
  const shared=await transformWithEsbuild(read("src/shared/domain/formatters.ts"),"formatters.ts",{loader:"ts"});
  const url="data:text/javascript;base64,"+Buffer.from(shared.code).toString("base64");
  const standalone=formatSource.replace('from "@/shared/domain/formatters"',`from "${url}"`);
  const compiled=await transformWithEsbuild(standalone,"crm-contact-format.ts",{loader:"ts"});
  const formatter=await import("data:text/javascript;base64,"+Buffer.from(compiled.code).toString("base64"));
  assert.equal(formatter.formatCrmDocument("00267077564"),"002.670.775-64");
  assert.equal(formatter.formatCrmDocument("12345678000195"),"12.345.678/0001-95");
  assert.equal(formatter.formatCrmCep("49160442"),"49160-442");
  assert.equal(formatter.formatCrmCep("49160-442"),"49160-442");
  const address={street:"Rua 28",number:"232",neighborhood:"Parque Dos Faróis",
    city:"Nossa Senhora Do Socorro",state:"SE",zip_code:"49160442",is_default:true};
  assert.equal(formatter.formatCrmFullAddress(address),
    "Rua 28, 232 · Parque Dos Faróis · Nossa Senhora Do Socorro - SE · CEP 49160-442");
  assert.equal(formatter.orderedCrmAddresses([
    {id:"secondary",is_default:false},{id:"primary",is_default:true},
  ])[0].id,"primary");
});

test("WhatsApp abre a mesma Nova OS flutuante pela linha Dados do CRM, sem protocolo duplicado",()=>{
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const crm=read("src/features/whatsapp-channels/presentation/UnionWhatsAppCrmMenu.tsx");
  const orderModal=read("src/features/whatsapp-channels/presentation/WhatsAppConversationModal.tsx");
  const orderEditor=read("src/features/orders/presentation/OrderEditorPage.tsx");
  // Mesmo TabOrders com dialogo flutuante usado pela OS, não um formulário paralelo.
  for(const source of [inbox,orderModal])
    assert.match(source,/import\("@\/features\/orders\/presentation\/TabOrders"\)/);
  assert.match(inbox,/const EmbeddedNewOrder = lazy/);
  assert.match(inbox,/initialOrderId="new"/);
  assert.match(inbox,/initialCustomerId=\{newOrder\.customerId\}/);
  assert.match(inbox,/organizationIdOverride=\{newOrder\.organizationId\}/);
  assert.match(inbox,/detailOnly embeddedCreate/);
  assert.match(orderEditor,/draggable floating modal showOverlay=\{false\}/);
  // Match único e autorizado: nenhum CPF/número é inventado quando não há cadastro.
  assert.match(inbox,/operateUnionWhatsAppInbox\(org,threadId,"customer_match",\{customer_id_only:true\}\)/);
  assert.match(inbox,/hasCached && !cached\.ambiguous/);
  assert.match(inbox,/!result\.ambiguous \? result\.matched_customer_id \|\| result\.customer\?\.id \|\| null : null/);
  assert.match(inbox,/const canViewCustomer=hasPermission\("customers\.view"\)/);
  const open=inbox.slice(inbox.indexOf("const openNewOrderFromConversation=()=>{"),inbox.indexOf("  useEffect(()=>{",inbox.indexOf("const openNewOrderFromConversation=()=>{")));
  assert.match(open,/setNewOrder\(\{customerId,customerLookup/);
  assert.doesNotMatch(open,/await import\(/);
  assert.match(inbox,/initialCustomerLookup=\{newOrder\.customerLookup\}/);
  assert.match(inbox,/!embedded && hasPermission\("orders\.create"\)/);
  assert.match(crm,/onNewOrder\?: \(\) => void/);
  assert.match(crm,/aria-label="Nova OS pelo atendimento"/);
  assert.match(crm,/disabled=\{Boolean\(newOrderLoading \|\| newOrderDisabled\)\}/);
  assert.match(inbox,/newOrderDisabled=\{Boolean\(newOrder&&!detachedNewOrder\.detached\)\}/);
  assert.match(inbox,/useEffect\(\(\)=>setNewOrder\(null\),\[activeOrganizationId\]\)/);
  assert.match(crm,/onClick=\{event=>\{event\.stopPropagation\(\);onNewOrder\(\);\}\}/);
  assert.match(crm,/<AdminButton variant="tertiary" size="sm"/);
  assert.doesNotMatch(crm,/flex-1 items-center gap-2 text-left text-xs font-semibold/);
  const rowStart=crm.indexOf('<div ref={menuRef} className="relative">');
  const rowEnd=crm.indexOf('{open && <div id={regionId}',rowStart);
  assert.ok(rowStart>=0 && rowEnd>rowStart,"A linha Dados do CRM deve existir");
  const crmRow=crm.slice(rowStart,rowEnd);
  const caret=crmRow.indexOf('<ChevronDown');
  const newOrder=crmRow.indexOf('aria-label="Nova OS pelo atendimento"');
  const newContact=crmRow.indexOf('{onNewContact && <AdminButton');
  assert.ok(caret>=0 && newOrder>caret && newContact>newOrder,
    "Nova OS deve ficar após a seta e Novo contato após Nova OS");
  assert.match(crmRow,/flex min-w-0 flex-wrap items-center gap-2/);
  assert.match(crmRow.slice(newContact),/Novo contato/);
  assert.doesNotMatch(inbox,/aria-label="Protocolos do atendimento"/);
  assert.match(inbox,/UnionWhatsAppContactsDialog/);
});

// Execute the actual count-refresh callback with deferred RPCs, without a browser
// or production connection. The refs remain shared across account transitions.
function countRefreshHarness(){
  const provider=read("src/features/whatsapp-channels/presentation/UnionWhatsAppActivityProvider.tsx");
  const body=provider.match(/const refreshCounts=useCallback\(async\(force=false\)=>\{([\s\S]*?)\n  \},\[enabled,organizationId,channelId,channelPhone,accountKey,user\?\.id\]\);/)[1];
  const refs={
    disposedRef:{current:false},currentAccountRef:{current:"A"},
    countsInFlightRef:{current:null},countsScopeRef:{current:""},
    lastCountsRef:{current:0},countsRetryAfterRef:{current:0},
  };
  const pending=[],results=[];
  const listUnionWhatsAppConversationCounts=(...args)=>new Promise((resolve,reject)=>pending.push({args,resolve,reject}));
  const create=new Function("env",`const {user,enabled,organizationId,channelId,channelPhone,accountKey,disposedRef,currentAccountRef,countsInFlightRef,countsScopeRef,lastCountsRef,countsRetryAfterRef,listUnionWhatsAppConversationCounts,setCounts}=env; return async(force=false)=>{${body}};`);
  const forAccount=accountKey=>{
    refs.currentAccountRef.current=accountKey;
    return create({...refs,user:{id:"viewer"},enabled:true,organizationId:accountKey,channelId:"channel",channelPhone:"phone",accountKey,listUnionWhatsAppConversationCounts,setCounts:value=>results.push(value)});
  };
  return {refs,pending,results,forAccount};
}

test("Count refresh starts the new account immediately while the previous account RPC is pending",async()=>{
  const h=countRefreshHarness();
  const first=h.forAccount("A")(true);
  const second=h.forAccount("B")(true);
  assert.equal(h.pending.length,2);
  h.pending[0].resolve({total:10});h.pending[1].resolve({total:20});
  await Promise.all([first,second]);
  assert.deepEqual(h.results,[{total:20}]);
});

test("An obsolete tenant request cannot unlock a newer count request",async()=>{
  const h=countRefreshHarness();
  const first=h.forAccount("A")(true);
  // Match the provider's tenant-reset effect before its new channel resolves.
  h.refs.countsInFlightRef.current=null;
  h.refs.lastCountsRef.current=0;h.refs.countsRetryAfterRef.current=0;
  const refresh=h.forAccount("B");
  const second=refresh(true);
  h.pending[0].resolve({total:10});await first;
  const duplicate=refresh(true);
  assert.equal(h.pending.length,2,"only one RPC may run for the current account");
  await duplicate;
  h.pending[1].resolve({total:20});await second;
});

test("An obsolete count failure cannot put the current account into backoff",async()=>{
  const h=countRefreshHarness();
  const first=h.forAccount("A")(true);
  h.refs.countsInFlightRef.current=null;
  const refresh=h.forAccount("B");
  const second=refresh(true);
  h.pending[1].resolve({total:20});await second;
  h.pending[0].reject(new Error("old request failed"));await first;
  const third=refresh(true);
  assert.equal(h.pending.length,3);
  h.pending[2].resolve({total:21});await third;
});

test("Count refresh preserves current-account throttle and failure backoff",async()=>{
  const h=countRefreshHarness(),refresh=h.forAccount("A");
  const first=refresh(true);
  await refresh(true);assert.equal(h.pending.length,1);
  h.pending[0].resolve({total:1});await first;
  await refresh();assert.equal(h.pending.length,1);
  const forced=refresh(true);assert.equal(h.pending.length,2);
  h.pending[1].reject(new Error("current request failed"));await forced;
  await refresh(true);assert.equal(h.pending.length,2);
});

test("The activity provider leaves initial counts to the visible full inbox",()=>{
  const provider=read("src/features/whatsapp-channels/presentation/UnionWhatsAppActivityProvider.tsx");
  const effect=provider.match(/useEffect\(\(\)=>\{\n    if\(!channelId\|\|!channelPhone\|\|!enabled[^\n]*\n    void refreshCounts\(true\);\n  \},\[channelId,channelPhone,enabled,refreshCounts\]\);/)[0];
  let requests=0;
  const run=new Function("pageOpenRef","channelId","channelPhone","enabled","refreshCounts","useEffect",effect);
  for(const pageOpen of [true,false]){
    run({current:pageOpen},"channel","phone",true,()=>{requests++;},callback=>callback());
    assert.equal(requests,pageOpen?0:1);
  }
});


test("A OS abre um chat completo de rascunho e só inicia após o primeiro envio confirmado", () => {
  const draft = read("src/features/whatsapp-channels/presentation/WhatsAppDraftConversation.tsx");
  const repository = read("src/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository.ts");
  assert.match(modal, /state\.status === "empty" && state\.canStart \? <WhatsAppDraftConversation/);
  assert.match(modal, /onSend=\{sendFirstMessage\}/);
  assert.doesNotMatch(modal, /<label[^>]*>Primeira mensagem<\/label>|onClick=\{startConversation\}/);
  assert.match(draft, /Nenhuma mensagem nesta conversa/);
  assert.match(draft, /aria-label="Mensagem"/);
  assert.match(draft, /aria-label="Selecionar emoji"/);
  assert.match(draft, /Mensagens rápidas/);
  assert.match(draft, /onSubmit=\{event => \{ event\.preventDefault\(\); submit\(\); \}\}/);
  assert.match(modal, /startUnionWhatsAppWithFirstMessage\(/);
  assert.match(modal, /const firstSendIdRef = useRef/);
  assert.match(repository, /client_message_id:clientMessageId/);
  const start = edge.slice(edge.indexOf('if(action==="start")'));
  assert.match(start, /const firstMessage=typeof body\.first_message==="string"/);
  assert.match(start, /providerId=await signedBridge/);
  assert.match(start, /first_message_sent:true/);
});

function receiptUpdateHarness(){
  const webhook=read("supabase/functions/union-whatsapp-webhook/index.ts");
  const start=webhook.indexOf('let query = admin.from("union_whatsapp_messages")');
  const end=webhook.indexOf('if(receiptError) throw receiptError;',start);
  assert.ok(start>=0 && end>start,"execute the real receipt UPDATE block");
  const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
  const apply=new AsyncFunction("admin","channel","channelId","accountPhone","receiptThread","uniqueIds","state",
    webhook.slice(start,end+'if(receiptError) throw receiptError;'.length));
  const scope={organization_id:"org",channel_id:"channel",account_phone:"phone",conversation_id:"thread",direction:"outgoing"};
  const rows=[null,"sent","delivered","read"].map((delivery_status,index)=>({
    ...scope,provider_message_id:"batch-"+index,delivery_status,
  }));
  for(const [field,value] of Object.entries({organization_id:"other-org",channel_id:"other-channel",account_phone:"other-phone",conversation_id:"other-thread",direction:"incoming"})){
    rows.push({...scope,[field]:value,provider_message_id:"excluded-"+field,delivery_status:"sent"});
  }
  rows.push({...scope,provider_message_id:"outside-batch",delivery_status:"sent"});
  const writes=[];
  const admin={from(table){
    assert.equal(table,"union_whatsapp_messages");
    const filters=[];
    let patch;
    const query={
      update(value){patch=value;return query;},
      eq(column,value){filters.push(row=>row[column]===value);return query;},
      // SQL comparisons exclude NULL; treating null !== value as SQL true
      // would hide the original nullable-status bug.
      neq(column,value){filters.push(row=>row[column]!==null && row[column]!==value);return query;},
      in(column,values){filters.push(row=>values.includes(row[column]));return query;},
      or(expression){
        const match=/^delivery_status\.is\.null,delivery_status\.in\.\(([^)]+)\)$/.exec(expression);
        assert.ok(match,"status alternatives must be one server-side NULL-or-IN predicate");
        const accepted=match[1].split(",");
        filters.push(row=>row.delivery_status===null || accepted.includes(row.delivery_status));
        return query;
      },
      then(resolve,reject){
        // Evaluate filters at UPDATE execution, as a database does after
        // locking a row, rather than taking a stale preliminary snapshot.
        for(const row of rows)if(filters.every(matches=>matches(row))){
          writes.push(row.provider_message_id);Object.assign(row,patch);
        }
        return Promise.resolve({error:null}).then(resolve,reject);
      },
    };
    return query;
  }};
  const ids=rows.filter(row=>row.provider_message_id!=="outside-batch").map(row=>row.provider_message_id);
  const run=state=>apply(admin,{organization_id:"org"},"channel","phone",{id:"thread"},ids,state);
  return {rows,writes,run};
}

test("Delivered receipt updates nullable/sent batch rows once and preserves every tenant boundary",async()=>{
  const h=receiptUpdateHarness();
  await h.run("delivered");
  assert.deepEqual(h.rows.slice(0,4).map(row=>row.delivery_status),["delivered","delivered","delivered","read"]);
  assert.deepEqual(h.writes,["batch-0","batch-1"]);
  await h.run("delivered");
  assert.deepEqual(h.writes,["batch-0","batch-1"],"receipt replay must perform no further writes");
  assert.ok(h.rows.slice(4).every(row=>row.delivery_status==="sent"));
});

test("Read receipt advances nullable/sent/delivered rows once, including concurrent replay",async()=>{
  const h=receiptUpdateHarness();
  await Promise.all([h.run("read"),h.run("read")]);
  assert.deepEqual(h.writes,["batch-0","batch-1","batch-2"]);
  assert.ok(h.rows.slice(0,4).every(row=>row.delivery_status==="read"));
  await h.run("read");await h.run("delivered");
  assert.deepEqual(h.writes,["batch-0","batch-1","batch-2"],"replays and delayed delivery cannot downgrade read");
  assert.ok(h.rows.slice(4).every(row=>row.delivery_status==="sent"));
});


test("Verificação de WhatsApp exibe selo dentro do campo e só mostra perfil abaixo quando disponível", () => {
  const ui = read("src/features/whatsapp-channels/presentation/WhatsAppNumberVerification.tsx");
  const field = read("src/shared/ui/admin/AdminFormControls.tsx");
  assert.match(ui,/export function VerifiedWhatsAppPhoneInput/);
  assert.match(ui,/<FPhoneInput \{\.\.\.inputProps\} value=\{value\} statusAccessory=\{inlineStatus\}/);
  assert.match(field,/rightActionWide/);
  assert.match(field,/statusAccessory/);
  assert.match(field,/pr-\[194px\]/);
  assert.match(ui,/WhatsApp confirmado/);
  assert.match(ui,/Não encontrado/);
  assert.match(ui,/const showProfile = result\?\.kind === "registered" && Boolean\(result\.name \|\| result\.avatar\)/);
  assert.match(ui,/\{showProfile && result\?\.kind === "registered"/);
  assert.doesNotMatch(ui,/Número confirmado no WhatsApp<\/span>/);
  for(const path of [
    "src/features/orders/presentation/QuickCustomerModal.tsx",
    "src/features/customers/presentation/CreateCustomerPage.tsx",
    "src/features/orders/presentation/OrderCustomerSection.tsx",
    "src/features/registrations/presentation/RegistrationEditor.tsx",
  ]) {
    const form = read(path);
    assert.match(form,/<VerifiedWhatsAppPhoneInput (?:verificationMode=\{creating \? "create" : "edit"\} |verificationMode="edit" )?label="WhatsApp"/);
    assert.doesNotMatch(form,/<WhatsAppNumberVerification phone=/);
  }
});


test("Permissões de contatos e botão Novo não bloqueiam abertura pela OS",()=>{
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const contacts=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactsDialog.tsx");
  const migration=read("supabase/migrations/20261118154500_union_whatsapp_contact_action_permissions.sql");
  assert.match(edge,/start_new_conversation:\[false,true\]/);
  assert.match(edge,/create_contacts:\[true,true\]/);
  assert.match(edge,/const requiredCapability=action==="contacts_save"/);
  assert.match(edge,/\? "create_contacts"/);
  assert.match(edge,/action==="start" && typeof body\.first_message!=="string"/);
  assert.match(edge,/\? "start_new_conversation" : required\[action\]/);
  assert.match(edge,/const numberCheckAllowed=\(action==="check_number" \|\| action==="number_verification_status"\) &&/);
  assert.match(inbox,/canAction\("start_new_conversation"\) && <AdminButton variant="tertiary" size="sm" aria-label="Nova conversa"/);
  assert.match(inbox,/!canAction\("start_new_conversation"\) \|\| !contact\.contact_phone/);
  assert.match(inbox,/canCreate=\{canAction\("create_contacts"\)\}/);
  assert.match(inbox,/canEdit=\{canAction\("manage_contacts"\)\}/);
  assert.match(contacts,/\{canCreate && <button type="button" aria-label="Adicionar contato"/);
  assert.match(contacts,/\(creating \? canCreate : canEdit\)/);
  assert.match(migration,/'create_contacts','Criar contatos'/);
  assert.match(migration,/'start_new_conversation','Iniciar conversa pelo botão Novo'/);
  assert.match(migration,/set label='Editar contatos'/);
  assert.match(migration,/set label='Iniciar atendimentos pela OS e Cadastros'/);
  assert.match(modal,/startUnionWhatsAppWithFirstMessage/);
  assert.match(edge,/can_start:!selectedLinkedConversation&&allowed\("start"\)/);
});


test("Gestor + Operador possui matriz independente no UI, servidor e RLS",()=>{
  const ui=read("src/features/whatsapp-channels/presentation/WhatsAppRolePermissions.tsx");
  const migration=read("supabase/migrations/20261118160000_whatsapp_independent_combined_role.sql");
  assert.match(ui,/type Role = "manager" \| "operator" \| "both"/);
  assert.match(ui,/const roles: Role\[\] = \["manager", "operator", "both"\]/);
  assert.match(ui,/initial\.both\[item\.key\] = item\.both/);
  assert.match(ui,/both: rows\.filter/);
  assert.match(ui,/const selected = \(key: string\) => Boolean\(draft\[profile\]\[key\]\)/);
  assert.match(ui,/onClick=\{\(\) => toggle\(profile,item\.key,!selected\(item\.key\)\)\}/);
  assert.doesNotMatch(ui,/draft\.manager\[key\] \|\| draft\.operator\[key\]/);
  assert.doesNotMatch(ui,/profile === "both" \|\| profile !== "both"/);
  assert.match(edge,/return roleAllowed\(staffRole,capability\)/);
  assert.match(edge,/if\(role!=="manager" && role!=="operator" && role!=="both"\)/);
  assert.match(edge,/both:savedOverrides\.get\("both:"\+def\.key\)/);
  assert.match(edge,/const selfCanStillManage=Boolean\(staffRole && proposedManagement\(staffRole\)\)/);
  assert.match(migration,/check \(staff_role in \('manager','operator','both'\)\)/);
  assert.match(migration,/on conflict \(organization_id,staff_role,capability\) do nothing/);
  assert.match(migration,/b\.staff_role='both' and coalesce\(combo\.enabled/);
  assert.doesNotMatch(migration,/b\.staff_role in \('manager','both'\)/);
});


test("CRM WhatsApp verification persists by organization and number without rechecking an edited record",()=>{
  const ui=read("src/features/whatsapp-channels/presentation/WhatsAppNumberVerification.tsx");
  const reg=read("src/features/registrations/presentation/RegistrationEditor.tsx");
  const order=read("src/features/orders/presentation/OrderCustomerSection.tsx");
  const detail=read("src/features/customers/presentation/CustomerDetailsPage.tsx");
  const migration=read("supabase/migrations/20261118174500_whatsapp_crm_number_verification.sql");
  assert.match(edge,/if\(action==="number_verification_status"\)/);
  assert.match(edge,/"union_whatsapp_crm_number_verifications"/);
  assert.match(edge,/\.upsert\(\{organization_id:org,phone_e164:inputE164/);
  assert.match(edge,/phone_e164:inputE164/);
  assert.match(edge,/\.eq\("organization_id",org\)\.eq\("phone_e164",phone\)/);
  assert.match(ui,/verificationMode = "create"/);
  assert.match(ui,/if \(verificationMode === "create"\)/);
  assert.match(ui,/"number_verification_status"/);
  assert.match(ui,/onClick=\{verifyManually\}/);
  assert.match(ui,/WhatsApp confirmado/);
  assert.match(ui,/if \(requestVersion\.current !== version \|\| currentKey\.current !== key\) return/);
  assert.match(reg,/verificationMode=\{creating \? "create" : "edit"\}/);
  assert.match(order,/verificationMode="edit"/);
  assert.match(detail,/VerifiedWhatsAppPhoneInput verificationMode="edit"/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all on public\.union_whatsapp_crm_number_verifications from anon,authenticated/);
});


test("OS usa somente o cabeçalho da conversa e mostra Trocar número apenas para múltiplos destinos",()=>{
  const modal=read("src/features/whatsapp-channels/presentation/WhatsAppConversationModal.tsx");
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  assert.match(modal,/if\(recipients\.length>1\)set\(\{status:"choosing",recipients\}\)/);
  assert.match(modal,/else if\(recipients\.length===1\)void chooseOrderRecipient\(recipients\[0\]\)/);
  assert.doesNotMatch(modal,/\{source\.kind==="order" && chosenRecipient && <div className="flex shrink-0 items-center gap-3/);
  assert.match(modal,/onChangeRecipient=\{source\.kind==="order" && orderRecipients\.length>1/);
  assert.match(inbox,/\{embedded && onChangeRecipient && <AdminButton variant="secondary"/);
  assert.match(inbox,/title="Escolher outro número desta OS"/);
});

test("nome editado na Union precede CRM e WhatsApp em contatos e conversas",()=>{
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const contacts=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactsDialog.tsx");
  const sql=read("supabase/migrations/20261118185000_union_whatsapp_crm_name_priority.sql");
  assert.match(edge,/if\(action==="contact_names_batch"\)/);
  assert.match(edge,/const names=await crmNamesFor\(visible\.map\(row=>row\.contact_phone\)\)/);
  assert.match(edge,/const finalName=String\(known\?\.display_name \|\|/);
  assert.match(edge,/names\.get\(contactPhoneKey\(row\.contact_phone\)\)/);
  assert.match(edge,/crm_name:crm\.get\(contactPhoneKey\(row\.contact_phone\)\)/);
  assert.match(contacts,/contact\.display_name \|\| contact\.crm_name \|\| contact\.device_name/);
  assert.match(inbox,/"contact_names_batch"/);
  assert.match(inbox,/contactNameCacheRef/);
  assert.match(edge,/const preferredName=knownContact\?\.display_name \|\| crmName \|\|/);
  assert.match(edge,/knownContact\?\.profile_name \|\| verified\.verified_name \|\| customerName/);
  assert.doesNotMatch(edge,/persistManualName/);
  assert.match(edge,/const authoritative=String\(known\?\.display_name \|\| crmName/);
  assert.match(sql,/having count\(distinct b\.id\)=1/);
  assert.match(sql,/revoke all on function public\.union_whatsapp_crm_names_batch/);
});


test("Abas usam cache curto, Não lidas consulta todas as páginas e não fecha a conversa",()=>{
  const ui=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const repo=read("src/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository.ts");
  assert.match(repo,/UnionWhatsAppInboxFilter=.*"unread"/);
  assert.match(repo,/if\(options\.filter==="unread"\)\{/);
  assert.match(repo,/query=query\.gt\("unread_count",0\)/);
  assert.match(repo,/\.range\(page\*pageSize,\(page\+1\)\*pageSize\)/);
  assert.match(ui,/Ver todas as conversas não lidas/);
  assert.match(ui,/conversationPageCacheRef/);
  assert.match(ui,/Date\.now\(\)-cached\.savedAt<45_000/);
  assert.match(ui,/conversationPageCacheRef\.current\.clear\(\)/);
  assert.match(ui,/if\(selectedFallback\?\.id===selectedId\)return/);
  assert.match(ui,/if\(selectedInPage\)setSelectedFallback\(selectedInPage\)/);
  assert.match(ui,/setSelectedFallback\(item\);setSelectedId\(item\.id\)/);
  assert.doesNotMatch(ui,/setSelectedId\(null\);setConversationPage\(0\);setFilter\(item\.value\)/);
  assert.doesNotMatch(ui,/setSelectedId\(null\);setConversationPage\(p=>p\+1\)/);
});


test("OS pode destacar Atendimento WhatsApp sem criar novo protocolo ou expor telefone na URL",()=>{
  const modal=read("src/features/whatsapp-channels/presentation/WhatsAppConversationModal.tsx");
  const popout=read("src/features/whatsapp-channels/presentation/DetachedWhatsAppOrderPage.tsx");
  const app=read("src/app/App.tsx");
  const manager=read("src/features/whatsapp-channels/presentation/DetachedWhatsAppWindowManager.ts");
  assert.match(modal,/const canDetach=source\.kind==="order"/);
  assert.match(modal,/window\.open\(detachedWhatsAppOrderUrl\(context\)/);
  assert.match(manager,/admin\/whatsapp-destacado/);
  assert.match(modal,/aria-label="Destacar janela"/);
  assert.match(modal,/data-whatsapp-detached-order=\{orderId\}/);
  assert.match(modal,/onReintegrate\(chosenRecipient\)/);
  assert.match(popout,/UnionWhatsAppActivityProvider/);
  assert.match(popout,/WhatsAppConversationModal/);
  assert.match(app,/detachedOrderMatch=location\.pathname\.match/);
  assert.match(app,/DetachedWhatsAppOrderPage/);
  assert.match(app,/if \(activeOrganization && accessWindow && !accessWindow\.allowed\)/);
});

test("Janela destacada preserva os documentos da OS e reanexa pelo evento validado",()=>{
  const modal=read("src/features/whatsapp-channels/presentation/WhatsAppConversationModal.tsx");
  const manager=read("src/features/whatsapp-channels/presentation/DetachedWhatsAppWindowManager.ts");
  const popout=read("src/features/whatsapp-channels/presentation/DetachedWhatsAppOrderPage.tsx");
  assert.match(manager,/event\.origin!==window\.location\.origin/);
  assert.match(manager,/event\.source!==current\.popup/);
  assert.match(manager,/union-whatsapp-detached-document/);
  assert.match(manager,/context\.source\.documentOptions\?\.some/);
  assert.match(manager,/context\.source\.prepareDocument\(message\.templateId\)/);
  assert.match(manager,/window\.dispatchEvent\(new CustomEvent\(REATTACH_EVENT/);
  assert.match(popout,/event\.source!==opener/);
  assert.match(popout,/onReintegrate=\{reintegrate\}/);
  assert.match(popout,/prepareDocument:documentOptions\.length>0\?prepareDocument:undefined/);
});


test("Janela WhatsApp destacada aplica o layout desktop do compositor em 768px sem mudar o mobile",()=>{
  const modal=read("src/features/whatsapp-channels/presentation/WhatsAppConversationModal.tsx");
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const detached=read("src/features/whatsapp-channels/presentation/DetachedWhatsAppOrderPage.tsx");
  assert.match(modal,/detachedWindow=\{detached\}/);
  assert.match(inbox,/detachedWindow = false/);
  assert.match(inbox,/detachedWindow \? "md:flex-nowrap" : ""/);
  assert.match(inbox,/detachedWindow \? "md:hidden" : ""/);
  assert.match(inbox,/detachedWindow \? "md:order-none md:text-sm" : ""/);
  assert.match(inbox,/detachedWindow \? "md:order-none" : ""/);
  assert.match(detached,/unionworld\.admin\.theme/);
  assert.match(detached,/window\.addEventListener\("storage",update\)/);
  assert.match(detached,/document\.documentElement\.classList\.toggle\("dark",darkTheme\)/);
});


test("WhatsApp da nova OS reutiliza a mesma janela destacada sem abrir vários pop-ups",()=>{
  const modal=read("src/features/whatsapp-channels/presentation/WhatsAppConversationModal.tsx");
  const manager=read("src/features/whatsapp-channels/presentation/DetachedWhatsAppWindowManager.ts");
  const popup=read("src/features/whatsapp-channels/presentation/DetachedWhatsAppOrderPage.tsx");
  assert.match(modal,/reuseDetachedWhatsAppWindow\(next\)/);
  assert.match(modal,/registerDetachedWhatsAppWindow\(popup,context\)/);
  assert.match(modal,/detachedWhatsAppPopupName\(\)/);
  assert.match(modal,/resizable=no/);
  assert.match(manager,/let session:Session\|null=null/);
  assert.match(manager,/const popupName="union_whatsapp_detached_"/);
  assert.match(manager,/current\.context=context/);
  assert.match(manager,/union-whatsapp-detached-switch/);
  assert.match(manager,/current\.popup\.focus\(\)/);
  assert.match(manager,/if\(session\.popup\.closed\)/);
  assert.match(popup,/message\.type==="union-whatsapp-detached-switch"/);
  assert.match(popup,/setCurrentOrderId\(nextId\)/);
  assert.match(popup,/window\.history\.replaceState/);
  assert.match(popup,/key=\{currentOrderId\}/);
  assert.match(manager,/message\.type==="union-whatsapp-detached-document"/);
  assert.match(manager,/message\.type==="union-whatsapp-detached-reintegrate"/);
});

test("Permissao propria de grupos, fotos privadas e wallpaper sem sobreposicao escura",()=>{
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const groups=read("src/features/whatsapp-channels/presentation/UnionWhatsAppGroupsInbox.tsx");
  const chat=read("src/features/whatsapp-channels/presentation/UnionWhatsAppGroupChat.tsx");
  const avatar=read("src/features/whatsapp-channels/presentation/UnionWhatsAppGroupAvatar.tsx");
  const edge=read("supabase/functions/union-whatsapp-inbox/index.ts");
  assert.match(inbox,/canAction\("manage_groups"\)/);
  assert.match(edge,/contacts_groups:"manage_groups"/);
  assert.match(groups,/aria-modal="false"/);
  assert.doesNotMatch(groups,/bg-black\/35/);
  assert.doesNotMatch(groups,/aria-label="Atualizar grupos"/);
  assert.match(chat,/whatsapp-chat-pattern\.svg/);
  assert.match(avatar,/contacts_groups_avatar/);
});

test("Contatos tem um unico fluxo e abre a conversa global fora do filtro e pagina",()=>{
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const contacts=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactsDialog.tsx");
  const groupChat=read("src/features/whatsapp-channels/presentation/UnionWhatsAppGroupChat.tsx");
  assert.doesNotMatch(contacts,/setTab\("groups"\)|setGroupsLoading|groups\.filter/);
  assert.match(contacts,/animate-spin text-primary/);
  assert.match(contacts,/openingConversation/);
  assert.match(inbox,/await findUnionWhatsAppConversationByContact/);
  assert.match(inbox,/setSelectedFallback\(existing\)/);
  assert.match(inbox,/setProtocolFilter\(null\)/);
  assert.match(inbox,/setConversationPage\(0\)/);
  assert.doesNotMatch(groupChat,/group_command:"history"|history_available|setInterval/);
});

test("WhatsApp multiline cresce o compositor para cima e reduz somente o historico visivel",()=>{
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  assert.match(inbox,/min-h-0 min-w-0 flex-col overflow-hidden bg-card/);
  assert.match(inbox,/relative min-h-0 flex-1 overflow-hidden/);
  assert.match(inbox,/relative z-30 shrink-0 border-t border-border bg-card/);
  assert.match(inbox,/relative flex min-w-0 flex-wrap items-end rounded-xl/);
  assert.match(inbox,/min-h-12 max-h-\[132px\].*self-end resize-none overflow-y-auto/);
  assert.match(inbox,/field\.style\.height=Math\.min\(Math\.max\(field\.scrollHeight,48\),132\)/);
  assert.match(inbox,/observer\.observe\(box\)/);
});

test("Fila WhatsApp mantem o tempo original ao assumir/devolver e reinicia somente em novo ciclo",()=>{
  const migration=read("supabase/migrations/20261119141000_union_whatsapp_preserve_queue_cycle.sql");
  const original=read("supabase/migrations/20261021184500_union_whatsapp_queue_wait_times.sql");
  const repository=read("src/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository.ts");
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  assert.match(original,/queue_entered_at.*now\(\)/);
  assert.match(migration,/if new.status='in_att' then[\s\S]*?new.queue_entered_at:=old.queue_entered_at/);
  assert.match(migration,/when old.status='in_att' then coalesce\(old.queue_entered_at,now\(\)\)/);
  assert.match(migration,/else now\(\)[\s\S]*?end;/);
  assert.match(migration,/h.action='assume'/);
  assert.match(migration,/h.created_at>=p.opened_at/);
  assert.match(repository,/options.filter==="waiting" && !options.sortByRecent\?"queue_entered_at"/);
  assert.match(inbox,/waitingMinutes\(item.queue_entered_at\|\|item.created_at,clockNow\)/);
});

test("Marcadores de inicio/fim surgem no chat somente quando ha mais de um atendimento",()=>{
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const repository=read("src/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository.ts");
  assert.match(repository,/export async function listUnionWhatsAppProtocolMarkers/);
  assert.match(repository,/select\("id,protocol_number,opened_at,closed_at"\)/);
  assert.match(repository,/\.eq\("organization_id",organizationId\)\.eq\("channel_id",channelId\)/);
  assert.match(repository,/\.eq\("account_phone",accountPhone\)\.eq\("conversation_id",conversationId\)/);
  assert.match(inbox,/chatProtocolMarkers\.items\.length<2\|\|!timeline\.length/);
  assert.match(inbox,/if\(protocolFilter\|\|chatProtocolMarkers\?\.scope!==scope/);
  assert.match(inbox,/chatTimeline\.map\(\(entry,index\) =>/);
  assert.match(inbox,/chatDayKey\(chatTimeline\[index-1\]\.sentAt\)/);
  assert.match(inbox,/entry\.kind==="protocol_start" \|\| entry\.kind==="protocol_end"/);
  assert.match(inbox,/Atendimento \{entry\.kind==="protocol_start"\?"iniciado":"finalizado"\}/);
  assert.match(inbox,/role="note"/);
});

test("Atendimento finalizado nao volta para Aguardando sem primeira mensagem",()=>{
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const edge=read("supabase/functions/union-whatsapp-inbox/index.ts");
  const repository=read("src/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository.ts");
  // Botão manual exibe o rascunho, sem chamada que recria o protocolo vazio.
  assert.doesNotMatch(inbox,/onClick=\{\(\) => void operate\("reopen"\)\}/);
  assert.match(inbox,/canAction\("reopen"\) && canAction\("start"\) && selected\.contact_phone && !draftingFinished/);
  assert.match(inbox,/onClick=\{startNewProtocol\}>/);
  assert.match(inbox,/selected\.status==="finished" && draftingFinished \? <form/);
  assert.match(inbox,/if\(!selected \|\| selected\.status!=="finished"/);
  assert.match(inbox,/await startUnionWhatsAppWithFirstMessage\(/);
  assert.match(repository,/if\(!text\)throw new Error\("Digite a primeira mensagem antes de iniciar o atendimento\."/);
  // Além da UI, chamadas antigas da API devem ser rejeitadas antes de alterar o status.
  assert.match(edge,/if\(action==="reopen"\) \{\s*return json\(\{success:false,code:"first_message_required"/);
  assert.match(edge,/if\(typeof body\.first_message!=="string" \|\| !body\.first_message\.trim\(\)\)/);
});
import './whatsapp-unanswered-refresh.test.mjs';
import './whatsapp-counts-session.test.mjs';


test("OS and CRM share active additional registration contacts with scoped identities", async () => {
  const repo = read("src/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository.ts");
  const menu = read("src/features/whatsapp-channels/presentation/UnionWhatsAppCrmMenu.tsx");
  const inbox = read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const form = read("src/features/whatsapp-channels/presentation/CrmAdditionalContactDialog.tsx");
  const registrations = read("src/features/registrations/presentation/RegistrationContactsPage.tsx");
  const lookup = read("supabase/migrations/20261124120000_union_whatsapp_registration_contact_lookup.sql");
  assert.match(edge, /recipients.push\(\{kind:"registered",field,entity_contact_id:contact.id/);
  assert.match(join, /\.eq\("legacy_customer_id",order.customer_id\)/);
  assert.match(join, /\.eq\("id",additionalId\)\.eq\("is_active",true\)/);
  assert.match(join, /registrations.contacts.view/);
  assert.match(modal, /entity_contact_id:recipient.entity_contact_id/);
  assert.match(repo, /entity_contact_id\?:string/);
  assert.match(menu, /Nova OS[\s\S]*?onNewContact[\s\S]*?Novo contato/);
  assert.match(inbox, /operateUnionWhatsAppInbox\(org,threadId,"customer_match",\{contact_owner_only:true\}\)/);
  assert.match(inbox, /onNewContact=\{hasPermission\("registrations.contacts.manage"\) && canAction\("create_contacts"\)/);
  assert.match(form, /<VerifiedWhatsAppPhoneInput/);
  assert.match(form, /"crm_contact_save"/);
  assert.match(edge, /admin.rpc\("union_whatsapp_create_registration_contact"/);
  assert.match(lookup, /insert into public.entity_contacts/);
  assert.match(lookup, /insert into public.union_whatsapp_contacts/);
  assert.match(lookup, /on conflict\(channel_id,account_phone,chat_jid\) do nothing/);
  assert.match(form, /queryKeys.registrations.contacts\(organizationId, owner.id\)/);
  assert.match(registrations, /<VerifiedWhatsAppPhoneInput verificationMode=\{editing \? "edit" : "create"\}/);
  assert.match(lookup, /additional_matches as/);
  assert.match(lookup, /ec.organization_id=p_organization and ec.is_active/);
  assert.match(lookup, /e.legacy_customer_id/);
  assert.match(lookup, /limit 2;/);
  for (const [name, code] of [["CrmAdditionalContactDialog", form], ["UnionWhatsAppCrmMenu", menu], ["UnionWhatsAppInboxPage", inbox], ["WhatsAppConversationModal", modal]]) {
    assert.ok((await transformWithEsbuild(code,name+".tsx",{loader:"tsx"})).code,name);
  }
});


test("Novo contato abre imediatamente e consulta somente o cadastro necessario", async () => {
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const dialog=read("src/features/whatsapp-channels/presentation/CrmAdditionalContactDialog.tsx");
  const verification=read("src/features/whatsapp-channels/presentation/WhatsAppNumberVerification.tsx");
  // Bound the assertion to this handler, irrespective of the next handler's name or async modifier.
  const match=inbox.match(/^  const openNewContactFromConversation=\(\)=>\{\r?\n([\s\S]*?)^  \};[ \t]*\r?$/m);
  assert.ok(match,"O handler de Novo contato deve existir e terminar antes das outras funções.");
  const open=match[1];
  assert.ok(open.length>0);
  assert.doesNotMatch(open,/\bawait\b|operateUnionWhatsAppInbox/);
  assert.ok(open.indexOf("setNewContact({owner:null")>=0);
  assert.ok(open.indexOf("setNewContact({owner:null")<open.indexOf("void resolveNewContactOwner"));
  assert.match(open,/contactOpenRef.current/);
  assert.match(inbox,/staleTime:30_000,gcTime:120_000,retry:false/);
  assert.match(inbox,/queryKey:contactOwnerKey\(org,threadId\)/);
  assert.match(inbox,/contactLaunch.current!==launch \|\| organizationRef.current!==org \|\| selectedIdRef.current!==threadId/);
  assert.match(inbox,/key=\{newContact.launch\}/);
  assert.match(dialog,/Boolean\(owner\) && !ownerLoading && !ownerError/);
  assert.match(dialog,/verificationEnabled=\{Boolean\(owner\) && !ownerLoading && !ownerError\}/);
  assert.match(verification,/const canVerify = verificationEnabled &&/);
  const ownerBranch=edge.slice(edge.indexOf("if(contactOwnerOnly){"),edge.indexOf("// These details are requested only after expanding"));
  assert.match(ownerBranch,/\.select\("id,name"\)/);
  assert.match(ownerBranch,/return json\(\{success:true,contact_owner:owner\|\|null,ambiguous:false\}\)/);
  assert.doesNotMatch(ownerBranch,/customer_equipments|customer_addresses|service_orders/);
  assert.match(edge,/if\(\(\(!contactOwnerOnly && !customerIdOnly\) \|\| matches.length===0\) && permissions.has\("orders.details.view"\)\)/);
  for(const [name,source] of [["UnionWhatsAppInboxPage",inbox],["CrmAdditionalContactDialog",dialog],["WhatsAppNumberVerification",verification]]) {
    assert.ok((await transformWithEsbuild(source,name+".tsx",{loader:"tsx"})).code,name);
  }
});


test("Nova OS can minimize and detach without remounting the order controller",async()=>{
  const tab=read("src/features/orders/presentation/TabOrders.tsx");
  const editor=read("src/features/orders/presentation/OrderEditorPage.tsx");
  const detached=read("src/features/orders/presentation/useDetachedOrderEditor.ts");
  assert.match(editor,/minimizable=\{!saving\}/);
  assert.match(editor,/ariaLabel="Destacar janela"/);
  assert.match(editor,/ariaLabel="Reintegrar janela"/);
  assert.match(tab,/createPortal\(<PortalContainerProvider/);
  assert.match(tab,/customerLookupScope\.current\.open && !customerLookupScope\.current\.customerId/);
  assert.match(detached,/popup\.opener=null/);
  assert.match(detached,/if\(unavailable\)setDetached/);
  assert.doesNotMatch(detached,/supabase|fetch\(/);
  assert.match(edge,/if\(customerIdOnly\) return json\(\{success:true,matched_customer_id:customerId,ambiguous:false\}\)/);
  for(const file of ["dialog","popover","select","dropdown-menu"]){
    const primitive=read("src/shared/ui/primitives/"+file+".tsx");
    assert.match(primitive,/usePortalContainer\(\)/);
  }
  for(const [name,source] of [["TabOrders.tsx",tab],["OrderEditorPage.tsx",editor],["useDetachedOrderEditor.ts",detached]]){
    assert.ok((await transformWithEsbuild(source,name,{loader:name.endsWith(".tsx")?"tsx":"ts"})).code);
  }
});


test("Nova OS destacada reutiliza a mesma janela ao trocar de atendimento",async()=>{
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const tab=read("src/features/orders/presentation/TabOrders.tsx");
  const editor=read("src/features/orders/presentation/OrderEditorPage.tsx");
  assert.match(inbox,/const detachedNewOrder=useDetachedOrderEditor\(\)/);
  assert.match(inbox,/embeddedDetachedEditor=\{detachedNewOrder\}/);
  assert.match(inbox,/embeddedSwitchGuardRef=\{embeddedSwitchGuardRef\}/);
  assert.match(inbox,/newOrder\.conversationId===threadId\)\{detached\.popup\.focus\(\);return;\}/);
  assert.match(inbox,/if\(!embeddedSwitchGuardRef\.current\?\.\(\)\)/);
  assert.match(inbox,/organizationId:org,conversationId:threadId/);
  assert.match(inbox,/<EmbeddedNewOrder key=\{newOrder\.key\}/);
  assert.match(tab,/embeddedDetachedEditor \?\? localDetachedEditor/);
  assert.match(tab,/saving \|\| routedSaveInFlight\.current \|\| formState\.pendingCreatedOrderId/);
  assert.match(tab,/queueGateOpen \|\| form\.queue_reservation_id/);
  assert.match(tab,/!hasDraft \|\| window\.confirm/);
  assert.match(editor,/onChangeCapture=\{onDraftInteraction\}/);
  for(const [name,source] of [["TabOrders.tsx",tab],["OrderEditorPage.tsx",editor],["UnionWhatsAppInboxPage.tsx",inbox]])assert.ok((await transformWithEsbuild(source,name,{loader:"tsx"})).code);
});


test("SAC importado: texto com coordenadas vazias não é localização e anexos mantêm seu tipo", async () => {
  const source=read("src/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository.ts");
  const start=source.indexOf("function mapHistoricalMessage(");
  const end=source.indexOf("// A manager may expose",start);
  assert.ok(start>=0&&end>start);
  const result=await transformWithEsbuild("export "+source.slice(start,end),"historical-map.ts",{loader:"ts",format:"esm",target:"es2022"});
  const {mapHistoricalMessage}=await import("data:text/javascript;base64,"+Buffer.from(result.code).toString("base64"));
  const base={id:"message-1",read_only:true,body_text:"Oi",direction:"incoming",protocol_id:"original-protocol",sent_at:"2020-06-22T19:09:13Z",attachments:[]};
  const map=row=>mapHistoricalMessage({...base,...row},"org","conversation","channel","account");
  for(const location of [null,{}, {latitude:"",longitude:""}, {latitude:null,longitude:null}, {latitude:false,longitude:false}, {latitude:0,longitude:0}, {latitude:"0",longitude:"0"}]){
    const m=map({location});
    assert.equal(m.message_type,"text");
    assert.equal(m.body_text,"Oi");
    assert.equal(m.sent_at,base.sent_at);
    assert.equal(m.protocol_id,base.protocol_id);
  }
  assert.equal(map({location:{latitude:-10.9,longitude:-37.07}}).message_type,"location");
  assert.equal(map({location:{latitude:0,longitude:0},message_type:"location"}).message_type,"location");
  for(const [mime,kind,expected] of [["image/jpeg","unknown","image"],["audio/mpeg","unknown","audio"],["video/mp4","unknown","video"],["application/pdf","unknown","file"],["image/webp","sticker","sticker"]]){
    const m=map({attachments:[{id:"a".repeat(64),mime,kind,available:false}]});
    assert.equal(m.message_type,expected);
    assert.equal(m.historical_attachments[0].available,false);
  }
  assert.equal(map({id:"message-2"}).provider_message_id,"message-2");
  assert.equal(map({direction:"system"}).historical_system,true);
});

test("SAC importado: publicar vínculos não cria atendimento ativo nem duplica conversas",()=>{
  const history=read("supabase/functions/union-history-import/index.ts");
  const migration=read("supabase/migrations/20261124220412_union_whatsapp_archive_conversation_anchor.sql");
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const manager=read("src/features/whatsapp-channels/presentation/WhatsAppHistoryImports.tsx");
  const start=history.indexOf("if(openArchive){");
  const end=history.indexOf("const result=mediaTicket?",start);
  assert.ok(start>=0&&end>start);
  const publish=history.slice(start,end);
  assert.match(history,/has\("whatsapp.history_import.view"\)\|\|!has\("whatsapp.history_import.manage"\)/);
  assert.match(publish,/bridge\(\{action:"history_page",\.\.\.scope,kind:"messages",limit:1\}\)/);
  assert.match(publish,/status:"finished",history_archive_only:true,unread_count:0/);
  assert.match(publish,/onConflict:"channel_id,account_phone,chat_jid",ignoreDuplicates:true/);
  assert.doesNotMatch(publish,/from\("union_whatsapp_messages"\)|check_number|send_text/);
  assert.match(migration,/if tg_op='INSERT' and new.history_archive_only and new.status='finished' then\s+return new/);
  assert.match(migration,/history_archive_only=false/);
  assert.match(inbox,/await openBoundHistoricalConversation\(org,contact.id,channel,account\)/);
  assert.match(inbox,/onClick=\{\(\)=>void viewProtocols\(\)\}/);
  assert.match(manager,/for\(const entry of entries\)/);
  assert.match(manager,/Disponibilizar conversas vinculadas/);
});


test("Históricos geral e de protocolos paginam cinco registros e consultam arquivos antes de abrir conversa",()=>{
  const general=read("src/features/whatsapp-channels/presentation/UnionWhatsAppContactHistory.tsx");
  const protocols=read("src/features/whatsapp-channels/presentation/UnionWhatsAppProtocolHistory.tsx");
  const repo=read("src/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository.ts");
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  assert.match(general,/const GENERAL_PAGE_SIZE=5/);
  assert.match(repo,/const PROTOCOL_PAGE_SIZE=5/);
  assert.match(general,/\(conversation\|\|contactOnly\)&&<div role="tablist"/);
  assert.match(repo,/action:"history_page",contact_only:true,kind:"protocols"/);
  assert.match(general,/safe\.slice\(page\*GENERAL_PAGE_SIZE,needed\)/);
  assert.match(general,/Date\.parse\(row\.at\)>cutoff/);
  assert.match(protocols,/listContactOnlyHistoricalMessages\(scope\.organizationId,scope\.contactId!,scope\.channelId!,scope\.accountPhone!,before,item\.id\)/);
  assert.match(protocols,/listUnionWhatsAppMessages\(scope\.organizationId,scope\.conversation\.id,scope\.conversation\.channel_id,scope\.conversation\.account_phone,item\.id,before\)/);
  assert.match(protocols,/in_att:"bg-emerald/);
  assert.match(protocols,/finished:"bg-blue/);
  assert.match(protocols,/Somente consulta/);
  assert.match(inbox,/protocols\.slice\(protocolsVisiblePage\*PROTOCOL_PAGE_SIZE/);
});
