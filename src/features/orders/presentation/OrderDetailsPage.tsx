import { FileText } from "lucide-react";
import { AdminPage } from "@/shared/ui/admin/AdminLayout";
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
};

export function OrderDetailsPage(props: Props) {
  const {
    visible, userId, profileName, workspace, details, history, documents, documentsPageOpen, onDocumentsPageOpenChange, images, partRequests,
    resolution, completion, mutations, hasPermission, usedItemsTotal: detailUsedItemsTotal,
    formatDate: fmtDate, formatState: stateLabel, formatSolvedAt,
    formatCurrency, getSituations: getSituationsForType, getSla: getSlaForOrder,
    onEdit: openEdit,
  } = props;
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
  const { updateOrderStatus, updateOrderSituation } = mutations;

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
{visible && !history.pageOpen && !documentsPageOpen && (
        <AdminPage open={true} onClose={() => closeDetail()} breadcrumb="Ordens de Serviço" title={detail.os_number || "Ordem de Serviço"} subtitle={(detail.service as any)?.title || "Ordem de Serviço"} maxW="max-w-2xl">
            <div className="p-5 space-y-5">
              <div className="flex flex-wrap justify-end gap-2">
                {hasPermission("orders.section.images") && <button type="button" onClick={() => onDocumentsPageOpenChange(true)} className="inline-flex items-center gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 py-2 text-xs font-bold text-[#0d1b2e] hover:bg-[#f5f7fa]"><FileText size={14} /> Documentos{documents.documents.length > 0 && <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#0057e7] px-1.5 py-0.5 text-[10px] text-white">{documents.documents.length}</span>}</button>}
                {hasPermission("orders.section.history") && <button type="button" onClick={() => history.setPageOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 py-2 text-xs font-bold text-[#0d1b2e] hover:bg-[#f5f7fa]"><FileText size={14} /> Histórico{history.total > 0 && <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#0d1b2e] px-1.5 py-0.5 text-[10px] text-white">{history.total}</span>}</button>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {detail.completed_at ? <span className="inline-flex items-center rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-bold uppercase text-white">✓ OS concluída</span> : detail.is_solved && <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-[10px] font-bold uppercase text-green-700">✓ OS solucionada</span>}
              </div>
              {hasPermission("orders.section.sla_cards") && <ServiceOrderSlaCards order={detail} slaHours={getSlaForOrder(detail.service_type_id, detail.situation_id, detail.situation)?.hours ?? null} />}
              <OrderDetailsContent
                detail={detail}
                formatDate={fmtDate}
                formatState={stateLabel}
                getSla={getSlaForOrder}
                hasPermission={hasPermission}
              />
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
              onClose={() => closeDetail()}
              onStatusChange={(statusId) => updateOrderStatus(detail, statusId)}
              onSituationChange={(situationId) => { void updateOrderSituation(detail, situationId); }}
              onRequestParts={openPartRequestModal}
              onResolve={() => openSolveOrder(detail)}
              onEdit={() => { closeDetail(); void openEdit(detail); }}
            />
        </AdminPage>
      )}
  </>;
}
