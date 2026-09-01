import { useState } from "react";
import { ChevronDown, FileText, PackagePlus, Printer } from "lucide-react";
import { AdminPage, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/primitives/dropdown-menu";
import { OrderDetailsActions } from "./OrderDetailsActions";
import { OrderDetailsContent } from "./OrderDetailsContent";
import { OrderHistoryPage } from "./OrderHistoryPage";
import { OrderDocumentsPage } from "./OrderDocumentsPage";
import { OrderPartRequestsSection } from "./OrderPartRequestsSection";
import { OrderSolutionSummary } from "./OrderSolutionSummary";
import { OrderFinancialSummary } from "./OrderFinancialSummary";
import { ServiceOrderSlaCards } from "./ServiceOrderSlaCards";
import type { useOrderDetails } from "../application/useOrderDetails";
import type { useOrderImages } from "../application/useOrderImages";
import type { useOrderHistory } from "../application/useOrderHistory";
import type { useOrderSituationDocuments } from "../application/useOrderSituationDocuments";
import type { useOrderListMutations } from "../application/useOrderListMutations";
import type { useOrderPartRequests } from "../application/useOrderPartRequests";
import type { useOrderResolution } from "../application/useOrderResolution";
import type { useOrderCompletion } from "../application/useOrderCompletion";
import type { useOrdersWorkspace } from "../application/useOrdersWorkspace";

type PermissionCheck = (permission: string) => boolean;

type Props = {
  visible: boolean;
  userId?: string;
  profileName?: string | null;
  workspace: ReturnType<typeof useOrdersWorkspace>;
  details: ReturnType<typeof useOrderDetails>;
  history: ReturnType<typeof useOrderHistory>;
  documents: ReturnType<typeof useOrderSituationDocuments>;
  documentsPageOpen: boolean;
  onDocumentsPageOpenChange: (open: boolean) => void;
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
    visible, userId, profileName, workspace, details, history, documents, documentsPageOpen, onDocumentsPageOpenChange, images, partRequests,
    resolution, completion, mutations, hasPermission, usedItemsTotal: detailUsedItemsTotal,
    formatDate: fmtDate, formatState: stateLabel, formatSolvedAt,
    formatCurrency, getSituations: getSituationsForType, getSla: getSlaForOrder,
    onEdit: openEdit, onClose,
  } = props;
  const [partRequestsPageOpen, setPartRequestsPageOpen] = useState(false);
  const { statuses, situations } = workspace;
  const {
    detail, detailUsedItems, detailSolutionImages, closeDetail,
  } = details;
  const { setViewImage } = images;
  const {
    detailPartRequests, getTestCommittedQuantity, getTestPendingQuantity,
    openPartApproval, openPartRejection, openDeliveryRequest, openTestResult,
    openPartRequestModal,
  } = partRequests;
  const { solveOpen, openSolveOrder } = resolution;
  const { openCompletion } = completion;
  const pendingPartRequests = detailPartRequests.filter(request => String(request.status || "").toUpperCase() === "PENDING").length;
  const completedPartRequests = detailPartRequests.length - pendingPartRequests;
  const { updateOrderStatus, updateOrderSituation } = mutations;
  const closePage = () => { closeDetail(); onClose?.(); };

  return <>
      <OrderDocumentsPage
        open={documentsPageOpen}
        order={detail}
        currentSituationId={detail?.situation_id}
        controller={documents}
        onClose={() => onDocumentsPageOpenChange(false)}
        onView={setViewImage}
      />
      <OrderHistoryPage
        order={detail}
        history={history}
        canCreate={hasPermission("orders.history.create")}
        formatDate={fmtDate}
      />
{partRequestsPageOpen && detail && !history.pageOpen && !documentsPageOpen && (
        <AdminPage open={true} onClose={() => setPartRequestsPageOpen(false)} breadcrumb={`Ordens de Serviço > ${detail.os_number || "OS"}`} title="Solicitações de peças" subtitle="Acompanhe os pedidos e o fluxo das peças desta OS" maxW="max-w-2xl">
          <div className="p-5">
            <OrderPartRequestsSection
              requests={detailPartRequests}
              assignedTo={detail.assigned_to}
              currentUserId={userId}
              hasPermission={hasPermission}
              formatDate={fmtDate}
              getCommittedQuantity={getTestCommittedQuantity}
              getPendingQuantity={getTestPendingQuantity}
              onApprove={openPartApproval}
              onReject={openPartRejection}
              onDelivery={openDeliveryRequest}
              onTestResult={openTestResult}
            />
          </div>
          <div className="sticky bottom-0 border-t border-[#0d1b2e]/8 bg-white px-5 py-4">
            <BtnSecondary onClick={() => setPartRequestsPageOpen(false)}>Voltar para a OS</BtnSecondary>
          </div>
        </AdminPage>
      )}
{visible && !history.pageOpen && !documentsPageOpen && !partRequestsPageOpen && (
        <AdminPage open={true} onClose={closePage} breadcrumb="Ordens de Serviço" title={detail.os_number || "Ordem de Serviço"} subtitle={(detail.service as any)?.title || "Ordem de Serviço"} maxW="max-w-2xl">
            <div className="p-5 space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={(detail.order_status as any)?.name || "—"} color={(detail.order_status as any)?.color} />
                  {(detail.situation as any)?.name && <StatusBadge status={(detail.situation as any).name} color={(detail.situation as any)?.color} />}
                  {detail.completed_at ? <span className="inline-flex items-center rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-bold uppercase text-white">✓ OS concluída</span> : detail.is_solved && <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-[10px] font-bold uppercase text-green-700">✓ OS solucionada</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-[#0d1b2e]/10 pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                  {(hasPermission("orders.toolbar.print_entry") || hasPermission("orders.toolbar.print_exit")) && <DropdownMenu>
                    <DropdownMenuTrigger asChild><button type="button" className="inline-flex items-center gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 py-2 text-xs font-bold text-[#0d1b2e] transition-colors hover:bg-[#f5f7fa]"><Printer size={14} /> Imprimir <ChevronDown size={13} /></button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-60">
                      {hasPermission("orders.toolbar.print_entry") && <DropdownMenuItem className="flex cursor-pointer items-center justify-between gap-4"><span>Entrada de equipamento</span><span className="text-[10px] font-bold uppercase text-[#5a6a82]">Em breve</span></DropdownMenuItem>}
                      {hasPermission("orders.toolbar.print_exit") && <DropdownMenuItem className="flex cursor-pointer items-center justify-between gap-4"><span>Saída de equipamento</span><span className="text-[10px] font-bold uppercase text-[#5a6a82]">Em breve</span></DropdownMenuItem>}
                    </DropdownMenuContent>
                  </DropdownMenu>}
                  {hasPermission("orders.section.parts") && <button type="button" onClick={() => setPartRequestsPageOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-[#0057e7]/25 bg-[#f0f6ff] px-3 py-2 text-xs font-bold text-[#0057e7] transition-colors hover:bg-[#e2edff]"><PackagePlus size={14} /> Solicitações de peças{pendingPartRequests > 0 && <span title="Solicitações em aberto" className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-black text-amber-950">{pendingPartRequests}</span>}{completedPartRequests > 0 && <span title="Solicitações concluídas" className="inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-black text-white">{completedPartRequests}</span>}</button>}
                  {hasPermission("orders.section.images") && <button type="button" onClick={() => onDocumentsPageOpenChange(true)} className="inline-flex items-center gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 py-2 text-xs font-bold text-[#0d1b2e] hover:bg-[#f5f7fa]"><FileText size={14} /> Documentos{documents.documents.length > 0 && <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#0057e7] px-1.5 py-0.5 text-[10px] text-white">{documents.documents.length}</span>}</button>}
                  {hasPermission("orders.section.history") && <button type="button" onClick={() => history.setPageOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 py-2 text-xs font-bold text-[#0d1b2e] hover:bg-[#f5f7fa]"><FileText size={14} /> Histórico{history.total > 0 && <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#0d1b2e] px-1.5 py-0.5 text-[10px] text-white">{history.total}</span>}</button>}
                </div>
              </div>
              {hasPermission("orders.section.sla_cards") && <ServiceOrderSlaCards order={detail} slaHours={getSlaForOrder(detail.service_type_id, detail.situation_id, detail.situation)?.hours ?? null} />}
              <OrderDetailsContent
                detail={detail}
                formatDate={fmtDate}
                formatState={stateLabel}
                getSla={getSlaForOrder}
                hasPermission={hasPermission}
              />
              <OrderFinancialSummary detail={detail} formatCurrency={formatCurrency} />
              <OrderSolutionSummary
                detail={detail}
                profileName={profileName}
                usedItems={detailUsedItems}
                solutionImages={detailSolutionImages}
                usedItemsTotal={detailUsedItemsTotal}
                formatSolvedAt={formatSolvedAt}
                formatCurrency={formatCurrency}
                onViewImage={setViewImage}
              />
            </div>
            <OrderDetailsActions
              detail={detail}
              statuses={statuses}
              situations={getSituationsForType(detail.service_type_id, detail.situation_id, detail.situation)}
              hasPermission={hasPermission}
              onClose={closePage}
              onStatusChange={(statusId) => updateOrderStatus(detail, statusId)}
              onSituationChange={(situationId) => { void updateOrderSituation(detail, situationId); }}
              onRequestParts={openPartRequestModal}
              onResolve={() => openSolveOrder(detail)}
              onComplete={openCompletion}
              onEdit={() => { closeDetail(); void openEdit(detail); }}
            />
        </AdminPage>
      )}
  </>;
}
