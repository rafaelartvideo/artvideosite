import { resolveMediaStorageUrl } from "@/shared/infrastructure/media.repository";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { getOrderChecklist } from "@/features/checklists/infrastructure/checklists.repository";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, FileText, Mail, MessageCircle, Package, PackagePlus, Phone, Printer, Tag } from "lucide-react";
import { AdminButton, AdminPage, AdminStickyToolbar, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
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
import { OrderProductsServicesSection } from "./OrderProductsServicesSection";
import { OrderSacDigitalDialog } from "@/features/sac-digital/presentation/OrderSacDigitalDialog";
import { getSacDigitalIntegrationStatus } from "@/features/sac-digital/infrastructure/sac-digital.repository";
import { adminPath } from "@/features/admin-shell/admin-routes";
import { phoneContactLinks } from "../domain/order-contact-actions";
import { PRINT_TEMPLATE_TYPE_LABELS, type PrintTemplate } from "@/features/documents/domain/print-template";
import { buildOrderPrintDocumentHtml, openPrintWindow, renderOrderPrintDocument } from "@/features/documents/domain/order-print-document";
import { createServiceOrderLabelDataUrl, renderServiceOrderLabel } from "../domain/order-label-print";
import { QRCodeCanvas } from "qrcode.react";
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
  initialSection?: "details" | "products-services";
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
  monitorView?: boolean;
  monitorContact?: {
    phone?: string | null;
    whatsapp?: string | null;
    email?: string | null;
    owner_name?: string | null;
    owner_user_id?: string | null;
  } | null;
};

export function OrderDetailsPage(props: Props) {
  const {
    visible, initialSection = "details", userId, profileName, workspace, details, history, documents, routeSubpage, onOpenSubpage, onCloseSubpage, images, partRequests,
    resolution, completion, mutations, hasPermission, usedItemsTotal: detailUsedItemsTotal,
    formatDate: fmtDate, formatState: stateLabel, formatSolvedAt,
    formatCurrency, getSituations: getSituationsForType, getSla: getSlaForOrder,
    onEdit: openEdit, onClose, monitorView = false, monitorContact = null,
  } = props;
  const [printingTemplateId, setPrintingTemplateId] = useState<string | null>(null);
  const labelQrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [printError, setPrintError] = useState("");
  const [emailingTemplateId, setEmailingTemplateId] = useState<string | null>(null);
  const [emailMessage, setEmailMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [solutionRecordsOpen, setSolutionRecordsOpen] = useState(false);
  const [detailSection, setDetailSection] = useState<"products-services" | "details">(initialSection);
  const [sacMessageOpen, setSacMessageOpen] = useState(false);
  const [checkingSac, setCheckingSac] = useState(false);
  const [sacEnabled, setSacEnabled] = useState(false);
  const canSendSac = hasPermission("sac_digital.messages.send");
  const canViewSac = hasPermission("sac_digital.view") && hasPermission("sac_digital.messages.view");
  const { statuses, situations } = workspace;
  const { detail, detailUsedItems, detailSolutionImages, closeDetail } = details;
  const effectiveRouteSubpage = routeSubpage;
  const canOpenDocumentsPage = hasPermission("orders.section.images") || hasPermission("documents.signatures.view");
  const historyPageOpen = Boolean(detail) && effectiveRouteSubpage === "history" && hasPermission("orders.section.history");
  const documentsPageOpen = Boolean(detail) && effectiveRouteSubpage === "documents" && canOpenDocumentsPage;
  const partRequestsPageOpen = Boolean(detail) && effectiveRouteSubpage === "part-requests" && hasPermission("orders.section.parts");
  const slaRecordsPageOpen = Boolean(detail) && effectiveRouteSubpage === "sla-records" && hasPermission("orders.section.sla_cards");
  const checklistsPageOpen = Boolean(detail) && effectiveRouteSubpage === "checklists" && hasPermission("orders.section.checklists");
  const routedSubpageOpen = historyPageOpen || documentsPageOpen || partRequestsPageOpen || slaRecordsPageOpen || checklistsPageOpen;
  const routedSubpageDenied = Boolean(detail && (
    (effectiveRouteSubpage === "history" && !hasPermission("orders.section.history"))
    || (effectiveRouteSubpage === "documents" && !canOpenDocumentsPage)
    || (effectiveRouteSubpage === "part-requests" && !hasPermission("orders.section.parts"))
    || (effectiveRouteSubpage === "sla-records" && !hasPermission("orders.section.sla_cards"))
    || (effectiveRouteSubpage === "checklists" && !hasPermission("orders.section.checklists"))
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
  const labelUrl = detail?.id && detail?.organization_id
    ? `${window.location.origin}/admin/orders/${encodeURIComponent(detail.id)}?org=${encodeURIComponent(detail.organization_id)}`
    : "";
  const contactPhone = String(monitorContact?.phone || "").replace(/\D/g, "");
  const contactWhatsappRaw = String(monitorContact?.whatsapp || monitorContact?.phone || "").replace(/\D/g, "");
  const contactWhatsapp = contactWhatsappRaw && !contactWhatsappRaw.startsWith("55") && contactWhatsappRaw.length <= 11
    ? `55${contactWhatsappRaw}`
    : contactWhatsappRaw;

  useEffect(() => {
    setSolutionRecordsOpen(false);
    setSacMessageOpen(false);
    setDetailSection(initialSection);
  }, [detail?.id, initialSection]);

  useEffect(() => {
    let alive = true;
    setSacEnabled(false);
    if (!detail?.organization_id || monitorView || !canSendSac) return;
    void getSacDigitalIntegrationStatus(detail.organization_id)
      .then(result => { if (alive) setSacEnabled(result.enabled === true); })
      .catch(() => { if (alive) setSacEnabled(false); });
    return () => { alive = false; };
  }, [detail?.organization_id, monitorView, canSendSac]);

  const openSacConversation = () => {
    const customerId = String(detail?.customer_id || "");
    if (!canViewSac || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(customerId)) return;
    const url = `${adminPath("tools", "sac-digital")}?customer=${encodeURIComponent(customerId)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openCustomerWhatsApp = async () => {
    if (!detail || checkingSac) return;
    const customer = detail.customer as any;
    const external = phoneContactLinks(customer?.whatsapp || customer?.phone);
    if (!external.whatsapp) return;

    // Ja verificamos o conector ao abrir a OS: evitar chamada repetida.
    if (!monitorView && canSendSac && sacEnabled) {
      setSacMessageOpen(true);
      return;
    }

    if (monitorView || !canSendSac || !detail.organization_id) {
      window.open(external.whatsapp, "_blank", "noopener,noreferrer");
      return;
    }

    setCheckingSac(true);
    try {
      const integration = await getSacDigitalIntegrationStatus(detail.organization_id);
      if (integration.enabled) {
        setSacEnabled(true);
        setSacMessageOpen(true);
        return;
      }
    } catch {
      // Se a integração não puder ser consultada, preserva o WhatsApp externo como contingência.
    } finally {
      setCheckingSac(false);
    }

    window.open(external.whatsapp, "_blank", "noopener,noreferrer");
  };

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
      const checklistMedia = (checklist?.stages || [])
        .filter(stage => configuredTemplate.selectedFields.has("checklists." + stage.stage_type_snapshot))
        .flatMap(stage => stage.items.flatMap(item => item.media.flatMap(link => link.media ? [link] : [])));
      const checklistPhotoUrls = Object.fromEntries(await Promise.all(
        checklistMedia.map(async link => [
          link.media_id,
          await resolveMediaStorageUrl(link.media!.bucket_id, link.media!.storage_path),
        ] as const),
      ));
      renderOrderPrintDocument(popup, configuredTemplate, {
        order: detail,
        checklist,
        checklistPhotoUrls,
        usedItems: detailUsedItems,
        partRequests: detailPartRequests,
        history: details.detailHistory,
        printedBy: profileName,
        company,
      });
    } catch (error) { popup.close(); setPrintError(systemErrorMessage(error, "Não foi possível preparar o documento.")); }
    finally { setPrintingTemplateId(null); }
  };

  const printLabel = () => {
    setPrintError("");
    if (!detail?.id || !detail?.organization_id || !labelUrl) {
      setPrintError("Não foi possível montar a etiqueta desta OS.");
      return;
    }

    const qrCanvas = labelQrCanvasRef.current;
    if (!qrCanvas) {
      setPrintError("Não foi possível gerar o QR Code da etiqueta.");
      return;
    }

    const popup = openPrintWindow();
    if (!popup) {
      setPrintError("O navegador bloqueou a janela de impressão. Permita pop-ups para este site.");
      return;
    }

    try {
      const imageDataUrl = createServiceOrderLabelDataUrl(detail, qrCanvas);
      renderServiceOrderLabel(popup, imageDataUrl, detail.os_number);
    } catch (error) {
      popup.close();
      setPrintError(systemErrorMessage(error, "Não foi possível preparar a etiqueta."));
    }
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
      const checklistMedia = (checklist?.stages || [])
        .filter(stage => configuredTemplate.selectedFields.has("checklists." + stage.stage_type_snapshot))
        .flatMap(stage => stage.items.flatMap(item => item.media.flatMap(link => link.media ? [link] : [])));
      const checklistPhotoUrls = Object.fromEntries(await Promise.all(
        checklistMedia.map(async link => [
          link.media_id,
          await resolveMediaStorageUrl(link.media!.bucket_id, link.media!.storage_path),
        ] as const),
      ));
      const html = buildOrderPrintDocumentHtml(configuredTemplate, { order: detail, checklist, checklistPhotoUrls, usedItems: detailUsedItems, partRequests: detailPartRequests, history: details.detailHistory, printedBy: profileName, company });
      const result = await sendOrderDocumentEmail({ orderId: detail.id, documentName: template.name, documentHtml: html });
      setEmailMessage({ text: `Documento enviado para ${result.recipient}.`, type: "success" });
    } catch (error) { setEmailMessage({ text: systemErrorMessage(error, "Não foi possível enviar o documento."), type: "error" }); }
    finally { setEmailingTemplateId(null); }
  };

  const closePage = () => { setSolutionRecordsOpen(false); closeDetail(); if (onClose) onClose(); };

  if (routedSubpageDenied && detail) {
    return <AdminPage open onClose={onCloseSubpage} breadcrumb={`Ordens de Serviço > ${detail.os_number || "OS"}`} title="Acesso restrito" subtitle="Você não possui permissão para acessar esta seção da OS." maxW="max-w-2xl"><div className="p-5"><BtnSecondary onClick={onCloseSubpage}>Voltar para a OS</BtnSecondary></div></AdminPage>;
  }

  return <>
    {detail && (
      <OrderSacDigitalDialog
        open={sacMessageOpen}
        order={detail}
        onClose={() => setSacMessageOpen(false)}
        onOpenChat={canViewSac && detail.customer_id ? openSacConversation : undefined}
      />
    )}
    {detail && labelUrl && <div aria-hidden="true" className="pointer-events-none absolute left-[-9999px] top-0 h-px w-px overflow-hidden opacity-0"><QRCodeCanvas ref={labelQrCanvasRef} value={labelUrl} size={256} level="M" marginSize={2} /></div>}
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
      readOnly={monitorView}
    />
    <OrderSituationRecordsPage open={slaRecordsPageOpen} order={detail} visits={slaVisits.visits} loading={slaVisits.loading} error={slaVisits.error} onClose={onCloseSubpage} />
    <OrderSolutionRecordsPage open={solutionRecordsOpen && Boolean(detail)} order={detail} attempts={solutionAttempts} loading={solutionHistoryLoading} error={solutionHistoryError} onClose={() => setSolutionRecordsOpen(false)} onViewImage={setViewImage} />
    <OrderUndoSolutionDialog order={detail} open={Boolean(detail) && undoOpen} loading={undoSubmitting} onClose={() => setUndoOpen(false)} onConfirm={undoOrderSolution} />
    <OrderHistoryPage open={historyPageOpen} order={detail} history={history} canCreate={hasPermission("orders.history.create")} formatDate={fmtDate} onClose={onCloseSubpage} />
    {detail && <OrderChecklistsPage open={checklistsPageOpen} order={detail} canManage={hasPermission("orders.checklists.manage")} canReopen={hasPermission("orders.checklists.reopen")} onClose={onCloseSubpage} />}
    {partRequestsPageOpen && detail && <AdminPage open onClose={onCloseSubpage} breadcrumb={`Ordens de Serviço > ${detail.os_number || "OS"} > Solicitações de peças`} title="Solicitações de peças" subtitle="Acompanhe os pedidos e o fluxo das peças desta OS" maxW="max-w-2xl"><div className="p-5"><OrderPartRequestsSection requests={detailPartRequests} assignedTo={detail.assigned_to} currentUserId={userId} hasPermission={hasPermission} formatDate={fmtDate} getCommittedQuantity={getTestCommittedQuantity} getPendingQuantity={getTestPendingQuantity} onApprove={openPartApproval} onReject={openPartRejection} onDelivery={openDeliveryRequest} onTestResult={openTestResult} /></div><AdminStickyToolbar><BtnSecondary onClick={onCloseSubpage}>Voltar para a OS</BtnSecondary></AdminStickyToolbar></AdminPage>}
    {visible && !routedSubpageOpen && !solutionRecordsOpen && <AdminPage open onClose={closePage} breadcrumb="Ordens de Serviço" title={detail.os_number || "OS"} titleVariant="order-number" maxW="max-w-2xl">
      <div className="space-y-5 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2"><StatusBadge status={(detail.order_status as any)?.name || "—"} color={(detail.order_status as any)?.color} />{(detail.situation as any)?.name && <StatusBadge status={(detail.situation as any).name} color={(detail.situation as any)?.color} />}{detail.completed_at ? <span className="inline-flex items-center rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-bold uppercase text-white">✓ OS concluída</span> : detail.is_solved && <span className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={15} />OS solucionada</span>}</div>
          <div className="flex flex-wrap items-center gap-2 border-t border-[#0d1b2e]/10 pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
            {canPrintDocuments && <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="inline-flex items-center gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 py-2 text-xs font-bold text-[#0d1b2e] transition-colors hover:bg-[#f5f7fa]"><Printer size={14} /> Imprimir <ChevronDown size={13} /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-72"><DropdownMenuItem onSelect={event => { event.preventDefault(); printLabel(); }} className="flex cursor-pointer items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#eef5ff] text-[#0057e7]"><Tag size={15} /></span><span className="min-w-0"><span className="block truncate font-semibold">Etiqueta</span><span className="block text-[10px] text-[#5a6a82]">60 × 40 mm • QR para abrir a OS</span></span></DropdownMenuItem>{printTemplates.loading && <DropdownMenuItem disabled>Carregando modelos...</DropdownMenuItem>}{Boolean(printTemplates.error) && <DropdownMenuItem disabled className="text-red-600">Não foi possível carregar os modelos.</DropdownMenuItem>}{!printTemplates.loading && !printTemplates.error && printTemplates.templates.map(template => <DropdownMenuItem key={template.id} disabled={Boolean(printingTemplateId)} onSelect={event => { event.preventDefault(); void printTemplate(template); }} className="flex cursor-pointer items-center justify-between gap-4"><span className="min-w-0"><span className="block truncate font-semibold">{template.name}</span><span className="block text-[10px] text-[#5a6a82]">{PRINT_TEMPLATE_TYPE_LABELS[template.document_type] || template.document_type}</span></span>{printingTemplateId === template.id && <span className="shrink-0 text-[10px] font-bold text-[#0057e7]">Preparando...</span>}</DropdownMenuItem>)}{printError && <DropdownMenuItem disabled className="max-w-72 whitespace-normal text-red-600">{printError}</DropdownMenuItem>}{!printTemplates.loading && !printTemplates.error && printTemplates.templates.length === 0 && <DropdownMenuItem disabled>Nenhum outro modelo ativo.</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu>}
            {ORDER_EMAIL_ACTION_VISIBLE && canPrintDocuments && <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="inline-flex items-center gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 py-2 text-xs font-bold text-[#0d1b2e] transition-colors hover:bg-[#f5f7fa]"><Mail size={14} /> Enviar e-mail <ChevronDown size={13} /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-72">{printTemplates.loading && <DropdownMenuItem disabled>Carregando modelos...</DropdownMenuItem>}{Boolean(printTemplates.error) && <DropdownMenuItem disabled className="text-red-600">Não foi possível carregar os modelos.</DropdownMenuItem>}{!printTemplates.loading && !printTemplates.error && printTemplates.templates.map(template => <DropdownMenuItem key={template.id} disabled={Boolean(emailingTemplateId)} onSelect={event => { event.preventDefault(); void emailTemplate(template); }} className="flex cursor-pointer items-center justify-between gap-4"><span className="min-w-0"><span className="block truncate font-semibold">{template.name}</span><span className="block text-[10px] text-[#5a6a82]">{PRINT_TEMPLATE_TYPE_LABELS[template.document_type] || template.document_type}</span></span>{emailingTemplateId === template.id && <span className="shrink-0 text-[10px] font-bold text-[#0057e7]">Enviando...</span>}</DropdownMenuItem>)}{!printTemplates.loading && !printTemplates.error && printTemplates.templates.length === 0 && <DropdownMenuItem disabled>Nenhum modelo ativo.</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu>}
            {hasPermission("orders.section.checklists") && <OrderChecklistToolbarButton orderId={detail.id} onClick={() => onOpenSubpage("checklists")} />}
            {hasPermission("orders.section.parts") && <button type="button" onClick={() => onOpenSubpage("part-requests")} className="inline-flex items-center gap-2 rounded-lg border border-[#0057e7]/25 bg-[#f0f6ff] px-3 py-2 text-xs font-bold text-[#0057e7] transition-colors hover:bg-[#e2edff]"><PackagePlus size={14} /> Solicitações de peças{pendingPartRequests > 0 && <span title="Solicitações em aberto" className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-black text-amber-950">{pendingPartRequests}</span>}{completedPartRequests > 0 && <span title="Solicitações concluídas" className="inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-black text-white">{completedPartRequests}</span>}</button>}
            {canOpenDocumentsPage && <button type="button" onClick={() => onOpenSubpage("documents")} className="inline-flex items-center gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 py-2 text-xs font-bold text-[#0d1b2e] hover:bg-[#f5f7fa]"><FileText size={14} /> Documentos{visibleDocumentCount > 0 && <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#0057e7] px-1.5 py-0.5 text-[10px] text-white">{visibleDocumentCount}</span>}</button>}
            {hasPermission("orders.section.history") && <button type="button" onClick={() => onOpenSubpage("history")} className="inline-flex items-center gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 py-2 text-xs font-bold text-[#0d1b2e] hover:bg-[#f5f7fa]"><FileText size={14} /> Histórico{history.total > 0 && <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#0d1b2e] px-1.5 py-0.5 text-[10px] text-white">{history.total}</span>}</button>}
          </div>
        </div>
        {ORDER_EMAIL_ACTION_VISIBLE && emailMessage && <div className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs font-semibold ${emailMessage.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}><span>{emailMessage.text}</span><button type="button" onClick={() => setEmailMessage(null)} aria-label="Fechar aviso">×</button></div>}
        <div className="border-b border-border">
          <div className="flex min-w-0 gap-5 overflow-x-auto">
            <button type="button" onClick={() => setDetailSection("details")} className={`flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 pt-1 text-xs font-bold transition-colors ${detailSection === "details" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><FileText size={15} /> Detalhes da OS</button>
            <button type="button" onClick={() => setDetailSection("products-services")} className={`flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 pt-1 text-xs font-bold transition-colors ${detailSection === "products-services" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Package size={15} /> Produtos e Serviços</button>
          </div>
        </div>
        {detailSection === "products-services" ? <OrderProductsServicesSection
          order={detail}
          canEdit={hasPermission("orders.edit") || hasPermission("orders.update")}
          formatCurrency={formatCurrency}
          onPricingChange={pricing => details.setDetail((current: any) => current ? { ...current, ...pricing } : current)}
        /> : <>
          {hasPermission("orders.section.sla_cards") && <ServiceOrderSlaCards order={detail} slaHours={getSlaForOrder(detail.service_type_id, detail.situation_id, detail.situation)?.hours ?? null} visits={slaVisits.visits} onOpenRecords={() => onOpenSubpage("sla-records")} />}
          <OrderDetailsContent
            detail={detail}
            formatDate={fmtDate}
            formatState={stateLabel}
            getSla={getSlaForOrder}
            hasPermission={hasPermission}
            orderImages={orderImages}
            onViewImage={setViewImage}
            onWhatsApp={!monitorView && canSendSac
              ? () => void openCustomerWhatsApp()
              : undefined}
          />
          <OrderFinancialSummary detail={detail} formatCurrency={formatCurrency} />
          <OrderSolutionSummary detail={detail} usedItems={detailUsedItems} solutionImages={detailSolutionImages} usedItemsTotal={detailUsedItemsTotal} solutionCount={solutionCount} activeAttempt={activeSolutionAttempt} canUndo={!monitorView && hasPermission("orders.solve") && !detail.completed_at} formatSolvedAt={formatSolvedAt} formatCurrency={formatCurrency} onViewImage={setViewImage} onOpenRecords={openSolutionRecords} onUndo={openUndoSolution} />
        </>}
      </div>
      {monitorView ? <AdminStickyToolbar className="justify-between">
        <BtnSecondary onClick={closePage}>Voltar</BtnSecondary>
        <div className="flex items-center gap-2">
          {contactPhone && <AdminButton
            variant="secondary"
            title={monitorContact?.owner_name ? `Ligar para a empresa · proprietário: ${monitorContact.owner_name}` : "Ligar para a empresa"}
            aria-label="Ligar para a empresa parceira"
            onClick={() => { window.location.href = `tel:${contactPhone}`; }}
          >
            <Phone size={15} /> Ligar
          </AdminButton>}
          {contactWhatsapp && <BtnPrimary
            title={monitorContact?.owner_name ? `WhatsApp da empresa · proprietário: ${monitorContact.owner_name}` : "WhatsApp da empresa"}
            aria-label="Abrir WhatsApp da empresa parceira"
            onClick={() => { window.open(`https://wa.me/${contactWhatsapp}`, "_blank", "noopener,noreferrer"); }}
          >
            <MessageCircle size={15} /> WhatsApp
          </BtnPrimary>}
        </div>
      </AdminStickyToolbar> : <OrderDetailsActions detail={detail} statuses={statuses} situations={getSituationsForType(detail.service_type_id, detail.situation_id, detail.situation)} hasPermission={hasPermission} onClose={closePage} onStatusChange={statusId => updateOrderStatus(detail, statusId)} onSituationChange={situationId => { void updateOrderSituation(detail, situationId); }} onRequestParts={openPartRequestModal} onResolve={() => openSolveOrder(detail)} onComplete={openCompletion} onEdit={() => { void openEdit(detail); }} />}
    </AdminPage>}
  </>;
}
