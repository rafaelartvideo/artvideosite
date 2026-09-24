import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../../infrastructure/query/query-keys";
import { useAuth } from "@/lib/auth";
import {
  getServiceOrderDetail,
  listServiceOrderMedia,
  listServiceOrderStatusHistory,
  listServiceOrderUsedItems,
  listServiceOrderTechnicalValues,
} from "../infrastructure/orders.repository";
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
    staleTime: 30_000,
    queryFn: async () => {
      const [
        { data: currentOrder },
        { data: history },
        { data: mediaLinks },
        { data: usedItems },
        { data: technicalValues },
      ] = await Promise.all([
        getServiceOrderDetail(selectedOrder.id),
        listServiceOrderStatusHistory(selectedOrder.id),
        listServiceOrderMedia(selectedOrder.id),
        listServiceOrderUsedItems(selectedOrder.id),
        listServiceOrderTechnicalValues(selectedOrder.id),
      ]);

      const orderImages = (mediaLinks || [])
        .filter((item: any) => Number(item.sort_order ?? 0) < 1000)
        .map((item: any) => ({
          key: item.id,
          mediaId: item.media_id,
          name: item.media?.file_name || "Imagem da OS",
          kind: orderImageKindFromSortOrder(item.sort_order),
        }));
      const solutionImages = (mediaLinks || [])
        .filter((item: any) => Number(item.sort_order ?? 0) >= 1000)
        .map((item: any) => ({
          key: item.id,
          mediaId: item.media_id,
          name: item.media?.file_name || "Imagem da solução",
          kind: "solution" as const,
        }));

      return { currentOrder, history, usedItems, technicalValues: technicalValues || [], orderImages, solutionImages };
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
    const { currentOrder, history, usedItems, technicalValues, orderImages, solutionImages } = detailQuery.data;
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
