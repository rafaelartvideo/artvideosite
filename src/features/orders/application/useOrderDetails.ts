import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../../infrastructure/query/query-keys";
import { useAuth } from "@/lib/auth";
import { getServiceOrderWorkspace } from "../infrastructure/orders.repository";
import { orderImageKindFromSortOrder, type OrderImage } from "../domain/order-image";

export function useOrderDetails({
  loadPartRequests,
  replaceOrderImages,
  organizationIdOverride,
  loadPartRequestsEnabled = true,
}: {
  loadPartRequests: (orderId: string) => Promise<void>;
  replaceOrderImages: (images: OrderImage[]) => void;
  organizationIdOverride?: string | null;
  loadPartRequestsEnabled?: boolean;
}) {
  const { activeOrganizationId } = useAuth();
  const organizationId = organizationIdOverride || activeOrganizationId;
  const queryClient = useQueryClient();
  const [detail, setDetail] = useState<any>(null);
  const [detailHistory, setDetailHistory] = useState<any[]>([]);
  const [detailUsedItems, setDetailUsedItems] = useState<any[]>([]);
  const [detailSolutionImages, setDetailSolutionImages] = useState<OrderImage[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const selectedOrderBelongsToOrganization = Boolean(
    selectedOrder?.id &&
    organizationId &&
    selectedOrder?.organization_id === organizationId,
  );

  const detailQuery = useQuery({
    queryKey: [
      ...queryKeys.orders.detail(selectedOrder?.id || ""),
      organizationId || "none",
    ],
    enabled: selectedOrderBelongsToOrganization,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const workspace = await getServiceOrderWorkspace(organizationId!, selectedOrder.id);
      const mediaLinks = workspace.media || [];
      const orderImages = mediaLinks
        .filter((item: any) => Number(item.sort_order ?? 0) < 1000)
        .map((item: any) => ({
          key: item.id,
          mediaId: item.media_id,
          name: item.media?.file_name || "Imagem da OS",
          kind: orderImageKindFromSortOrder(item.sort_order),
        }));
      const solutionImages = mediaLinks
        .filter((item: any) => Number(item.sort_order ?? 0) >= 1000)
        .map((item: any) => ({
          key: item.id,
          mediaId: item.media_id,
          name: item.media?.file_name || "Imagem da solução",
          kind: "solution" as const,
        }));

      const partRequests = (workspace.part_requests || []).map((request: any) => ({
        ...request,
        requester: request.requested_by_profile || null,
        items: (request.items || []).map((item: any) => ({
          ...item,
          request_status: request.status,
          inventory_item: item.inventory_item ? {
            ...item.inventory_item,
            package_unit: item.inventory_item.unit || "un",
            unit: "un",
            conversion_factor: Math.max(1, Number(item.inventory_item.conversion_factor ?? 1) || 1),
            quantity: Number(item.inventory_item.quantity ?? 0),
          } : null,
        })),
      }));

      return {
        currentOrder: workspace.current_order || {},
        history: workspace.history || [],
        historyNotes: workspace.history_notes || [],
        usedItems: workspace.used_items || [],
        technicalValues: workspace.technical_values || [],
        orderImages,
        solutionImages,
        partRequests,
        situationDocuments: workspace.situation_documents || [],
        situationVisits: workspace.situation_visits || [],
      };
    },
  });

  useEffect(() => {
    if (!selectedOrder || selectedOrder.organization_id === organizationId) return;
    setDetail(null);
    setSelectedOrder(null);
    setDetailHistory([]);
    setDetailUsedItems([]);
    setDetailSolutionImages([]);
    replaceOrderImages([]);
  }, [organizationId, replaceOrderImages, selectedOrder]);

  useEffect(() => {
    if (!detailQuery.data || !selectedOrderBelongsToOrganization || !selectedOrder) return;
    const {
      currentOrder,
      history,
      historyNotes,
      usedItems,
      technicalValues,
      orderImages,
      solutionImages,
      partRequests,
      situationDocuments,
      situationVisits,
    } = detailQuery.data;

    queryClient.setQueryData(queryKeys.orders.partRequests(selectedOrder.id), partRequests);
    queryClient.setQueryData(["orders", "history-notes", selectedOrder.id], historyNotes);
    queryClient.setQueryData(
      ["orders", organizationId || "none", selectedOrder.id, "situation-documents"],
      situationDocuments,
    );
    queryClient.setQueryData(["orders", selectedOrder.id, "situation-visits"], situationVisits);

    setDetailHistory(history || []);
    setDetailUsedItems(usedItems || []);
    setDetailSolutionImages(solutionImages);
    replaceOrderImages(orderImages);
    setDetail({ ...selectedOrder, ...(currentOrder || {}), technical_values: technicalValues });
    if (loadPartRequestsEnabled) void loadPartRequests(selectedOrder.id);
  }, [detailQuery.data, selectedOrderBelongsToOrganization, loadPartRequestsEnabled, loadPartRequests]);

  const openDetail = (order: any) => {
    if (!organizationId || order?.organization_id !== organizationId) return;
    setSelectedOrder(order);
    setDetail(order);
  };

  const openFreshDetail = (order: any) => {
    if (!organizationId || order?.organization_id !== organizationId) return;
    queryClient.removeQueries({
      queryKey: [...queryKeys.orders.detail(order.id), organizationId],
      exact: true,
    });
    setSelectedOrder(order);
    setDetail(order);
  };

  const closeDetail = () => {
    setDetail(null);
    setSelectedOrder(null);
  };

  return {
    organizationId,
    detail,
    setDetail,
    detailHistory,
    detailUsedItems,
    setDetailUsedItems,
    detailSolutionImages,
    setDetailSolutionImages,
    openDetail,
    openFreshDetail,
    closeDetail,
  };
}
