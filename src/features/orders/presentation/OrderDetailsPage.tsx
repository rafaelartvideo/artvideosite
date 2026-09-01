import { FileText } from "lucide-react";
import { AdminPage } from "@/shared/ui/admin/AdminLayout";
import { OrderDetailsActions } from "./OrderDetailsActions";
import { OrderDetailsContent } from "./OrderDetailsContent";
import { OrderHistoryPage } from "./OrderHistoryPage";
import { OrderPartRequestsSection } from "./OrderPartRequestsSection";
import { OrderSolutionSummary } from "./OrderSolutionSummary";
import type { useOrderDetails } from "../application/useOrderDetails";
import type { useOrderImages } from "../application/useOrderImages";
import type { useOrderHistory } from "../application/useOrderHistory";
import type { useOrderListMutations } from "../application/useOrderListMutations";
import type { useOrderPartRequests } from "../application/useOrderPartRequests";
import type { useOrderResolution } from "../application/useOrderResolution";
import type { useOrdersWorkspace } from "../application/useOrdersWorkspace";

type PermissionCheck = (permission: string) => boolean;

type Props = {
  visible: boolean;
  userId?: string;
  profileName?: string | null;
  workspace: ReturnType<typeof useOrdersWorkspace>;
  details: ReturnType<typeof useOrderDetails>;
  history: ReturnType<typeof useOrderHistory>;
  images: ReturnType<typeof useOrderImages>;
  partRequests: ReturnType<typeof useOrderPartRequests>;
  resolution: ReturnType<typeof useOrderResolution>;
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
  onDelete: (orderId: string) => void;
};

export function OrderDetailsPage(props: Props) {
  const {
    visible, userId, profileName, workspace, details, history, images, partRequests,
    resolution, mutations, hasPermission, usedItemsTotal: detailUsedItemsTotal,
    formatDate: fmtDate, formatState: stateLabel, formatSolvedAt,
    formatCurrency, getSituations: getSituationsForType, getSla: getSlaForOrder,
    onEdit: openEdit, onDelete: setDeleteId,
  } = props;
  const { statuses, situations } = workspace;
  const {
    detail, detailHistory, detailUsedItems, detailSolutionImages, closeDetail,
  } = details;
  const { orderImages, setViewImage } = images;
  const {
    detailPartRequests, getTestCommittedQuantity, getTestPendingQuantity,
    openPartApproval, openPartRejection, openDeliveryRequest, openTestResult,
    openPartRequestModal,
  } = partRequests;
  const { solveOpen, openSolveOrder } = resolution;
  const { updateOrderStatus, updateOrderSituation } = mutations;

  return <>
      <OrderHistoryPage
        order={detail}
        history={history}
        canCreate={hasPermission("orders.history.create")}
        formatDate={fmtDate}
      />
{visible && !history.pageOpen && (
        <AdminPage open={true} onClose={() => closeDetail()} breadcrumb="Ordens de Serviço" title={detail.os_number || "Ordem de Serviço"} subtitle={(detail.service as any)?.title || "Ordem de Serviço"} maxW="max-w-2xl">
            <div className="p-5 space-y-5">
              {hasPermission("orders.section.history") && <div className="flex justify-end"><button type="button" onClick={() => history.setPageOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 py-2 text-xs font-bold text-[#0d1b2e] hover:bg-[#f5f7fa]"><FileText size={14} /> Histórico{history.total > 0 && <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#0d1b2e] px-1.5 py-0.5 text-[10px] text-white">{history.total}</span>}</button></div>}
              <OrderDetailsContent
                detail={detail}
                images={orderImages}
                history={detailHistory}
                formatDate={fmtDate}
                formatState={stateLabel}
                getSla={getSlaForOrder}
                onViewImage={setViewImage}
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
              onDelete={() => setDeleteId(detail.id)}
            />
        </AdminPage>
      )}
  </>;
}
