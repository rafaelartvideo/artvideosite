import { useCallback, useEffect, useRef, useState } from "react";
import { listServiceOrderMedia } from "../infrastructure/orders.repository";
import {
  orderImageKindFromSortOrder,
  type OrderImage,
  type OrderImageKind,
} from "../domain/order-image";

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGES = 5;

function revokeTemporaryUrls(images: OrderImage[]) {
  images.forEach(image => {
    if (image.url) URL.revokeObjectURL(image.url);
  });
}

export function useOrderImages() {
  const [orderImages, setOrderImages] = useState<OrderImage[]>([]);
  const [solutionImages, setSolutionImages] = useState<OrderImage[]>([]);
  const [viewImage, setViewImage] = useState<OrderImage | null>(null);
  const orderImagesRef = useRef(orderImages);
  const solutionImagesRef = useRef(solutionImages);

  orderImagesRef.current = orderImages;
  solutionImagesRef.current = solutionImages;

  useEffect(() => () => {
    revokeTemporaryUrls(orderImagesRef.current);
    revokeTemporaryUrls(solutionImagesRef.current);
  }, []);

  const replaceOrderImages = useCallback((images: OrderImage[]) => {
    setOrderImages(current => {
      revokeTemporaryUrls(current);
      return images;
    });
  }, []);

  const clearOrderImages = useCallback(() => {
    replaceOrderImages([]);
  }, [replaceOrderImages]);

  const loadOrderImages = useCallback(async (orderId: string) => {
    const { data, error } = await listServiceOrderMedia(orderId);
    if (error) {
      console.error("[ADMIN] service order media load error:", error);
      replaceOrderImages([]);
      return;
    }

    replaceOrderImages((data || [])
      .filter((item: any) => Number(item.sort_order ?? 0) < 1000)
      .map((item: any) => ({
        key: item.id,
        mediaId: item.media_id,
        name: item.media?.file_name || "Imagem da OS",
        kind: orderImageKindFromSortOrder(item.sort_order),
      })));
  }, [replaceOrderImages]);

  const addOrderImages = useCallback((files: FileList | File[] | null, kind: Exclude<OrderImageKind, "solution"> = "equipment") => {
    setOrderImages(current => {
      const selected = Array.from(files || [])
        .filter(file => ACCEPTED_IMAGE_TYPES.has(file.type))
        .slice(0, Math.max(0, MAX_IMAGES - current.length));
      return [...current, ...selected.map(file => ({
        key: `new-${kind}-${Date.now()}-${Math.random()}`,
        file,
        url: URL.createObjectURL(file),
        name: file.name,
        kind,
      }))];
    });
  }, []);

  const markOrderImageUploaded = useCallback((key: string, mediaId: string) => {
    setOrderImages(current => current.map(image => image.key === key ? { ...image, mediaId } : image));
  }, []);

  const removeOrderImage = useCallback((key: string) => {
    setOrderImages(current => {
      const removed = current.find(image => image.key === key);
      if (removed?.url) URL.revokeObjectURL(removed.url);
      return current.filter(image => image.key !== key);
    });
  }, []);

  const replaceSolutionImages = useCallback((images: OrderImage[]) => {
    setSolutionImages(current => {
      revokeTemporaryUrls(current);
      return images.map(image => ({ ...image, kind: "solution" }));
    });
  }, []);

  const addSolutionImages = useCallback((files: FileList | null, keyPrefix = "solution") => {
    setSolutionImages(current => {
      const selected = Array.from(files || [])
        .filter(file => ACCEPTED_IMAGE_TYPES.has(file.type))
        .slice(0, Math.max(0, MAX_IMAGES - current.length));
      return [...current, ...selected.map(file => ({
        key: `${keyPrefix}-${Date.now()}-${Math.random()}`,
        file,
        url: URL.createObjectURL(file),
        name: file.name,
        kind: "solution" as const,
      }))];
    });
  }, []);

  const removeSolutionImage = useCallback((key: string) => {
    setSolutionImages(current => {
      const removed = current.find(image => image.key === key);
      if (removed?.url) URL.revokeObjectURL(removed.url);
      return current.filter(image => image.key !== key);
    });
  }, []);

  return {
    orderImages,
    solutionImages,
    viewImage,
    setViewImage,
    loadOrderImages,
    replaceOrderImages,
    clearOrderImages,
    addOrderImages,
    markOrderImageUploaded,
    removeOrderImage,
    replaceSolutionImages,
    addSolutionImages,
    removeSolutionImage,
  };
}
