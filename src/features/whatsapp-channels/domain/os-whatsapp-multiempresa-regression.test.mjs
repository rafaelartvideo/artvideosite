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
  assert.match(inbox, /"Iniciar conversa"/);
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
  assert.match(provider,/operateUnionWhatsAppInbox\(organizationId,item.id,"contact_avatar"\)/);
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
  assert.match(panel,/bottom:"calc\(1rem \+ env\(safe-area-inset-bottom,0px\)\)"/);
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
  assert.match(provider,/operateUnionWhatsAppInbox\(organizationId,item\.id,"contact_avatar"\)/);
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
