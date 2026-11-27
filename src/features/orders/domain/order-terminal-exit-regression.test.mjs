import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = (path)=>readFileSync(path,"utf8");

test("Encerramentos especiais exigem documentos, termo assinado, evidência e destino de peças",async()=>{
  const page=read("src/features/orders/presentation/OrderDetailsPage.tsx");
  const actions=read("src/features/orders/presentation/OrderDetailsActions.tsx");
  const dialog=read("src/features/orders/presentation/OrderTerminalExitDialog.tsx");
  const signature=read("src/features/orders/presentation/OrderSignatureRequestDialog.tsx");
  const repo=read("src/features/orders/infrastructure/order-terminal-exit.repository.ts");

  assert.match(actions,/onTerminalExit\("disposal_confirmed"\)/);
  assert.match(actions,/onTerminalExit\("returned_unrepaired"\)/);
  assert.doesNotMatch(actions,/Encerrar sem reparo/);
  assert.match(actions,/canStartReturn && <AdminButton/);
  assert.match(actions,/canTerminalExit && awaitingReturn && <BtnPrimary/);
  assert.match(actions,/onTerminalExit\("disposal_confirmed"\)/);
  assert.match(actions,/const canTerminalExit = hasPermission\("orders.complete"\)/);
  assert.match(page,/OrderTerminalExitDialog/);
  assert.match(page,/is_solved:result\.outcome==="disposal_confirmed"/);
  assert.match(page,/returned_unrepaired","disposal_confirmed/);
  assert.match(page,/onTerminalExit=\{outcome => \{[\s\S]*?setTerminalInitialReason\(rejected\?[\s\S]*?setTerminalOutcome\(outcome\)/);
  assert.doesNotMatch(page,/supabase\.rpc\("complete_disposal_service_order"/);
  assert.match(signature,/preferredDocumentType/);
  assert.match(dialog,/listOrderSignatureRequests/);
  assert.match(dialog,/signedRequests/);
  assert.match(dialog,/attachOrderSituationDocument/);
  assert.match(dialog,/physical_confirmed:choice\.decision==="reusable"&&choice\.physical/);
  assert.match(dialog,/reason\.trim\(\)\.length>=8/);
  assert.match(dialog,/acknowledged&&!invalidStock/);
  assert.match(dialog,/completeOrderTerminalExit/);
  assert.match(repo,/complete_order_terminal_exit_v1/);
  assert.match(repo,/get_order_exit_stock_v1/);

  for(const [p,c] of [["OrderDetailsPage.tsx",page],["OrderDetailsActions.tsx",actions],
    ["OrderTerminalExitDialog.tsx",dialog],["OrderSignatureRequestDialog.tsx",signature],
    ["order-terminal-exit.repository.ts",repo]]){
    assert.ok((await transformWithEsbuild(c,p,{loader:p.endsWith("tsx")?"tsx":"ts"})).code.length>100,p);
  }
});

test("Banco impede descarte sem assinatura dupla, evidência, decisão física e protege situação",()=>{
  const setup=read("supabase/migrations/20261117214500_order_exit_terms_situations_custody.sql");
  const rpc=read("supabase/migrations/20261117215500_service_order_terminal_exit_secure_rpc.sql");
  const guards=read("supabase/migrations/20261117215800_guard_special_terminal_situations.sql");
  const unified=read("supabase/migrations/20261123095700_unify_signed_unrepaired_returns.sql");
  const noWarranty=read("supabase/migrations/20261123104000_unrepaired_returns_no_warranty.sql");
  const losses=read("supabase/migrations/20261117215900_financial_losses_signed_terminal_outcomes.sql");
  const finance=read("src/features/finance/presentation/FinanceLossesSection.tsx");
  assert.match(setup,/TERMO_DESCARTE/);
  assert.match(setup,/TERMO_DEVOLUCAO_SEM_REPARO/);
  assert.match(setup,/require_external_signature,\s*require_employee_signature/);
  assert.match(setup,/service_order_terminal_closures/);
  assert.match(setup,/service_order_terminal_stock_lines/);
  assert.match(rpc,/r\.signed_at is not null/);
  assert.match(rpc,/r\.final_pdf_hash is not null/);
  assert.match(rpc,/evidência de descarte/);
  assert.match(rpc,/evidência de devolução/);
  assert.match(rpc,/quantity_restored/);
  assert.match(rpc,/return_qty/);
  assert.match(unified,/service_order_quote_proposals/);
  assert.match(unified,/approval_status is distinct from/);
  assert.match(unified,/close_rejected_quote_return_v1/);
  assert.match(noWarranty,/is_solved=\(v_outcome=\x27disposal_confirmed\x27\)/);
  assert.match(noWarranty,/v_os\.closure_outcome in \(\x27rejected_quote_return\x27,\x27returned_unrepaired\x27,\x27disposal_confirmed\x27\)/);
  assert.match(rpc,/record_inventory_movement/);
  assert.match(rpc,/revoke execute on function public\.complete_disposal_service_order/);
  assert.match(guards,/special_order_exit/);
  assert.match(guards,/trg_guard_signed_terminal_order_situation/);
  assert.match(losses,/finance_losses_unified_v1/);
  assert.match(losses,/0::numeric\(14,2\) as amount/);
  assert.match(finance,/FinanceServiceOrderLink/);
  assert.match(finance,/Consultar termo assinado/);
  assert.match(finance,/isTerminalLoss\(selected\)/);
});


test("devolução e descarte usam um só AdminDialog com assinatura, QR e atualização automática",async()=>{
  const dialog=read("src/features/orders/presentation/OrderTerminalExitDialog.tsx");
  const signer=read("src/features/orders/presentation/OrderSignatureRequestDialog.tsx");
  const qr=read("src/features/orders/presentation/SignatureQrDialog.tsx");
  const whatsapp=read("src/features/orders/application/order-signature-whatsapp.ts");
  const page=read("src/features/orders/presentation/OrderDetailsPage.tsx");
  const requests=read("src/features/orders/presentation/OrderSignatureRequestsSection.tsx");

  for(const [path,source] of [
    ["OrderTerminalExitDialog.tsx",dialog],["OrderSignatureRequestDialog.tsx",signer],
    ["SignatureQrDialog.tsx",qr],["OrderDetailsPage.tsx",page],
    ["OrderSignatureRequestsSection.tsx",requests],
  ]) assert.ok((await transformWithEsbuild(source,path,{loader:"tsx"})).code.length>100,path);
  assert.ok((await transformWithEsbuild(whatsapp,"order-signature-whatsapp.ts",{loader:"ts"})).code.length>100);
  assert.match(dialog,/transitionKey=\{step\}/);
  assert.match(dialog,/preparingText=\{outcome/);
  assert.match(dialog,/Preparando devolução/);
  assert.match(dialog,/<OrderSignatureRequestDialog[\s\S]*?embedded open/);
  assert.match(dialog,/<SignatureQrDialog embedded/);
  assert.match(dialog,/document_signature_requests/);
  assert.match(dialog,/setInterval/);
  assert.doesNotMatch(dialog,/RefreshCcw/);
  assert.doesNotMatch(dialog,/1\. Motivo e destinação/);
  assert.match(dialog,/stock\.length>0 && <section/);
  assert.match(signer,/if \(embedded\)/);
  assert.match(qr,/if \(embedded\)/);
  assert.match(signer,/getOrderWhatsAppAvailability/);
  assert.match(signer,/sendOrderSignatureViaUnionWhatsApp/);
  assert.doesNotMatch(signer,/sendSacDigitalSignatureInvite/);
  assert.match(requests,/sendOrderSignatureViaUnionWhatsApp/);
  assert.match(whatsapp,/order_recipients/);
  assert.match(whatsapp,/os_join/);
  assert.match(whatsapp,/startUnionWhatsAppWithFirstMessage/);
  const realtimeMigration=read("supabase/migrations/20261120151014_enable_document_signature_realtime_for_terminal_exit.sql");
  assert.match(realtimeMigration,/ALTER PUBLICATION supabase_realtime ADD TABLE public\.document_signature_requests/);
  assert.match(page,/templatesLoading=\{printTemplates\.loading\}/);
});


test("devolução pendente permanece aberta e retoma o mesmo modal",async()=>{
  const dialog=read("src/features/orders/presentation/OrderTerminalExitDialog.tsx");
  const actions=read("src/features/orders/presentation/OrderDetailsActions.tsx");
  const migration=read("supabase/migrations/20261127111200_order_unrepaired_return_stages.sql");
  assert.match(dialog,/startUnrepairedReturn/);
  assert.match(dialog,/getUnrepairedReturn/);
  assert.match(dialog,/cancelUnrepairedReturn/);
  assert.match(dialog,/!initiating&&<>/);
  assert.equal((dialog.match(/<AdminDialog open/g)||[]).length,1);
  assert.match(actions,/awaitingReturn && <BtnPrimary/);
  assert.match(migration,/for update/);
  assert.match(migration,/set situation_id=sid,updated_at=now\(\)/);
  assert.match(migration,/set situation_id=a.prior_situation_id/);
  assert.match(migration,/r.created_at>=a.started_at/);
  assert.match(migration,/m.created_at>=a.started_at/);
  assert.match(migration,/trg_guard_unrepaired_return_transition/);
  assert.match(migration,/orders.complete/);
  assert.ok((await transformWithEsbuild(dialog,"OrderTerminalExitDialog.tsx",{loader:"tsx"})).code.length>100);
});

test("notificação abre conversa com rascunho e registra somente envio confirmado",async()=>{
  const dialog=read("src/features/orders/presentation/OrderTerminalExitDialog.tsx");
  const page=read("src/features/orders/presentation/OrderDetailsPage.tsx");
  const modal=read("src/features/whatsapp-channels/presentation/WhatsAppConversationModal.tsx");
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  const draft=read("src/features/whatsapp-channels/presentation/WhatsAppDraftConversation.tsx");
  const sql=read("supabase/migrations/20261127111200_order_unrepaired_return_stages.sql");
  assert.match(dialog,/Cliente notificado/);
  assert.match(dialog,/markUnrepairedReturnNotified/);
  assert.match(dialog,/open=\{!notificationConversationOpen\}/);
  assert.match(page,/initialMessage:message,onNotificationSent:onSent/);
  assert.match(modal,/firstSendIdRef.current.id,confirmNotification/);
  assert.match(inbox,/result.provider_message_id&&threadId===initialConversationId/);
  assert.match(inbox,/setFinishedFirstMessage\(initialMessage\)/);
  assert.match(draft,/useState\(initialMessage\)/);
  assert.match(sql,/msg.sender_user_id=auth.uid\(\)/);
  assert.match(sql,/msg.delivery_status in \('sent','delivered','read'\)/);
  assert.match(sql,/notification_message_id=m.id/);
  for(const [name,source] of [["dialog",dialog],["page",page],["modal",modal],["inbox",inbox],["draft",draft]])
    assert.ok((await transformWithEsbuild(source,name+".tsx",{loader:"tsx"})).code.length>100,name);
});

test("segunda etapa tem dados do cliente, progresso real e anexo automático",async()=>{
  const dialog=read("src/features/orders/presentation/OrderTerminalExitDialog.tsx");
  assert.doesNotMatch(dialog,/OS aberta · Equipamento sob responsabilidade da assistência/);
  assert.doesNotMatch(dialog,/2\. Aguardando retirada sem reparo/);
  assert.match(dialog,/WhatsAppBrandIcon size=\{16\}/);
  assert.match(dialog,/customerCompany\?"CNPJ":"CPF"/);
  assert.match(dialog,/aria-valuenow=\{attempt\?\.notified_at\?1:0\}/);
  assert.match(dialog,/if\(file\)void upload\(file\)/);
  assert.match(dialog,/uploadGate\.current=true/);
  assert.match(dialog,/<AdminButton variant="danger" disabled=\{submitting\|\|uploading\|\|loading\|\|signedRequests\.length>0\} onClick=\{\(\)=>setCancelConfirm\(true\)\}><Ban size=\{16\}\/> Cancelar devolução<\/AdminButton>/);
  assert.ok((await transformWithEsbuild(dialog,"OrderTerminalExitDialog.tsx",{loader:"tsx"})).code.length>100);
});

test("início da devolução atualiza rodapé sem recarregar página e protege cache contra leitura antiga",async()=>{
  const page=read("src/features/orders/presentation/OrderDetailsPage.tsx");
  const details=read("src/features/orders/application/useOrderDetails.ts");
  const modal=read("src/features/orders/presentation/OrderTerminalExitDialog.tsx");
  assert.match(modal,/await onReturnChanged\?\.\(saved\)/);
  assert.match(modal,/await onReturnChanged\?\.\(null,attempt.prior_situation_id\)/);
  assert.match(page,/await details.syncConfirmedOrderPatch\(detail.id/);
  assert.match(details,/setDetail\(apply\)/);
  assert.match(details,/setSelectedOrder\(apply\)/);
  assert.match(details,/cancelQueries\(\{ queryKey: key, exact: true \}/);
  assert.match(details,/currentOrder: \{ \.\.\.current.currentOrder, \.\.\.patch \}/);
  assert.match(details,/void detailQuery.refetch\(\)/);
  for(const [name,source,loader] of [["page",page,"tsx"],["details",details,"ts"],["modal",modal,"tsx"]])
    assert.ok((await transformWithEsbuild(source,name+"."+loader,{loader})).code.length>100);
});

test("devolução tem uma única ação em qualquer fase do orçamento e mantém histórico de assinaturas",async()=>{
  const actions=read("src/features/orders/presentation/OrderDetailsActions.tsx");
  const quote=read("src/features/orders/presentation/OrderQuoteWorkspace.tsx");
  const page=read("src/features/orders/presentation/OrderDetailsPage.tsx");
  const modal=read("src/features/orders/presentation/OrderTerminalExitDialog.tsx");
  const signature=read("src/features/orders/presentation/OrderSignatureRequestDialog.tsx");
  const documents=read("src/features/orders/presentation/OrderSignatureRequestsSection.tsx");
  assert.doesNotMatch(quote,/Finalizar devolução|onRequestReturn|canCompleteReturn/);
  assert.match(quote,/footerHost && !awaitingReturn && proposal/);
  assert.match(actions,/const canStartReturn = canTerminalExit && !awaitingReturn && !isDisposal/);
  assert.match(page,/quoteState\.status==="rejected"/);
  assert.match(documents,/const visibleRequests = requests;/);
  assert.match(modal,/existingRequests=\{requests\}/);
  assert.match(modal,/onRefreshRequests=\{refreshSignatures\}/);
  assert.match(modal,/if\(!result\.reused\|\|feedback\.type==="error"\)/);
  assert.match(signature,/previousAttemptRequest/);
  assert.match(signature,/cancelPreviousAttemptRequest/);
  assert.match(signature,/reused: true/);
  for(const [name,source] of [["actions",actions],["quote",quote],["page",page],["modal",modal],["signature",signature],["documents",documents]])
    assert.ok((await transformWithEsbuild(source,name+".tsx",{loader:"tsx"})).code.length>100);
});

test("devolução exige encaminhamento da versão atual do orçamento, mas preserva retomada",()=>{
  const page=read("src/features/orders/presentation/OrderDetailsPage.tsx");
  const actions=read("src/features/orders/presentation/OrderDetailsActions.tsx");
  assert.match(page,/const returnQuoteForwarded = !quoteWorkflowEnabled/);
  assert.match(page,/const returnQuoteForwarded = !quoteWorkflowEnabled \|\| Boolean\(quoteState\?\.orderId === detail\?\.id && quoteState\.status === "rejected"\)/);
  assert.match(page,/returnQuoteForwarded=\{returnQuoteForwarded\}/);
  assert.match(page,/!awaitingUnrepairedReturn && !returnQuoteForwarded\)return/);
  assert.match(actions,/const canStartReturn = canTerminalExit && !awaitingReturn && !isDisposal && returnQuoteForwarded/);
  assert.match(actions,/canTerminalExit && awaitingReturn && <BtnPrimary/);
});

test("rejeição com devolução usa operação única e abre a segunda etapa",async()=>{
  const page=read("src/features/orders/presentation/OrderDetailsPage.tsx");
  const quote=read("src/features/orders/presentation/OrderQuoteWorkspace.tsx");
  const repo=read("src/features/orders/infrastructure/order-quote.repository.ts");
  const sql=read("supabase/migrations/20261127130707_atomic_quote_rejection_and_return.sql");
  assert.match(quote,/setStartReturnOnReject\(canStartReturn\)/);
  assert.match(quote,/role="switch" aria-checked=\{startReturnOnReject\}/);
  assert.match(quote,/await rejectQuoteAndStartReturn\(org,orderId,proposal.version,reason\)/);
  assert.match(quote,/onReturnStarted\?\.\(startedReturn\)/);
  assert.match(page,/onReturnStarted=\{attempt=>\{/);
  assert.match(repo,/rpc\("reject_quote_and_start_unrepaired_return_v1"/);
  assert.match(sql,/public\.manage_service_order_quote_v1/);
  assert.match(sql,/public\.start_order_unrepaired_return_v1/);
  assert.match(sql,/guard_quote_during_unrepaired_return/);
  assert.match(sql,/Rejeite o orçamento antes de iniciar a devolução/);
  assert.ok((await transformWithEsbuild(quote,"OrderQuoteWorkspace.tsx",{loader:"tsx"})).code.length>100);
});
