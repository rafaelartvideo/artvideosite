import { getPublicStorageUrl } from "@/shared/infrastructure/media.repository";
import { getOrderChecklist } from "@/features/checklists/infrastructure/checklists.repository";
import { useEffect, useState } from "react";
import { ChevronDown, FileText, Mail, PackagePlus, Printer } from "lucide-react";
import { AdminPage, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/primitives/dropdown-menu";
import { OrderChecklistsPage } from "@/features/checklists/presentation/OrderChecklistsPage";
import { OrderChecklistToolbarButton } from "@/features/checklists/presentation/OrderChecklistToolbarButton";
import { OrderDetailsActions } from "./OrderDetailsActions";
import { OrderDetailsContent } from "./OrderDetailsContent";
import { OrderHistoryPage } from "./OrderHistoryPage";
import { OrderDocumentsPage } from "./OrderDocumentsPage";
import { OrderSituationRecordsPage } from "./OrderSituationRecordsPage";
import { OrderPartRequestsSection } from "./OrderPartRequestsSection";
import { OrderSolutionSummary } from "./OrderSolutionSummary";
import { OrderSolutionRecordsPage } from "./OrderSolutionRecordsPage";
import { OrderUndoSolutionDialog } from "./OrderUndoSolutionDialog";
import { OrderFinancialSummary } from "./OrderFinancialSummary";
import { ServiceOrderSlaCards } from "./ServiceOrderSlaCards";
import { PRINT_TEMPLATE_TYPE_LABELS, type PrintTemplate } from "@/features/documents/domain/print-template";
import { buildOrderPrintDocumentHtml, openPrintWindow, renderOrderPrintDocument } from "@/features/documents/domain/order-print-document";
import { loadPrintTemplateEditorValue } from "@/features/documents/infrastructure/documents.repository";
import { sendOrderDocumentEmail } from "@/features/documents/infrastructure/order-document-email.repository";
import { getCompanyPrintContext } from "@/features/settings/infrastructure/company-settings.repository";
import { useOrderPrintTemplates } from "../application/useOrderPrintTemplates";
import { useOrderSituationVisits } from "../application/useOrderSituationVisits";
import type { useOrderDetails } from "../application/useOrderDetails";
import type { useOrderImages } from "../application/useOrderImages";
import type { useOrderHistory } from "../application/useOrderHistory";
import type { useOrderSituationDocuments } from "../application/useOrderSituationDocuments";
import type { useOrderListMutations } from "../application/useOrderListMutations";
import type { useOrderPartRequests } from "../application/useOrderPartRequests";
import type { useOrderResolution } from "../application/useOrderResolution";
import type { useOrderCompletion } from "../application/useOrderCompletion";
import type { useOrdersWorkspace } from "../application/useOrdersWorkspace";

const ORDER_EMAIL_ACTION_VISIBLE = false;

type PermissionCheck = (permission: string) => boolean;
type OrderDetailSubpage = "history" | "documents" | "part-requests" | "sla-records" | "checklists";

type Props = {
  visible: boolean;
  userId?: string;
  profileName?: string | null;
  workspace: ReturnType<typeof useOrdersWorkspace>;
  details: ReturnType<typeof useOrderDetails>;
  history: ReturnType<typeof useOrderHistory>;
  documents: ReturnType<typeof useOrderSituationDocuments>;
  routeSubpage?: string | null;
  onOpenSubpage: (subpage: OrderDetailSubpage) => void;
  onCloseSubpage: () => void;
  images: ReturnType<typeof useOrderImages>;
  partRequests: ReturnType<typeof useOrderPartRequests>;
  resolution: ReturnType<typeof useOrderResolution>;
  completion: ReturnType<typeof useOrderCompletion>;
  mutations: ReturnType<typeof useOrderListMutations>;
  hasPermission: PermissionCheck;
  usedItemsTotal: number;
  formatDate: (value?: string | null, time?: boolean) => string;
  formatState: (state: unknown) => string;
  formatSolvedAt: (value: string) => string;
  formatCurrency: (value: number) => string;
  getSituations: (serviceTypeId: string, currentSituationId?: string, currentSituation?: any) => any[];
  getSla: (serviceTypeId?: string, situationId?: string, relatedSituation?: any) => any;
  onEdit: (order: any) => void;
  onClose?: () => void;
};

export function OrderDetailsPage(props: Props) {
  const {
    visible, userId, profileName, workspace, details, history, documents, routeSubpage, onOpenSubpage, onCloseSubpage, images, partRequests,
    resolution, completion, mutations, hasPermission, usedItemsTotal: detailUsedItemsTotal,
    formatDate: fmtDate, formatState: stateLabel, formatSolvedAt,
    formatCurrency, getSituations: getSituationsForType, getSla: getSlaForOrder,
    onEdit: openEdit, onClose,
  } = props;
  const [printingTemplateId, setPrintingTemplateId] = useState<string | null>(null);
  const [printError, setPrintError] = useState("");
  const [emailingTemplateId, setEmailingTemplateId] = useState<string | null>(null);
  const [emailMessage, setEmailMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [solutionRecordsOpen, setSolutionRecordsOpen] = useState(false);
  const { statuses, situations } = workspace;
  const { detail, detailUsedItems, detailSolutionImages, closeDetail } = details;
  const canOpenDocumentsPage = hasPermission("orders.section.images") || hasPermission("documents.signatures.view");
  const historyPageOpen = Boolean(detail) && routeSubpage === "history" && hasPermission("orders.section.history");
  const documentsPageOpen = Boolean(detail) && routeSubpage === "documents" && canOpenDocumentsPage;
  const partRequestsPageOpen = Boolean(detail) && routeSubpage === "part-requests" && hasPermission("orders.section.parts");
  const slaRecordsPageOpen = Boolean(detail) && routeSubpage === "sla-records" && hasPermission("orders.section.sla_cards");
  const checklistsPageOpen = Boolean(detail) && routeSubpage === "checklists" && hasPermission("orders.section.checklists");
  const routedSubpageOpen = historyPageOpen || documentsPageOpen || partRequestsPageOpen || slaRecordsPageOpen || checklistsPageOpen;
  const routedSubpageDenied = Boolean(detail && (
    (routeSubpage === "history" && !hasPermission("orders.section.history"))
    || (routeSubpage === "documents" && !canOpenDocumentsPage)
    || (routeSubpage === "part-requests" && !hasPermission("orders.section.parts"))
    || (routeSubpage === "sla-records" && !hasPermission("orders.section.sla_cards"))
    || (routeSubpage === "checklists" && !hasPermission("orders.section.checklists"))
  ));
  const slaVisits = useOrderSituationVisits(detail?.id, detail?.situation_id, detail?.situation_started_at);
  const { setViewImage, orderImages } = images;
  const solutionMediaIds = new Set(detailSolutionImages.map(image => image.mediaId).filter(Boolean));
  const visibleDocumentCount = documents.documents.filter(document => !solutionMediaIds.has(document.media_id)).length + detailSolutionImages.length;
  const { detailPartRequests, getTestCommittedQuantity, getTestPendingQuantity, openPartApproval, openPartRejection, openDeliveryRequest, openTestResult, openPartRequestModal } = partRequests;
  const {
    openSolveOrder,
    solutionAttempts,
    solutionCount,
    activeSolutionAttempt,
    solutionHistoryLoading,
    solutionHistoryError,
    loadSolutionAttempts,
    undoOpen,
    setUndoOpen,
    undoSubmitting,
    openUndoSolution,
    undoOrderSolution,
  } = resolution;
  const { openCompletion } = completion;
  const pendingPartRequests = detailPartRequests.filter(request => String(request.status || "").toUpperCase() === "PENDING").length;
  const completedPartRequests = detailPartRequests.length - pendingPartRequests;
  const { updateOrderStatus, updateOrderSituation } = mutations;
  const canPrintDocuments = hasPermission("documents.print");
  const canUseSignatureDocuments = hasPermission("documents.signatures.view") || hasPermission("documents.signatures.send");
  const printTemplates = useOrderPrintTemplates(canPrintDocuments || canUseSignatureDocuments);

  useEffect(() => {
    setSolutionRecordsOpen(false);
  }, [detail?.id]);

  const openSolutionRecords = () => {
    if (detail?.id) void loadSolutionAttempts(detail.id, detail.organization_id);
    setSolutionRecordsOpen(true);
  };

  const printTemplate = async (template: PrintTemplate) => {
    setPrintError("");
    const popup = openPrintWindow();
    if (!popup) { setPrintError("O navegador bloqueou a janela de impressão. Permita pop-ups para este site."); return; }
    setPrintingTemplateId(template.id);
    try {
      if (!detail?.organization_id) throw new Error("A OS não possui empresa definida.");
      const [configuredTemplate, company] = await Promise.all([loadPrintTemplateEditorValue(template), getCompanyPrintContext(detail.organization_id)]);
      const needsChecklist = [...configuredTemplate.selectedFields].some(key => key.startsWith("checklists."));
      if (needsChecklist && !hasPermission("orders.section.checklists")) throw new Error("Você não possui permissão para imprimir os checklists desta OS.");
      const checklist = needsChecklist ? await getOrderChecklist(detail.id) : null;
      const checklistPhotoUrls = Object.fromEntries((checklist?.stages || [])
        .filter(stage => configuredTemplate.selectedFields.has("checklists." + stage.stage_type_snapshot))
        .flatMap(stage => stage.items.flatMap(item => item.media.flatMap(link =>
          link.media ? [[link.media_id, getPublicStorageUrl(link.media.bucket_id, link.media.storage_path)]] : [],
        ))));
      renderOrderPrintDocument(popup, configuredTemplate, { order: detail, checklist, checklistPhotoUrls, usedItems: detailUsedItems, partRequests: detailPartRequests, history: details.detailHistory, printedBy: profileName, company });
    } catch (error) { popup.close(); setPrintError(error instanceof Error ? error.message : "Não foi possível preparar o documento."); }
    finally { setPrintingTemplateId(null); }
  };

  const emailTemplate = async (template: PrintTemplate) => {
    const customerEmail = String((detail.customer as any)?.email || "").trim();
    if (!customerEmail) { setEmailMessage({ text: "O cliente não possui e-mail cadastrado.", type: "error" }); return; }
    setEmailMessage(null);
    setEmailingTemplateId(template.id);
    try {
      if (!detail?.organization_id) throw new Error("A OS não possui empresa definida.");
      const [configuredTemplate, company] = await Promise.all([loadPrintTemplateEditorValue(template), getCompanyPrintContext(detail.organization_id)]);
      const needsChecklist = [...configuredTemplate.selectedFields].some(key => key.startsWith("checklists."));
      if (needsChecklist && !hasPermission("orders.section.checklists")) throw new Error("Você não possui permissão para imprimir os checklists desta OS.");
      const checklist = needsChecklist ? await getOrderChecklist(detail.id) : null;
      const checklistPhotoUrls = Object.fromEntries((checklist?.stages || [])
        .filter(stage => configuredTemplate.selectedFields.has("checklists." + stage.stage_type_snapshot))
        .flatMap(stage => stage.items.flatMap(item => item.media.flatMap(link =>
          link.media ? [[link.media_id, getPublicStorageUrl(link.media.bucket_id, link.media.storage_path)]] : [],
        ))));
      const html = buildOrderPrintDocumentHtml(configuredTemplate, { order: detail, checklist, checklistPhotoUrls, usedItems: detailUsedItems, partRequests: detailPartRequests, history: details.detailHistory, printedBy: profileName, company });
      const result = await sendOrderDocumentEmail({ orderId: detail.id, documentName: template.name, documentHtml: html });
      setEmailMessage({ text: `Documento enviado para ${result.recipient}.`, type: "success" });
    } catch (error) { setEmailMessage({ text: error instanceof Error ? error.message : "Não foi possível enviar o documento.", type: "error" }); }
    finally { setEmailingTemplateId(null); }
  };

  const closePage = () => { setSolutionRecordsOpen(false); closeDetail(); if (onClose) onClose(); };

  if (routedSubpageDenied && detail) {
    return <AdminPage open onClose={onCloseSubpage} breadcrumb={`Ordens de Serviço > ${detail.os_number || "OS"}`} title="Acesso restrito" subtitle="Você não possui permissão para acessar esta seção da OS." maxW="max-w-2xl"><div className="p-5"><BtnSecondary onClick={onCloseSubpage}>Voltar para a OS</BtnSecondary></div></AdminPage>;
  }

  return <>
    <OrderDocumentsPage
      open={documentsPageOpen}
      order={detail}
      currentSituationId={detail?.situation_id}
      controller={documents}
      solutionImages={detailSolutionImages}
      signatureTemplates={printTemplates.templates}
      signatureContext={{ usedItems: detailUsedItems, partRequests: detailPartRequests, history: details.detailHistory, printedBy: profileName }}
      hasPermission={hasPermission}
      onClose={onCloseSubpage}
      onView={setViewImage}
    />
    <OrderSituationRecordsPage open={slaRecordsPageOpen} order={detail} visits={slaVisits.visits} loading={slaVisits.loading} error={slaVisits.error} onClose={onCloseSubpage} />
    <OrderSolutionRecordsPage open={solutionRecordsOpen && Boolean(detail)} order={detail} attempts={solutionAttempts} loading={solutionHistoryLoading} error={solutionHistoryError} onClose={() => setSolutionRecordsOpen(false)} onViewImage={setViewImage} />
    <OrderUndoSolutionDialog order={detail} open={Boolean(detail) && undoOpen} loading={undoSubmitting} onClose={() => setUndoOpen(false)} onConfirm={undoOrderSolution} />
    <OrderHistoryPage open={historyPageOpen} order={detail} history={history} canCreate={hasPermission("orders.history.create")} formatDate={fmtDate} onClose={onCloseSubpage} />
    {detail && <OrderChecklistsPage open={checklistsPageOpen} order={detail} canManage={hasPermission("orders.checklists.manage")} canReopen={hasPermission("orders.checklists.reopen")} onClose={onCloseSubpage} />}
    {partRequestsPageOpen && detail && <AdminPage open onClose={onCloseSubpage} breadcrumb={`Ordens de Serviço > ${detail.os_number || "OS"} > Solicitações de peças`} title="Solicitações de peças" subtitle="Acompanhe os pedidos e o fluxo das peças desta OS" maxW="max-w-2xl"><div className="p-5"><OrderPartRequestsSection requests={detailPartRequests} assignedTo={detail.assigned_to} currentUserId={userId} hasPermission={hasPermission} formatDate={fmtDate} getCommittedQuantity={getTestCommittedQuantity} getPendingQuantity={getTestPendingQuantity} onApprove={openPartApproval} onReject={openPartRejection} onDelivery={openDeliveryRequest} onTestResult={openTestResult} /></div><div className="sticky bottom-0 border-t border-[#0d1b2e]/8 bg-white px-5 py-4"><BtnSecondary onClick={onCloseSubpage}>Voltar para a OS</BtnSecondary></div></AdminPage>}
    {visible && !routedSubpageOpen && !solutionRecordsOpen && <AdminPage open onClose={closePage} breadcrumb="Ordens de Serviço" title={detail.os_number || "Ordem de Serviço"} subtitle={(detail.service as any)?.title || "Ordem de Serviço"} maxW="max-w-2xl">
      <div className="space-y-5 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2"><StatusBadge status={(detail.order_status as any)?.name || "—"} color={(detail.order_status as any)?.color} />{(detail.situation as any)?.name && <StatusBadge status={(detail.situation as any).name} color={(detail.situation as any)?.color} />}{detail.completed_at ? <span className="inline-flex items-center rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-bold uppercase text-white">✓ OS concluída</span> : detail.is_solved && <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-[10px] font-bold uppercase text-green-700">✓ OS solucionada</span>}</div>
          <div className="flex flex-wrap items-center gap-2 border-t border-[#0d1b2e]/10 pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
            {canPrintDocuments && <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="inline-flex items-center gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 py-2 text-xs font-bold text-[#0d1b2e] transition-colors hover:bg-[#f5f7fa]"><Printer size={14} /> Imprimir <ChevronDown size={13} /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-72">{printTemplates.loading && <DropdownMenuItem disabled>Carregando modelos...</DropdownMenuItem>}{Boolean(printTemplates.error) && <DropdownMenuItem disabled className="text-red-600">Não foi possível carregar os modelos.</DropdownMenuItem>}{!printTemplates.loading && !printTemplates.error && printTemplates.templates.map(template => <DropdownMenuItem key={template.id} disabled={Boolean(printingTemplateId)} onSelect={event => { event.preventDefault(); void printTemplate(template); }} className="flex cursor-pointer items-center justify-between gap-4"><span className="min-w-0"><span className="block truncate font-semibold">{template.name}</span><span className="block text-[10px] text-[#5a6a82]">{PRINT_TEMPLATE_TYPE_LABELS[template.document_type] || template.document_type}</span></span>{printingTemplateId === template.id && <span className="shrink-0 text-[10px] font-bold text-[#0057e7]">Preparando...</span>}</DropdownMenuItem>)}{printError && <DropdownMenuItem disabled className="max-w-72 whitespace-normal text-red-600">{printError}</DropdownMenuItem>}{!printTemplates.loading && !printTemplates.error && printTemplates.templates.length === 0 && <DropdownMenuItem disabled>Nenhum modelo ativo.</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu>}
            {ORDER_EMAIL_ACTION_VISIBLE && canPrintDocuments && <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="inline-flex items-center gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 py-2 text-xs font-bold text-[#0d1b2e] transition-colors hover:bg-[#f5f7fa]"><Mail size={14} /> Enviar e-mail <ChevronDown size={13} /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-72">{printTemplates.loading && <DropdownMenuItem disabled>Carregando modelos...</DropdownMenuItem>}{Boolean(printTemplates.error) && <DropdownMenuItem disabled className="text-red-600">Não foi possível carregar os modelos.</DropdownMenuItem>}{!printTemplates.loading && !printTemplates.error && printTemplates.templates.map(template => <DropdownMenuItem key={template.id} disabled={Boolean(emailingTemplateId)} onSelect={event => { event.preventDefault(); void emailTemplate(template); }} className="flex cursor-pointer items-center justify-between gap-4"><span className="min-w-0"><span className="block truncate font-semibold">{template.name}</span><span className="block text-[10px] text-[#5a6a82]">{PRINT_TEMPLATE_TYPE_LABELS[template.document_type] || template.document_type}</span></span>{emailingTemplateId === template.id && <span className="shrink-0 text-[10px] font-bold text-[#0057e7]">Enviando...</span>}</DropdownMenuItem>)}{!printTemplates.loading && !printTemplates.error && printTemplates.templates.length === 0 && <DropdownMenuItem disabled>Nenhum modelo ativo.</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu>}
            {hasPermission("orders.section.checklists") && <OrderChecklistToolbarButton orderId={detail.id} onClick={() => onOpenSubpage("checklists")} />}
            {hasPermission("orders.section.parts") && <button type="button" onClick={() => onOpenSubpage("part-requests")} className="inline-flex items-center gap-2 rounded-lg border border-[#0057e7]/25 bg-[#f0f6ff] px-3 py-2 text-xs font-bold text-[#0057e7] transition-colors hover:bg-[#e2edff]"><PackagePlus size={14} /> Solicitações de peças{pendingPartRequests > 0 && <span title="Solicitações em aberto" className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-black text-amber-950">{pendingPartRequests}</span>}{completedPartRequests > 0 && <span title="Solicitações concluídas" className="inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-black text-white">{completedPartRequests}</span>}</button>}
            {canOpenDocumentsPage && <button type="button" onClick={() => onOpenSubpage("documents")} className="inline-flex items-center gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 py-2 text-xs font-bold text-[#0d1b2e] hover:bg-[#f5f7fa]"><FileText size={14} /> Documentos{visibleDocumentCount > 0 && <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#0057e7] px-1.5 py-0.5 text-[10px] text-white">{visibleDocumentCount}</span>}</button>}
            {hasPermission("orders.section.history") && <button type="button" onClick={() => onOpenSubpage("history")} className="inline-flex items-center gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 py-2 text-xs font-bold text-[#0d1b2e] hover:bg-[#f5f7fa]"><FileText size={14} /> Histórico{history.total > 0 && <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#0d1b2e] px-1.5 py-0.5 text-[10px] text-white">{history.total}</span>}</button>}
          </div>
        </div>
        {ORDER_EMAIL_ACTION_VISIBLE && emailMessage && <div className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs font-semibold ${emailMessage.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}><span>{emailMessage.text}</span><button type="button" onClick={() => setEmailMessage(null)} aria-label="Fechar aviso">×</button></div>}
        {hasPermission("orders.section.sla_cards") && <ServiceOrderSlaCards order={detail} slaHours={getSlaForOrder(detail.service_type_id, detail.situation_id, detail.situation)?.hours ?? null} visits={slaVisits.visits} onOpenRecords={() => onOpenSubpage("sla-records")} />}
        <OrderDetailsContent detail={detail} formatDate={fmtDate} formatState={stateLabel} getSla={getSlaForOrder} hasPermission={hasPermission} orderImages={orderImages} onViewImage={setViewImage} />
        <OrderFinancialSummary detail={detail} formatCurrency={formatCurrency} />
        <OrderSolutionSummary detail={detail} usedItems={detailUsedItems} solutionImages={detailSolutionImages} usedItemsTotal={detailUsedItemsTotal} solutionCount={solutionCount} activeAttempt={activeSolutionAttempt} canUndo={hasPermission("orders.solve") && !detail.completed_at} formatSolvedAt={formatSolvedAt} formatCurrency={formatCurrency} onViewImage={setViewImage} onOpenRecords={openSolutionRecords} onUndo={openUndoSolution} />
      </div>
      <OrderDetailsActions detail={detail} statuses={statuses} situations={getSituationsForType(detail.service_type_id, detail.situation_id, detail.situation)} hasPermission={hasPermission} onClose={closePage} onStatusChange={statusId => updateOrderStatus(detail, statusId)} onSituationChange={situationId => { void updateOrderSituation(detail, situationId); }} onRequestParts={openPartRequestModal} onResolve={() => openSolveOrder(detail)} onComplete={openCompletion} onEdit={() => { void openEdit(detail); }} />
    </AdminPage>}
  </>;
}
