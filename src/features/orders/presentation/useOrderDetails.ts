import { useState } from "react";
import {
  getServiceOrderDetail,
  listServiceOrderMedia,
  listServiceOrderStatusHistory,
  listServiceOrderUsedItems,
} from "../infrastructure/orders.repository";
import type { OrderImage } from "./OrderImages";

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

  const openDetail = async (order: any) => {
    const [
      { data: currentOrder },
      { data: history },
      { data: mediaLinks },
      { data: usedItems },
    ] = await Promise.all([
      getServiceOrderDetail(order.id),
      listServiceOrderStatusHistory(order.id),
      listServiceOrderMedia(order.id),
      listServiceOrderUsedItems(order.id),
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

    setDetailHistory(history || []);
    setDetailUsedItems(usedItems || []);
    await loadPartRequests(order.id);
    setDetailSolutionImages(solutionImages);
    replaceOrderImages(orderImages);
    setDetail({ ...order, ...(currentOrder || {}) });
  };

  const closeDetail = () => setDetail(null);

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
