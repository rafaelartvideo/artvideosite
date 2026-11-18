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
  assert.match(inbox, /onClick=\{startNewProtocol\}>Iniciar conversa/);
  assert.match(inbox, /!embedded && !protocolFilter && selected\.status === "finished" && canAction\("reopen"\)/);
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
  assert.match(modal, /if \(!found\.ambiguous\) customerId = found\.customer\?\.id \|\| null/);
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
  // Avatares são carregados sob demanda apenas com o painel expandido,
  // com TTL e até duas requisições simultâneas.
  assert.match(provider,/if\(!expanded\|\|isPageOpen\|\|!channelId\|\|!channelPhone\|\|conversationId\)return/);
  assert.match(provider,/const available=2-avatarRequestsRef.current.size/);
  assert.match(provider,/fetchSharedAvatar\(\{/);
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
  assert.match(bridge,/wuzapi\("\/group\/list",session\.token\)/);
  assert.match(bridge,/action==="groups_list"/);
  assert.match(bridge,/participants_count:/);
  assert.doesNotMatch(bridge.slice(bridge.indexOf('if(action==="groups_list")'),bridge.indexOf('if(action==="contacts_export")')),/participants:group\.Participants/);
  assert.match(edge,/contacts_groups:"view_contacts"/);
  assert.match(edge,/if\(action==="contacts_groups"\)/);
  assert.match(edge,/group[s]?\.length/);
  assert.match(contacts,/aria-pressed=\{tab==="groups"\}/);
  assert.match(contacts,/aria-label="Detalhes do grupo WhatsApp"/);
  assert.match(contacts,/Esta seção consulta os grupos do número conectado/);
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
  assert.match(dialog,/if\(tab!=="contacts"\|\|!selected\|\|creating\|\|!canReadCrm\)/);
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
  assert.match(provider,/const avatarRequestsRef=useRef\(new Set<string>\(\)\)/);
  assert.match(provider,/const avatarCheckedAtRef=useRef\(new Map<string,number>\(\)\)/);
  assert.match(provider,/candidates=\[\.\.\.lists\.in_att\.items\.slice\(0,6\),\.\.\.lists\.waiting\.items\.slice\(0,6\)\]/);
  assert.match(provider,/fetchSharedAvatar\(\{/);
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
  assert.match(visual,/markSharedAvatarBroken\(key,imageUrl\)/);
  assert.match(visual,/src=\{fallback\}/);
  assert.match(visual,/genderValue==="M"/);
  assert.match(visual,/genderValue==="F"/);
  assert.doesNotMatch(visual,/LoaderCircle|Carregando foto/);
  for(const view of [inbox,contacts,mini,edit])assert.match(view,/identity=\{\{/);
  assert.match(inbox,/fetchSharedAvatar\(\{/);
  assert.match(contacts,/fetchSharedAvatar\(\{/);
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
  assert.match(modal,/>Vinculado</);
  assert.match(modal,/Trocar número/);
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
  assert.match(inbox,/department_filter:departmentFilter/);
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
  assert.match(history,/conversation\.channel_id,conversation\.account_phone\)/);
  assert.doesNotMatch(history,/protocolId:/);
  assert.match(history,/UnionWhatsAppProtocolHistory/);
  assert.match(history,/Carregar interações anteriores/);
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

  // Abrir a conversa apenas consulta a OS e o cadastro; o botão exibe rascunho.
  assert.match(modal,/source\.kind==="order" \? "os_join" : "contact_join"/);
  const draft=modal.slice(modal.indexOf("const startConversation = () =>"),modal.indexOf("const sendFirstMessage = async ()"));
  assert.match(draft,/setDrafting\(true\)/);
  assert.doesNotMatch(draft,/operateUnionWhatsAppInbox|startUnionWhatsAppWithFirstMessage/);
  assert.match(modal,/onClick=\{startConversation\}>Iniciar conversa/);
  assert.ok(modal.includes('setDrafting(false);setFirstMessage("");'));
  assert.match(modal,/const conversationId=await startUnionWhatsAppWithFirstMessage\(/);
  assert.match(modal,/!firstMessage\.trim\(\)/);

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
  assert.match(repository,/first_message:text,client_message_id:crypto.randomUUID\(\)/);
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
  assert.match(inbox,/operateUnionWhatsAppInbox\(org,threadId,"customer_match"\)/);
  assert.match(inbox,/let customerId:string\|null=null/);
  assert.match(inbox,/if\(!result\.ambiguous && result\.customer\?\.id\)customerId=result\.customer\.id/);
  assert.match(inbox,/if\(hasPermission\("customers\.view"\)\)/);
  assert.match(inbox,/newOrderLaunchRef\.current!==launch/);
  assert.match(inbox,/!embedded && hasPermission\("orders\.create"\)/);
  assert.match(crm,/onNewOrder\?: \(\) => void/);
  assert.match(crm,/aria-label="Nova OS pelo atendimento"/);
  assert.match(crm,/disabled=\{Boolean\(newOrderLoading \|\| newOrderDisabled\)\}/);
  assert.match(inbox,/newOrderDisabled=\{Boolean\(newOrder\)\}/);
  assert.match(inbox,/useEffect\(\(\)=>setNewOrder\(null\),\[activeOrganizationId\]\)/);
  assert.match(crm,/onClick=\{event=>\{event\.stopPropagation\(\);onNewOrder\(\);\}\}/);
  assert.match(crm,/<AdminButton variant="tertiary" size="sm"/);
  assert.doesNotMatch(crm,/flex-1 items-center gap-2 text-left text-xs font-semibold/);
  const crmRow=crm.slice(crm.indexOf('<div className="flex min-w-0 items-center gap-2">'),
    crm.indexOf('{open && <div id={regionId}'));
  assert.ok(crmRow.indexOf('ChevronDown') < crmRow.indexOf('aria-label="Nova OS pelo atendimento"'),
    "Nova OS deve ficar imediatamente depois da seta de consulta");
  assert.doesNotMatch(inbox,/aria-label="Protocolos do atendimento"/);
  assert.match(inbox,/UnionWhatsAppContactsDialog/);
});

// Execute the actual count-refresh callback with deferred RPCs, without a browser
// or production connection. The refs remain shared across account transitions.
function countRefreshHarness(){
  const provider=read("src/features/whatsapp-channels/presentation/UnionWhatsAppActivityProvider.tsx");
  const body=provider.match(/const refreshCounts=useCallback\(async\(force=false\)=>\{([\s\S]*?)\n  \},\[enabled,organizationId,channelId,channelPhone,accountKey\]\);/)[1];
  const refs={
    disposedRef:{current:false},currentAccountRef:{current:"A"},
    countsInFlightRef:{current:null},countsScopeRef:{current:""},
    lastCountsRef:{current:0},countsRetryAfterRef:{current:0},
  };
  const pending=[],results=[];
  const listUnionWhatsAppConversationCounts=(...args)=>new Promise((resolve,reject)=>pending.push({args,resolve,reject}));
  const create=new Function("env",`const {enabled,organizationId,channelId,channelPhone,accountKey,disposedRef,currentAccountRef,countsInFlightRef,countsScopeRef,lastCountsRef,countsRetryAfterRef,listUnionWhatsAppConversationCounts,setCounts}=env; return async(force=false)=>{${body}};`);
  const forAccount=accountKey=>{
    refs.currentAccountRef.current=accountKey;
    return create({...refs,enabled:true,organizationId:accountKey,channelId:"channel",channelPhone:"phone",accountKey,listUnionWhatsAppConversationCounts,setCounts:value=>results.push(value)});
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
