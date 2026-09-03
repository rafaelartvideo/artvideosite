import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../../infrastructure/query/query-keys";
import {
  getServiceOrderDetail,
  listServiceOrderMedia,
  listServiceOrderStatusHistory,
  listServiceOrderUsedItems,
  listServiceOrderTechnicalValues,
} from "../infrastructure/orders.repository";
import type { OrderImage } from "../domain/order-image";

export function useOrderDetails({
  loadPartRequests,
  replaceOrderImages,
}: {
  loadPartRequests: (orderId: string) => Promise<void>;
  replaceOrderImages: (images: OrderImage[]) => void;
}) {
  const [detail, setDetail] = useState<any>(null);
  const [detailHistory, setDetailHistory] = useState<any[]>([]);
  const [detailUsedItems, setDetailUsedItems] = useState<any[]>([]);
  const [detailSolutionImages, setDetailSolutionImages] = useState<OrderImage[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const detailQuery = useQuery({
    queryKey: queryKeys.orders.detail(selectedOrder?.id || ""),
    enabled: Boolean(selectedOrder?.id),
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
        }));
      const solutionImages = (mediaLinks || [])
        .filter((item: any) => Number(item.sort_order ?? 0) >= 1000)
        .map((item: any) => ({
          key: item.id,
          mediaId: item.media_id,
          name: item.media?.file_name || "Imagem da solução",
        }));

      return { currentOrder, history, usedItems, technicalValues: technicalValues || [], orderImages, solutionImages };
    },
  });

  useEffect(() => {
    if (!detailQuery.data || !selectedOrder) return;
    const { currentOrder, history, usedItems, technicalValues, orderImages, solutionImages } = detailQuery.data;
    setDetailHistory(history || []);
    setDetailUsedItems(usedItems || []);
    setDetailSolutionImages(solutionImages);
    replaceOrderImages(orderImages);
    setDetail({ ...selectedOrder, ...(currentOrder || {}), technical_values: technicalValues });
    void loadPartRequests(selectedOrder.id);
  }, [detailQuery.data]);

  const openDetail = (order: any) => {
    setSelectedOrder(order);
    setDetail(order);
  };

  const closeDetail = () => {
    setDetail(null);
    setSelectedOrder(null);
  };

  return {
    detail,
    setDetail,
    detailHistory,
    detailUsedItems,
    setDetailUsedItems,
    detailSolutionImages,
    setDetailSolutionImages,
    openDetail,
    closeDetail,
  };
}
