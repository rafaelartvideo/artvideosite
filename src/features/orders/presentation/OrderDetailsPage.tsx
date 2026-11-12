import { WhatsAppBrandIcon } from "@/shared/ui/icons/WhatsAppBrandIcon";
import { getOrderStatusBadgeClass } from "../domain/order-status-palette";
import { STATUS_TONE_CLASSES } from "@/shared/domain/status-tone";
import { resolveMediaStorageUrl } from "@/shared/infrastructure/media.repository";
import { supabase } from "@/lib/supabase";
import { listOrderCommercialItems } from "../infrastructure/order-commercial-items.repository";
import { listOrderServiceTasks } from "../infrastructure/order-service-tasks.repository";
import { readOrderQuote } from "../infrastructure/order-quote.repository";
import { listOrderQuotePhotos } from "../infrastructure/order-quote-photos.repository";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { generatedFileName } from "@/shared/domain/generated-file-name";
import { getOrderChecklist } from "@/features/checklists/infrastructure/checklists.repository";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ChevronDown, Download, FileText, Mail, PackagePlus, Phone, Printer, Tag } from "lucide-react";
import { AdminButton, AdminPage, AdminStickyToolbar, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/primitives/dropdown-menu";
import { OrderChecklistsPage } from "@/features/checklists/presentation/OrderChecklistsPage";
import { OrderChecklistToolbarButton } from "@/features/checklists/presentation/OrderChecklistToolbarButton";
import { OrderDetailsActions } from "./OrderDetailsActions";
import { OrderCustomerDetailsSection, OrderDetailsContent, OrderEquipmentDetailsSection } from "./OrderDetailsContent";
import { OrderDetailSectionTabs } from "./OrderDetailSectionTabs";
import { OrderDetailsContentSkeleton } from "./OrdersSkeletons";
import { OrderHistoryPage } from "./OrderHistoryPage";
import { OrderDocumentsPage } from "./OrderDocumentsPage";
import { OrderSignatureRequestDialog } from "./OrderSignatureRequestDialog";
import { signatureRequestCreationFeedback } from "@/features/documents/domain/document-signature-feedback.mjs";
import { SignatureQrDialog } from "./SignatureQrDialog";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { OrderSituationRecordsPage } from "./OrderSituationRecordsPage";
import { OrderPartRequestsSection } from "./OrderPartRequestsSection";
import { OrderSolutionSummary } from "./OrderSolutionSummary";
import { OrderLifecycleTag } from "./OrderLifecycleTag";
import { OrderSolutionRecordsPage } from "./OrderSolutionRecordsPage";
import { OrderUndoSolutionDialog } from "./OrderUndoSolutionDialog";
import { OrderFinancialSummary } from "./OrderFinancialSummary";
import { ServiceOrderSlaCards } from "./ServiceOrderSlaCards";
import { OrderProductsServicesSection } from "./OrderProductsServicesSection";
import { OrderReturnSwitcher } from "./OrderReturnsPanel";
import { OrderReturnDiagnosisGate } from "./OrderReturnDiagnosisGate";
import { OrderQuoteWorkspace } from "./OrderQuoteWorkspace";
import { OrderQuoteStatusBadge, type OrderQuoteStatus } from "./OrderQuoteStatusBadge";
import { OrderSacDigitalDialog } from "@/features/sac-digital/presentation/OrderSacDigitalDialog";
import { useWhatsAppConversationModal, TESTE_WHATSAPP_OS_ORGANIZATION_ID } from "@/features/whatsapp-channels/presentation/WhatsAppConversationModal";
import { getSacDigitalIntegrationStatus } from "@/features/sac-digital/infrastructure/sac-digital.repository";
import { adminPath } from "@/features/admin-shell/admin-routes";
import { notifyPhoneCallIntegration, phoneContactLinks } from "../domain/order-contact-actions";
import { PRINT_TEMPLATE_TYPE_LABELS, type PrintTemplate } from "@/features/documents/domain/print-template";
import { buildOrderPrintDocumentHtml, openPrintWindow, renderOrderPrintDocument } from "@/features/documents/domain/order-print-document";
import { freezeOrderPrintPdf } from "@/features/documents/domain/order-print-pdf-freeze";
import { renderServiceOrderLabel } from "../domain/order-label-print";
import { createWarrantyCertificatePdfFile, issueWarrantyCertificate, loadWarrantyCertificate, printWarrantyCertificate } from "../application/order-warranty";
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
  transitionPending?: boolean;
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
  const navigate = useNavigate();
  const {
    visible, transitionPending = false, initialSection = "details", userId, profileName, workspace, details, history, documents, routeSubpage, onOpenSubpage, onCloseSubpage, images, partRequests,
    resolution, completion, mutations, hasPermission, usedItemsTotal: detailUsedItemsTotal,
    formatDate: fmtDate, formatState: stateLabel, formatSolvedAt,
    formatCurrency, getSituations: getSituationsForType, getSla: getSlaForOrder,
    onEdit: openEdit, onClose, monitorView = false, monitorContact = null,
  } = props;
  const queryClient = useQueryClient();
  const [printingTemplateId, setPrintingTemplateId] = useState<string | null>(null);
  const [downloadingTemplateId, setDownloadingTemplateId] = useState<string | null>(null);
  const [printingWarranty, setPrintingWarranty] = useState(false);
  const [emailingTemplateId, setEmailingTemplateId] = useState<string | null>(null);
  const [emailMessage, setEmailMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [solutionRecordsOpen, setSolutionRecordsOpen] = useState(false);
  const { detail, detailUsedItems, detailSolutionImages, closeDetail } = details;
  const [detailSection, setDetailSection] = useState<"products-services" | "details">(initialSection);
  const [showDelayedSwitchLoading, setShowDelayedSwitchLoading] = useState(false);
  // Trocas rápidas em cache não exibem spinner/overlay: evita uma piscada
  // desnecessária antes de os detalhes da próxima OS estarem prontos.
  useEffect(() => {
    if (!transitionPending) {
      setShowDelayedSwitchLoading(false);
      return;
    }
    const timer = window.setTimeout(() => setShowDelayedSwitchLoading(true), 180);
    return () => window.clearTimeout(timer);
  }, [transitionPending]);
  const showSwitchLoading = transitionPending && showDelayedSwitchLoading;
  const [itemsOverview, setItemsOverview] = useState<{ total: number; pending: number; inProgress: number; completed: number } | null>(null);
  // Identidade estável: ao atualizar o badge, a aba Produtos e Serviços não
  // deve interpretar o callback como uma nova solicitação de carregamento.
  const handleItemsOverviewChange = useCallback((overview: { total: number; pending: number; inProgress: number; completed: number }) => {
    if (!detail?.id) return;
    const same = (previous: typeof overview | null | undefined) => Boolean(previous
      && previous.total === overview.total
      && previous.pending === overview.pending
      && previous.inProgress === overview.inProgress
      && previous.completed === overview.completed);
    queryClient.setQueryData<typeof overview>(
      ["orders", "items-overview", detail.organization_id || "none", detail.id],
      current => same(current) ? current : overview,
    );
    setItemsOverview(current => same(current) ? current : overview);
  }, [detail?.id, detail?.organization_id, queryClient]);
  // Apenas uma assinatura por OS: na aba de itens, a própria seção atualiza
  // o resumo. Na aba de detalhes, mantemos o badge sincronizado.
  useEffect(() => {
    if (!visible || !detail?.id || detailSection !== "details") return;
    let cancelled = false;
    const key = ["orders", "items-overview", detail.organization_id || "none", detail.id] as const;
    const refresh = async () => {
      try {
        const overview = await queryClient.fetchQuery({
          queryKey: key,
          staleTime: 90_000,
          queryFn: async () => {
            const [commercial, tasks] = await Promise.all([
              listOrderCommercialItems(detail.id), listOrderServiceTasks(detail.id),
            ]);
            const statuses = new Map(tasks.map(task => [task.item_id, task.status]));
            const services = commercial.filter(item => item.item_type !== "product");
            return {
              total: commercial.length,
              pending: services.filter(item => !statuses.has(item.id) || statuses.get(item.id) === "pending" || statuses.get(item.id) === "cancelled").length,
              inProgress: services.filter(item => statuses.get(item.id) === "in_progress").length,
              completed: services.filter(item => statuses.get(item.id) === "completed").length,
            };
          },
        });
        if (!cancelled) setItemsOverview(overview);
      } catch { if (!cancelled) setItemsOverview(null); }
    };
    const cached = queryClient.getQueryData<typeof itemsOverview>(key);
    if (cached) setItemsOverview(cached);
    void refresh();
    const channel = supabase.channel("os-items-badge:" + detail.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "service_order_item_tasks", filter: "service_order_id=eq." + detail.id },
        () => {
          void queryClient.invalidateQueries({ queryKey: key, exact: true, refetchType: "none" }).then(refresh);
        })
      .subscribe();
    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [visible, detail?.id, detailSection, queryClient]);

  const itemBadge = itemsOverview
    ? itemsOverview.pending > 0
      ? { label: itemsOverview.pending + " pendente" + (itemsOverview.pending > 1 ? "s" : ""), style: STATUS_TONE_CLASSES.pending.badge }
      : itemsOverview.inProgress > 0
        ? { label: itemsOverview.inProgress + " em andamento", style: STATUS_TONE_CLASSES.progress.badge }
        : itemsOverview.completed > 0
          ? { label: itemsOverview.completed + " concluído" + (itemsOverview.completed > 1 ? "s" : ""), style: STATUS_TONE_CLASSES.success.badge }
          : itemsOverview.total > 0
            ? { label: itemsOverview.total + " itens", style: "border-slate-500/30 bg-slate-500/10 text-muted-foreground" }
            : null
    : null;

  const [sacMessageOpen, setSacMessageOpen] = useState(false);
  const { openWhatsAppConversation, closeWhatsAppConversation, whatsAppModal } = useWhatsAppConversationModal();
  const [checkingSac, setCheckingSac] = useState(false);
  const [sacEnabled, setSacEnabled] = useState(false);
  const canSendSac = hasPermission("sac_digital.messages.send");
  const canViewSac = hasPermission("sac_digital.view") && hasPermission("sac_digital.messages.view");
  const useTestWhatsAppModal = !monitorView && detail?.organization_id === TESTE_WHATSAPP_OS_ORGANIZATION_ID && hasPermission("whatsapp.inbox.view");
  const { statuses, situations } = workspace;
  // A rota já conhece o tipo da OS: não aguarde a carga ampla das
  // referências para reconhecer o orçamento e iniciar a consulta da proposta.
  // Retorno em outra peca usa o mesmo fluxo de orcamento e aprovacao,
  // independentemente de a OS original ter tipo de atendimento com orcamento.
  const returnDiagnosisActive = Boolean(detail?.return_root_id && detail.return_classification === "analysis");
  const generatesWarranty = Boolean(
    ((detail?.service_type as any)?.quote_workflow_enabled === true
     && (detail?.service_type as any)?.generates_warranty === true)
    || workspace.serviceTypes.some((type: any) =>
      type.id === detail?.service_type_id && type.quote_workflow_enabled === true && type.generates_warranty === true)
  );
  const returnRequiresQuote = Boolean(detail?.return_root_id &&
    ["unrelated", "not_covered"].includes(String(detail?.return_classification || "")));
  const quoteWorkflowEnabled = Boolean(!monitorView && detail?.service_type_id &&
    (returnRequiresQuote || (!detail?.return_root_id &&
      ((detail.service_type as any)?.quote_workflow_enabled === true ||
        workspace.serviceTypes.some((type: any) =>
          type.id === detail.service_type_id && type.quote_workflow_enabled === true)))));
  // A OS comum mantém suas ações. No fluxo de orçamento, só há execução
  // (solicitar peças / solucionar) quando a proposta vinculada for aprovada.
  const [quoteState, setQuoteState] = useState<{ orderId: string; status: OrderQuoteStatus } | null>(null);
  useEffect(() => {
    let active = true;
    setQuoteState(null);
    if (!quoteWorkflowEnabled || !detail?.id || !detail?.organization_id || !visible) return;
    const orderId = detail.id;
    void queryClient.fetchQuery({
      queryKey: ["orders", "quote", detail.organization_id, orderId],
      staleTime: 2 * 60_000,
      queryFn: () => readOrderQuote(detail.organization_id, orderId),
    }).then(quote => {
        if (active) setQuoteState(current => current?.orderId === orderId ? current : {
          orderId,
          status: quote?.status || null,
        });
      })
      .catch(error => {
        if (active) notifyAdmin("Não foi possível verificar a situação do orçamento: " + systemErrorMessage(error), "error");
      });
    return () => { active = false; };
  }, [quoteWorkflowEnabled, detail?.id, detail?.organization_id, visible, queryClient]);
  const quoteExecutionAllowed = !quoteWorkflowEnabled ||
    (quoteState?.orderId === detail?.id && quoteState.status === "approved");
  // Solucionar e concluir já pressupõem a aprovação: a tag fica redundante.
  // Mantemos o estado da proposta intacto para permissões, auditoria e execução.
  const showQuoteStatusBadge = quoteWorkflowEnabled && quoteState?.orderId === detail?.id &&
    !(quoteState.status === "approved" && (detail?.is_solved || detail?.completed_at));


  const effectiveRouteSubpage = routeSubpage;
  const canOpenDocumentsPage = hasPermission("orders.section.images") || hasPermission("documents.signatures.view");
  const historyPageOpen = Boolean(detail) && effectiveRouteSubpage === "history" && hasPermission("orders.section.history");
  const documentsPageOpen = Boolean(detail) && effectiveRouteSubpage === "documents" && canOpenDocumentsPage;
  const partRequestsPageOpen = Boolean(detail) && effectiveRouteSubpage === "part-requests" && hasPermission("orders.section.parts") && quoteExecutionAllowed;
  const slaRecordsPageOpen = Boolean(detail) && effectiveRouteSubpage === "sla-records" && hasPermission("orders.section.sla_cards");
  const checklistsPageOpen = Boolean(detail) && effectiveRouteSubpage === "checklists" && hasPermission("orders.section.checklists");
  const routedSubpageOpen = historyPageOpen || documentsPageOpen || partRequestsPageOpen || slaRecordsPageOpen || checklistsPageOpen;
  const routedSubpageDenied = Boolean(detail && (
    (effectiveRouteSubpage === "history" && !hasPermission("orders.section.history"))
    || (effectiveRouteSubpage === "documents" && !canOpenDocumentsPage)
    || (effectiveRouteSubpage === "part-requests" && (!hasPermission("orders.section.parts") || !quoteExecutionAllowed))
    || (effectiveRouteSubpage === "sla-records" && !hasPermission("orders.section.sla_cards"))
    || (effectiveRouteSubpage === "checklists" && !hasPermission("orders.section.checklists"))
  ));
  const slaVisits = useOrderSituationVisits(detail?.id, detail?.situation_id, detail?.situation_started_at);
  const { setViewImage, orderImages } = images;
  const solutionMediaIds = new Set(detailSolutionImages.map(image => image.mediaId).filter(Boolean));
  // A contagem leve chega sem aguardar os JOINs completos de anexos.
  // Quando os dados completos estão disponíveis, evita contar fotos duas vezes.
  const loadedDocumentCount = documents.documents.filter(document => !solutionMediaIds.has(document.media_id)).length + detailSolutionImages.length;
  const visibleDocumentCount = Math.max(loadedDocumentCount, documents.documentsCount ?? 0);
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
  const [signatureRequestOpen, setSignatureRequestOpen] = useState(false);
  const [signatureQrLink, setSignatureQrLink] = useState<string | null>(null);
  const printTemplates = useOrderPrintTemplates(canPrintDocuments || canUseSignatureDocuments);
  // O status da garantia vem do certificado registrado, não de uma suposição
  // baseada no tipo de atendimento ou na possibilidade de imprimir.
  const warrantyCertificateKey = ["orders", "warranty-certificate", detail?.organization_id, detail?.id];
  const warrantyCertificateQuery = useQuery({
    queryKey: warrantyCertificateKey,
    enabled: Boolean(visible && canPrintDocuments && generatesWarranty && detail?.completed_at && detail?.id && detail?.organization_id),
    queryFn: () => loadWarrantyCertificate(String(detail?.organization_id), String(detail?.id)),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
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
    closeWhatsAppConversation();
    setDetailSection(initialSection);
  }, [detail?.id, initialSection, closeWhatsAppConversation]);

  useEffect(() => {
    let alive = true;
    setSacEnabled(false);
    if (!detail?.organization_id || monitorView || !canSendSac) return;
    void getSacDigitalIntegrationStatus(detail.organization_id)
      .then(result => { if (alive) setSacEnabled(result.enabled === true); })
      .catch(() => { if (alive) setSacEnabled(false); });
    return () => { alive = false; };
  }, [detail?.organization_id, monitorView, canSendSac]);

  const openSacConversation = (externalProtocol?: string) => {
    const customerId = String(detail?.customer_id || "");
    if (!canViewSac || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(customerId)) return;
    // Sempre enviar a OS: ela valida o cliente e permite abrir o protocolo
    // exato mesmo quando pertence a outro Operador.
    const params = new URLSearchParams({ customer: customerId });
    if (detail?.id) params.set("order", detail.id);
    if (externalProtocol && /^[A-Za-z0-9_-]{3,80}$/.test(externalProtocol)) {
      params.set("protocol", externalProtocol);
    }
    const url = `${adminPath("tools", "sac-digital")}?${params.toString()}`;
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
    } catch (error) {
      // Não enviar pelo canal externo quando a consulta falhar: uma empresa
      // pode ter SAC ativo, e o erro não significa integração desativada.
      notifyAdmin(systemErrorMessage(error, "Não foi possível verificar a integração SAC Digital."), "error");
      return;
    } finally {
      setCheckingSac(false);
    }

    // A integração foi consultada com sucesso e está explicitamente desativada.
    window.open(external.whatsapp, "_blank", "noopener,noreferrer");
  };

  const openOrderWhatsApp = () => {
    if (!useTestWhatsAppModal || !detail) {
      void openCustomerWhatsApp();
      return;
    }
    const documentOptions = canPrintDocuments
      ? [
          ...(detail.completed_at && generatesWarranty
            ? [{ id: "warranty-certificate", label: "Certificado de garantia · PDF" }] : []),
          ...printTemplates.templates.filter(template => template.is_active).map(template => ({
            id: template.id,
            label: template.name + " · " + (PRINT_TEMPLATE_TYPE_LABELS[template.document_type] || template.document_type),
          })),
        ]
      : [];
    openWhatsAppConversation({
      organizationId: detail.organization_id,
      source: {
        kind: "order",
        orderId: detail.id,
        phone: String((detail.customer as any)?.whatsapp || (detail.customer as any)?.phone || ""),
        customerName: String((detail.customer as any)?.full_name || (detail.customer as any)?.trade_name || (detail.customer as any)?.legal_name || ""),
        documentOptions,
        prepareDocument: canPrintDocuments ? buildSacTemplateDocument : undefined,
      },
    });
  };

  const openSolutionRecords = () => {
    if (detail?.id) void loadSolutionAttempts(detail.id, detail.organization_id);
    setSolutionRecordsOpen(true);
  };

  const prepareTemplateDocument = async (template: PrintTemplate) => {
    if (!detail?.organization_id) throw new Error("A OS não possui empresa definida.");

    const [configuredTemplate, company] = await Promise.all([
      loadPrintTemplateEditorValue(template),
      getCompanyPrintContext(detail.organization_id),
    ]);
    const needsChecklist = [...configuredTemplate.selectedFields].some(key => key.startsWith("checklists."));
    if (needsChecklist && !hasPermission("orders.section.checklists")) {
      throw new Error("Você não possui permissão para imprimir os checklists desta OS.");
    }
    const quote = template.document_type==="ORCAMENTO" || [...configuredTemplate.selectedFields].some(key=>key.startsWith("quote."))
      ? await readOrderQuote(detail.organization_id,detail.id) : null;
    if (template.document_type==="ORCAMENTO" && (!quoteWorkflowEnabled || !quote || quote.status==="draft" || quote.status==="renegotiation"))
      throw new Error("Envie a proposta para aprovação antes de imprimir o orçamento.");

    const quotePhotos = template.document_type === "ORCAMENTO"
      ? await queryClient.fetchQuery({
          queryKey: ["orders", "quote-photos", detail.organization_id, detail.id],
          queryFn: () => listOrderQuotePhotos(detail.organization_id, detail.id),
          staleTime: 120_000,
        }) : [];

    // Print only CPF under signature lines. Keep customer and technician personal data scoped to their OS.
    let employeeCpf: string | null = null;
    if (configuredTemplate.selectedFields.has("signatures.employee")) {
      const employeeProfileId = detail.assigned_to
        || detail.technician_links?.[0]?.employee?.profile_id
        || detail.completed_by || null;
      if (employeeProfileId) {
        const { data: employeeRow } = await supabase.from("employees")
          .select("cpf").eq("organization_id",detail.organization_id)
          .eq("profile_id",employeeProfileId).maybeSingle();
        employeeCpf = employeeRow?.cpf || null;
      }
      employeeCpf ||= detail.technician_links?.[0]?.employee?.cpf || null;
    }
    const checklist = needsChecklist ? await getOrderChecklist(detail.id) : null;
    const checklistMedia = (checklist?.stages || [])
      .filter(stage => configuredTemplate.selectedFields.has("checklists." + stage.stage_type_snapshot))
      .flatMap(stage => stage.items.flatMap(item => item.media.flatMap(link => link.media ? [link] : [])));
    const checklistPhotoUrls = Object.fromEntries(await Promise.all(
      checklistMedia.map(async link => [
        link.media_id,
        await resolveMediaStorageUrl(link.media!.bucket_id, link.media!.storage_path, 3600, queryClient),
      ] as const),
    ));

    return {
      configuredTemplate,
      context: {
        order: detail,
        quote,
        quotePhotos,
        checklist,
        checklistPhotoUrls,
        usedItems: detailUsedItems,
        partRequests: detailPartRequests,
        history: details.detailHistory,
        printedBy: profileName,
        employeeCpf,
        company,
      },
    };
  };

  const buildSacTemplateDocument = async (templateId: string) => {
    if(templateId==="warranty-certificate") {
      if(!generatesWarranty) throw new Error("Este tipo de atendimento não emite certificado de garantia.");
      if(!detail?.completed_at || !canPrintDocuments) throw new Error("O certificado só pode ser enviado para OS concluída, com permissão para imprimir.");
      const certificate=await loadWarrantyCertificate(detail.organization_id,detail.id);
      if(!certificate) throw new Error("Certificado ainda não emitido. Emita-o explicitamente nos detalhes da OS.");
      return createWarrantyCertificatePdfFile(certificate,String(detail.os_number||"OS"));
    }
    const template = printTemplates.templates.find(item => item.id === templateId);
    if (!template) throw new Error("Documento não encontrado ou não está mais ativo.");
    const prepared = await prepareTemplateDocument(template);
    const frozen = await freezeOrderPrintPdf(prepared.configuredTemplate, prepared.context);
    return new File([frozen.blob], generatedFileName(template.name || "Documento", detail?.os_number || "OS"), { type: "application/pdf" });
  };

  const printTemplate = async (template: PrintTemplate) => {
    if (printingTemplateId) return;
    const popup = openPrintWindow();
    if (!popup) {
      notifyAdmin("O navegador bloqueou a janela de impressão. Permita pop-ups para este site.", "error");
      return;
    }

    setPrintingTemplateId(template.id);
    try {
      const prepared = await prepareTemplateDocument(template);
      renderOrderPrintDocument(popup, prepared.configuredTemplate, prepared.context);
    } catch (error) {
      popup.close();
      notifyAdmin(systemErrorMessage(error, "Não foi possível preparar o documento."), "error");
    } finally {
      setPrintingTemplateId(null);
    }
  };

  const downloadTemplate = async (template: PrintTemplate) => {
    if (downloadingTemplateId) return;
    setDownloadingTemplateId(template.id);

    try {
      const prepared = await prepareTemplateDocument(template);
      const frozen = await freezeOrderPrintPdf(prepared.configuredTemplate, prepared.context);
      const downloadName = generatedFileName(template.name || "Documento", detail?.os_number || "OS");
      const objectUrl = URL.createObjectURL(frozen.blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = downloadName;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível baixar o documento."), "error");
    } finally {
      setDownloadingTemplateId(null);
    }
  };

  const issueWarranty = async () => {
    if (!generatesWarranty || !detail?.completed_at || printingWarranty || !hasPermission("orders.complete")) return;
    setPrintingWarranty(true);
    try {
      // Revalida no banco para não emitir duas vezes ao usar outra sessão.
      const existing = await loadWarrantyCertificate(detail.organization_id, detail.id);
      const certificate = existing || await issueWarrantyCertificate(detail.organization_id, detail.id, null);
      queryClient.setQueryData(["orders", "warranty-certificate", detail.organization_id, detail.id], certificate);
      notifyAdmin(existing ? "Certificado já registrado para esta OS." : "Certificado de garantia emitido com sucesso.", "success");
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível emitir o certificado de garantia."), "error");
    } finally { setPrintingWarranty(false); }
  };

  const printWarranty = async () => {
    if (!generatesWarranty || !detail?.completed_at || printingWarranty || !canPrintDocuments) return;
    // A impressão nunca gera um certificado. Emissão é uma ação explícita.
    const popup = openPrintWindow();
    if (!popup) {
      notifyAdmin("Permita pop-ups para imprimir o certificado de garantia.", "error");
      return;
    }
    setPrintingWarranty(true);
    try {
      const certificate = await loadWarrantyCertificate(detail.organization_id, detail.id);
      if (!certificate) {
        queryClient.setQueryData(["orders", "warranty-certificate", detail.organization_id, detail.id], null);
        throw new Error("Certificado não emitido. Use a ação Emitir certificado antes de imprimir.");
      }
      queryClient.setQueryData(["orders", "warranty-certificate", detail.organization_id, detail.id], certificate);
      await printWarrantyCertificate(certificate, popup);
    } catch (error) {
      popup.close();
      notifyAdmin(systemErrorMessage(error, "Não foi possível imprimir o certificado de garantia."), "error");
    } finally { setPrintingWarranty(false); }
  };

  const printLabel = () => {
    const showError = (message: string) => notifyAdmin(message, "error");
    if (!detail?.os_number) {
      showError("Não foi possível montar a etiqueta desta OS.");
      return;
    }

    const popup = openPrintWindow();
    if (!popup) {
      showError("O navegador bloqueou a janela de impressão. Permita pop-ups para este site.");
      return;
    }

    try {
      renderServiceOrderLabel(popup, detail);
    } catch (error) {
      popup.close();
      showError(systemErrorMessage(error, "Não foi possível preparar a etiqueta."));
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
          await resolveMediaStorageUrl(link.media!.bucket_id, link.media!.storage_path, 3600, queryClient),
        ] as const),
      ));
      const html = buildOrderPrintDocumentHtml(configuredTemplate, { order: detail, checklist, checklistPhotoUrls, usedItems: detailUsedItems, partRequests: detailPartRequests, history: details.detailHistory, printedBy: profileName, company });
      const result = await sendOrderDocumentEmail({ orderId: detail.id, documentName: template.name, documentHtml: html });
      setEmailMessage({ text: `Documento enviado para ${result.recipient}.`, type: "success" });
    } catch (error) { setEmailMessage({ text: systemErrorMessage(error, "Não foi possível enviar o documento."), type: "error" }); }
    finally { setEmailingTemplateId(null); }
  };

  const closePage = () => {
    setSolutionRecordsOpen(false);
    // A rota controla o encerramento; não limpe a OS antes da navegação,
    // pois isso monta um carregamento intermediário durante o fechamento.
    if (onClose) onClose();
    else closeDetail();
  };

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
        documentTemplates={canPrintDocuments ? printTemplates.templates : []}
        onBuildDocument={canPrintDocuments ? buildSacTemplateDocument : undefined}
      />
    )}
    {whatsAppModal}
    {detail && !monitorView && signatureRequestOpen && <OrderSignatureRequestDialog
      open={signatureRequestOpen}
      order={detail}
      templates={printTemplates.templates}
      usedItems={detailUsedItems}
      partRequests={detailPartRequests}
      history={details.detailHistory}
      printedBy={profileName}
      onClose={() => setSignatureRequestOpen(false)}
      onCreated={result => {
        if (result.link) setSignatureQrLink(result.link);
        const feedback = signatureRequestCreationFeedback(result);
        notifyAdmin(feedback.message, feedback.type);
      }}
    />}
    <SignatureQrDialog link={signatureQrLink} onClose={() => setSignatureQrLink(null)} />
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
    {visible && !routedSubpageOpen && !solutionRecordsOpen && <AdminPage open onClose={closePage} smoothMotion={false} breadcrumb="Ordens de Serviço" title={detail.os_number || "OS"} titleVariant="order-number" maxW="max-w-[1440px]">
      <div className="space-y-5 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2"><OrderReturnSwitcher order={detail} /><span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${getOrderStatusBadgeClass((detail.order_status as any)?.name)}`}>{(detail.order_status as any)?.name || "—"}</span>{!returnDiagnosisActive && (detail.situation as any)?.name && <StatusBadge status={(detail.situation as any).name} color={(detail.situation as any)?.color} />}{showQuoteStatusBadge && <OrderQuoteStatusBadge status={quoteState!.status} />}{detail.completed_at ? <OrderLifecycleTag status="completed" /> : detail.is_solved ? <OrderLifecycleTag status="solved" /> : null}</div>
          <div className="flex w-full min-w-0 flex-col gap-2 border-t border-border pt-3 sm:w-auto sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0 md:flex-row md:flex-wrap md:items-center">
            <div className="flex w-full min-w-0 flex-nowrap gap-2 md:w-auto md:flex-wrap">
              {canPrintDocuments && <div className="min-w-0 flex-1 md:flex-none"><DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#0d1b2e]/15 bg-white px-3 py-2 text-xs font-bold text-[#0d1b2e] transition-colors hover:bg-[#f5f7fa]"><Printer size={14} /> Imprimir <ChevronDown size={13} /></button></DropdownMenuTrigger><DropdownMenuContent align="start" collisionPadding={12} className="w-[calc(100vw-2rem)] max-w-[23rem] min-w-0 overflow-x-hidden"><DropdownMenuItem onSelect={event => { event.preventDefault(); printLabel(); }} className="flex min-w-0 cursor-pointer items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#eef5ff] text-[#0057e7]"><Tag size={15} /></span><span className="min-w-0 flex-1"><span className="block truncate font-semibold">Etiqueta</span><span className="block truncate text-[10px] text-[#5a6a82]">Elgin L-42 • 3 colunas • medidas ajustáveis</span></span></DropdownMenuItem>{detail.completed_at && generatesWarranty && <DropdownMenuItem
              onSelect={event => { event.preventDefault(); if (warrantyCertificateQuery.data) void printWarranty(); else if (!warrantyCertificateQuery.isPending && !warrantyCertificateQuery.isError) void issueWarranty(); }}
              disabled={printingWarranty || warrantyCertificateQuery.isPending || warrantyCertificateQuery.isError || (!warrantyCertificateQuery.data && !hasPermission("orders.complete"))} className="flex min-w-0 cursor-pointer items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#eef5ff] text-[#0057e7]"><FileText size={15}/></span>
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{printingWarranty ? "Preparando certificado..." : warrantyCertificateQuery.isPending ? "Consultando certificado..." : warrantyCertificateQuery.isError ? "Falha ao consultar certificado" : warrantyCertificateQuery.data ? "Imprimir certificado de garantia" : "Emitir certificado de garantia"}</span><span className="block truncate text-[10px] text-[#5a6a82]">{warrantyCertificateQuery.data ? "Emitido · válido até " + new Date(warrantyCertificateQuery.data.expires_at + "T12:00:00").toLocaleDateString("pt-BR") : warrantyCertificateQuery.isPending ? "Consultando registro no banco..." : warrantyCertificateQuery.isError ? "Feche e reabra a OS para consultar novamente" : "Ainda não emitido · exige permissão para concluir OS"}</span></span>
            </DropdownMenuItem>}{printTemplates.loading && <DropdownMenuItem disabled>Carregando modelos...</DropdownMenuItem>}{Boolean(printTemplates.error) && <DropdownMenuItem disabled className="text-red-600">Não foi possível carregar os modelos.</DropdownMenuItem>}{!printTemplates.loading && !printTemplates.error && printTemplates.templates.filter(template => quoteWorkflowEnabled || template.document_type !== "ORCAMENTO").map(template => {
              const printingThis = printingTemplateId === template.id;
              const downloadingThis = downloadingTemplateId === template.id;
              const busy = Boolean(printingTemplateId || downloadingTemplateId);
              return <div key={template.id} className="flex w-full min-w-0 items-center gap-1.5 rounded-sm px-1.5 py-1.5 text-sm text-popover-foreground outline-none transition-colors hover:bg-muted/75 focus-within:bg-muted/60 dark:hover:bg-accent dark:focus-within:bg-accent">
                <div className="min-w-0 flex-1 overflow-hidden px-1">
                  <span className="line-clamp-2 break-words text-xs font-semibold leading-5" title={template.name}>{template.name}</span>
                  <span className="block truncate text-[10px] text-[#5a6a82]">{PRINT_TEMPLATE_TYPE_LABELS[template.document_type] || template.document_type}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1 border-l border-border pl-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void printTemplate(template)}
                  aria-label={`Imprimir ${template.name}`}
                  title="Imprimir"
                  className="inline-flex h-10 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-primary disabled:opacity-45"
                >
                  <Printer size={15} />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void downloadTemplate(template)}
                  aria-label={`Baixar ${template.name} em PDF`}
                  title="Baixar PDF"
                  className="inline-flex h-10 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-primary disabled:opacity-45"
                >
                  <Download size={15} />
                </button>
                </div>
                {(printingThis || downloadingThis) && <span className="sr-only" aria-live="polite">{printingThis ? "Preparando impressão" : "Preparando download"}</span>}
              </div>;
            })}{!printTemplates.loading && !printTemplates.error && printTemplates.templates.length === 0 && <DropdownMenuItem disabled>Nenhum outro modelo ativo.</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></div>}
              {!returnDiagnosisActive && hasPermission("orders.section.parts") && quoteExecutionAllowed && <div className="min-w-0 flex-1 md:flex-none"><button type="button" onClick={() => onOpenSubpage("part-requests")} className="admin-action-blue-outline inline-flex w-full min-w-0 items-center justify-center gap-1.5 rounded-lg border px-1.5 py-2 text-[10px] sm:px-3 sm:text-xs font-bold transition-colors"><PackagePlus size={14} /> Solicitações de peças{pendingPartRequests > 0 && <span title="Solicitações em aberto" className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-black text-amber-950">{pendingPartRequests}</span>}{completedPartRequests > 0 && <span title="Solicitações concluídas" className="inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-black text-white">{completedPartRequests}</span>}</button></div>}
            </div>
            <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 md:flex md:w-auto md:flex-wrap">
              {hasPermission("orders.section.checklists") && <div className="col-span-2 min-w-0 sm:col-span-1 [&_button]:w-full md:[&_button]:w-auto"><OrderChecklistToolbarButton orderId={detail.id} onClick={() => onOpenSubpage("checklists")} /></div>}
              {!returnDiagnosisActive && canOpenDocumentsPage && <div className="min-w-0 [&_button]:w-full md:[&_button]:w-auto"><button type="button" onClick={() => onOpenSubpage("documents")} className="inline-flex min-h-10 w-full min-w-0 items-center justify-center gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-2 py-2.5 text-xs font-bold text-[#0d1b2e] hover:bg-[#f5f7fa] md:px-3"><FileText size={17} className="shrink-0" /> Documentos{visibleDocumentCount > 0 && <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-[#0057e7] px-1.5 py-0.5 text-[10px] text-white">{visibleDocumentCount}</span>}</button></div>}
              {hasPermission("orders.section.history") && <div className="min-w-0 [&_button]:w-full md:[&_button]:w-auto"><button type="button" onClick={() => onOpenSubpage("history")} className="inline-flex min-h-10 w-full min-w-0 items-center justify-center gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-2 py-2.5 text-xs font-bold text-[#0d1b2e] hover:bg-[#f5f7fa] md:px-3"><FileText size={17} className="shrink-0" /> Histórico{history.total > 0 && <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-[#0d1b2e] px-1.5 py-0.5 text-[10px] text-white">{history.total}</span>}</button></div>}
            </div>
            {ORDER_EMAIL_ACTION_VISIBLE && canPrintDocuments && <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="inline-flex items-center gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 py-2 text-xs font-bold text-[#0d1b2e] transition-colors hover:bg-[#f5f7fa]"><Mail size={14} /> Enviar e-mail <ChevronDown size={13} /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-72">{printTemplates.loading && <DropdownMenuItem disabled>Carregando modelos...</DropdownMenuItem>}{Boolean(printTemplates.error) && <DropdownMenuItem disabled className="text-red-600">Não foi possível carregar os modelos.</DropdownMenuItem>}{!printTemplates.loading && !printTemplates.error && printTemplates.templates.map(template => <DropdownMenuItem key={template.id} disabled={Boolean(emailingTemplateId)} onSelect={event => { event.preventDefault(); void emailTemplate(template); }} className="flex cursor-pointer items-center justify-between gap-4"><span className="min-w-0"><span className="block truncate font-semibold">{template.name}</span><span className="block text-[10px] text-[#5a6a82]">{PRINT_TEMPLATE_TYPE_LABELS[template.document_type] || template.document_type}</span></span>{emailingTemplateId === template.id && <span className="shrink-0 text-[10px] font-bold text-[#0057e7]">Enviando...</span>}</DropdownMenuItem>)}{!printTemplates.loading && !printTemplates.error && printTemplates.templates.length === 0 && <DropdownMenuItem disabled>Nenhum modelo ativo.</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu>}
          </div>
        </div>
        {ORDER_EMAIL_ACTION_VISIBLE && emailMessage && <div className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs font-semibold ${emailMessage.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}><span>{emailMessage.text}</span><button type="button" onClick={() => setEmailMessage(null)} aria-label="Fechar aviso">×</button></div>}
        {!returnDiagnosisActive && <OrderDetailSectionTabs
          value={detailSection}
          onChange={setDetailSection}
          itemBadge={quoteWorkflowEnabled ? null : itemBadge}
          commercialLabel={quoteWorkflowEnabled ? "Orçamento" : "Produtos e Serviços"}
          commercialActionsHostId={quoteWorkflowEnabled && detailSection === "products-services" ? "os-quote-actions-" + detail.id : undefined}
        />}
        {showSwitchLoading
          ? <OrderDetailsContentSkeleton section={detailSection} returnDiagnosis={returnDiagnosisActive} />
          : returnDiagnosisActive
          ? <>
              <OrderCustomerDetailsSection
                detail={detail}
                hasPermission={hasPermission}
                onSendSignature={!monitorView && hasPermission("documents.signatures.send") ? () => setSignatureRequestOpen(true) : undefined}
                onWhatsApp={!monitorView && (useTestWhatsAppModal || canSendSac) ? openOrderWhatsApp : undefined}
              />
              <OrderEquipmentDetailsSection detail={detail} hasPermission={hasPermission}
                orderImages={orderImages} onViewImage={setViewImage} />
              <OrderReturnDiagnosisGate
              order={detail}
              footerHostId={"os-return-diagnosis-toolbar-" + detail.id}
              canClassify={!monitorView && (hasPermission("orders.edit") || hasPermission("orders.update"))}
              onClassified={(kind, diagnosis, solution) => {
                details.setDetail((current: any) => current?.id === detail.id
                  ? { ...current, diagnosis, solution, return_classification: kind === "same_part" ? "covered" : "unrelated" }
                  : current);
                setDetailSection(kind === "different_part" ? "products-services" : "details");
                // Persiste a nova etapa imediatamente e reconcilia com os dados
                // completos do banco sem exigir recarregar a OS manualmente.
                void details.retryDetailLoad();
              }}
              />
            </>
          : <>

        {detailSection === "products-services" && quoteWorkflowEnabled ? <OrderQuoteWorkspace
          order={detail}
          canEdit={!monitorView && (hasPermission("orders.edit") || hasPermission("orders.update"))}
          canManagePhotos={!monitorView && hasPermission("orders.section.images")}
          canRemovePhotos={!monitorView && hasPermission("orders.documents.remove")}
          onPricingChange={pricing => details.setDetail((current: any) => current ? { ...current, ...pricing } : current)}
          onOverviewChange={handleItemsOverviewChange}
          footerHostId={"os-quote-toolbar-" + detail.id}
          actionsHostId={"os-quote-actions-" + detail.id}
          onStatusChange={status => setQuoteState({ orderId: detail.id, status })}
        /> : detailSection === "products-services" ? <OrderProductsServicesSection
          order={detail}
          canEdit={!monitorView && !detail.completed_at && !detail.cancelled_at && (hasPermission("orders.edit") || hasPermission("orders.update"))}
          formatCurrency={formatCurrency}
          onPricingChange={pricing => details.setDetail((current: any) => current ? { ...current, ...pricing } : current)}
          onOverviewChange={handleItemsOverviewChange}
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
            onSendSignature={!monitorView && hasPermission("documents.signatures.send") ? () => setSignatureRequestOpen(true) : undefined}
            onWhatsApp={!monitorView && (useTestWhatsAppModal || canSendSac)
              ? openOrderWhatsApp
              : undefined}
          />
          <OrderFinancialSummary detail={detail} formatCurrency={formatCurrency} />
          <OrderSolutionSummary detail={detail} usedItems={detailUsedItems} solutionImages={detailSolutionImages} usedItemsTotal={detailUsedItemsTotal} solutionCount={solutionCount} activeAttempt={activeSolutionAttempt} canUndo={!monitorView && hasPermission("orders.solve") && !detail.completed_at} formatSolvedAt={formatSolvedAt} formatCurrency={formatCurrency} onViewImage={setViewImage} onOpenRecords={openSolutionRecords} onUndo={openUndoSolution} />
        </>}
        </>}
      </div>
      {monitorView ? <AdminStickyToolbar className="justify-between">
        <BtnSecondary onClick={closePage}>Voltar</BtnSecondary>
        <div className="flex items-center gap-2">
          {contactPhone && <AdminButton
            variant="secondary"
            title={monitorContact?.owner_name ? `Ligar para a empresa · proprietário: ${monitorContact.owner_name}` : "Ligar para a empresa"}
            aria-label="Ligar para a empresa parceira"
            onClick={() => { if (!notifyPhoneCallIntegration(phoneContactLinks(contactPhone).phone, detail.id)) window.location.href = `tel:${contactPhone}`; }}
          >
            <Phone size={15} /> Ligar
          </AdminButton>}
          {contactWhatsapp && <BtnPrimary
            title={monitorContact?.owner_name ? `WhatsApp da empresa · proprietário: ${monitorContact.owner_name}` : "WhatsApp da empresa"}
            aria-label="Abrir WhatsApp da empresa parceira"
            onClick={() => { window.open(`https://wa.me/${contactWhatsapp}`, "_blank", "noopener,noreferrer"); }}
          >
            <WhatsAppBrandIcon size={15} /> WhatsApp
          </BtnPrimary>}
        </div>
      </AdminStickyToolbar> : <OrderDetailsActions
        detail={detail}
        statuses={statuses}
        situations={getSituationsForType(detail.service_type_id, detail.situation_id, detail.situation)}
        hasPermission={hasPermission}
        onClose={closePage}
        onStatusChange={statusId => updateOrderStatus(detail, statusId)}
        onSituationChange={situationId => { void updateOrderSituation(detail, situationId); }}
        onRequestParts={openPartRequestModal}
        onResolve={() => openSolveOrder(detail)}
        onComplete={openCompletion}
        onEdit={() => { void openEdit(detail); }}
        quoteMode={quoteWorkflowEnabled && detailSection === "products-services" && !quoteExecutionAllowed}
        quoteExecutionAllowed={quoteExecutionAllowed}
        quoteFooterHostId={quoteWorkflowEnabled && detailSection === "products-services" && !quoteExecutionAllowed ? "os-quote-toolbar-" + detail.id : undefined}
      />}
    </AdminPage>}
  </>;
}
