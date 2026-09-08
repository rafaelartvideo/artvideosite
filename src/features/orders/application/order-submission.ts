import {
  clearServiceOrderSellers,
  clearServiceOrderTechnicians,
  createServiceOrder,
  insertServiceOrderMedia,
  insertServiceOrderSellers,
  insertServiceOrderTechnicians,
  listServiceOrderMediaLinks,
  updateServiceOrder,
  updateServiceOrderMediaSortOrder,
} from "../infrastructure/orders.repository";
import { orderImageSortOrder, type OrderImageKind } from "../domain/order-image";

type SubmissionImage = { mediaId?: string; file?: File; kind?: OrderImageKind };
type SubmissionFailure = { success: false; stage: "record" | "relations" | "images"; error: unknown };
type SubmissionSuccess = { success: true; orderId: string };

export async function persistServiceOrder({
  organizationId,
  editingOrder,
  payload,
  selectedTechnicianIds,
  selectedSellerIds,
  orderImages,
  uploadImage,
  saveTechnicalValues,
}: {
  organizationId: string;
  editingOrder: any;
  payload: Record<string, any>;
  selectedTechnicianIds: string[];
  selectedSellerIds: string[];
  orderImages: SubmissionImage[];
  uploadImage: (file: File) => Promise<string>;
  saveTechnicalValues: (orderId: string) => Promise<{ error: any } | void>;
}): Promise<SubmissionFailure | SubmissionSuccess> {
  let savedOrderId = editingOrder?.id as string | undefined;

  if (editingOrder) {
    const { error } = await updateServiceOrder(organizationId, editingOrder.id, payload);
    if (error) return { success: false, stage: "record", error };
  } else {
    const { data, error } = await createServiceOrder(organizationId, payload);
    if (error) return { success: false, stage: "record", error };
    savedOrderId = data?.id;
  }

  if (!savedOrderId) return { success: false, stage: "record", error: new Error("A OS foi salva, mas não foi possível obter seu ID.") };

  const technicalValuesResult = await saveTechnicalValues(savedOrderId);
  if (technicalValuesResult?.error) return { success: false, stage: "record", error: technicalValuesResult.error };

  const uniqueTechnicianIds = Array.from(new Set(selectedTechnicianIds));
  const uniqueSellerIds = Array.from(new Set(selectedSellerIds));
  const previousTechnicianIds = Array.from(new Set((editingOrder?.technician_links || []).map((link: any) => link.employee_id).filter(Boolean).concat(editingOrder?.technician_id ? [editingOrder.technician_id] : []))) as string[];
  const previousSellerIds = Array.from(new Set((editingOrder?.seller_links || []).map((link: any) => link.employee_id).filter(Boolean).concat(editingOrder?.seller_id ? [editingOrder.seller_id] : []))) as string[];

  try {
    if (editingOrder) {
      const { error: technicianClearError } = await clearServiceOrderTechnicians(savedOrderId);
      if (technicianClearError) throw technicianClearError;
      const { error: sellerClearError } = await clearServiceOrderSellers(savedOrderId);
      if (sellerClearError) throw sellerClearError;
    }
    if (uniqueTechnicianIds.length) {
      const { error } = await insertServiceOrderTechnicians(savedOrderId, uniqueTechnicianIds);
      if (error) throw error;
    }
    if (uniqueSellerIds.length) {
      const { error } = await insertServiceOrderSellers(savedOrderId, uniqueSellerIds);
      if (error) throw error;
    }
  } catch (error) {
    if (editingOrder) {
      await clearServiceOrderTechnicians(savedOrderId);
      await clearServiceOrderSellers(savedOrderId);
      if (previousTechnicianIds.length) await insertServiceOrderTechnicians(savedOrderId, previousTechnicianIds);
      if (previousSellerIds.length) await insertServiceOrderSellers(savedOrderId, previousSellerIds);
    }
    return { success: false, stage: "relations", error };
  }

  try {
    const { data: existingLinks, error: linksError } = await listServiceOrderMediaLinks(savedOrderId);
    if (linksError) throw linksError;

    const counters: Record<"equipment" | "label", number> = { equipment: 0, label: 0 };
    for (const image of orderImages) {
      const kind = image.kind === "label" ? "label" : "equipment";
      const sortOrder = orderImageSortOrder(kind, counters[kind]++);
      if (image.mediaId) {
        const link = (existingLinks || []).find((item: any) => item.media_id === image.mediaId);
        if (!link) continue;
        const { error } = await updateServiceOrderMediaSortOrder(link.id, sortOrder);
        if (error) throw error;
      } else if (image.file) {
        const mediaId = await uploadImage(image.file);
        const { error } = await insertServiceOrderMedia(savedOrderId, mediaId, sortOrder);
        if (error) throw error;
      }
    }
  } catch (error) {
    return { success: false, stage: "images", error };
  }

  return { success: true, orderId: savedOrderId };
}
