import {
  clearServiceOrderSellers,
  clearServiceOrderTechnicians,
  createServiceOrder,
  createServiceOrderAtomic,
  insertServiceOrderMedia,
  insertServiceOrderSellers,
  insertServiceOrderTechnicians,
  listServiceOrderMediaLinks,
  updateServiceOrder,
  updateServiceOrderMediaSortOrder,
} from "../infrastructure/orders.repository";
import { cleanupFailedOrderCreationImages } from "../infrastructure/order-images.repository";
import { orderImageSortOrder, type OrderImageKind } from "../domain/order-image";

type SubmissionImage = { key?: string; mediaId?: string; file?: File; kind?: OrderImageKind };
type SubmissionFailure = { success: false; stage: "record" | "technical" | "relations" | "images"; error: unknown; orderId?: string };
type SubmissionSuccess = { success: true; orderId: string };

function isAtomicRpcUnavailable(error: any) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "PGRST202" || (message.includes("create_service_order_atomic") && message.includes("function"));
}

async function cleanupAtomicUploads({
  orderId,
  organizationId,
  mediaIds,
}: {
  orderId: string;
  organizationId: string;
  mediaIds: string[];
}) {
  if (!mediaIds.length) return;
  try {
    await cleanupFailedOrderCreationImages({ orderId, organizationId, mediaIds });
  } catch (cleanupError) {
    console.warn("[MEDIA] Failed OS creation cleanup could not finish:", cleanupError);
  }
}

export async function persistServiceOrder({
  organizationId,
  editingOrder,
  pendingOrderId,
  creationRequestId,
  payload,
  selectedTechnicianIds,
  selectedSellerIds,
  technicalValues,
  originalTechnicalValues,
  orderImages,
  uploadImage,
  onImageUploaded,
  saveTechnicalValues,
}: {
  organizationId: string;
  editingOrder: any;
  pendingOrderId?: string | null;
  creationRequestId?: string | null;
  payload: Record<string, any>;
  selectedTechnicianIds: string[];
  selectedSellerIds: string[];
  technicalValues: Array<Record<string, unknown>>;
  originalTechnicalValues?: Array<Record<string, unknown>>;
  orderImages: SubmissionImage[];
  uploadImage: (file: File, kind?: OrderImageKind) => Promise<string>;
  onImageUploaded?: (imageKey: string, mediaId: string) => void;
  saveTechnicalValues: (orderId: string, values: Array<Record<string, unknown>>) => Promise<{ error: any } | void>;
}): Promise<SubmissionFailure | SubmissionSuccess> {
  let savedOrderId = editingOrder?.id as string | undefined;
  const retryingPartialCreate = !editingOrder && Boolean(pendingOrderId);
  const preparedImages = orderImages.map(image => ({ ...image }));

  // Caminho seguro para uma NOVA OS: fotos são preparadas antes de existir a OS
  // e todo o estado relacional é persistido por uma única função PostgreSQL.
  // Se qualquer insert de filho falhar, a transação inteira é revertida.
  if (!editingOrder && !pendingOrderId && creationRequestId) {
    const uploadedInThisAttempt: Array<{ key?: string; mediaId: string }> = [];

    try {
      for (const image of preparedImages) {
        if (image.mediaId || !image.file) continue;
        const mediaId = await uploadImage(image.file, image.kind);
        image.mediaId = mediaId;
        uploadedInThisAttempt.push({ key: image.key, mediaId });
      }
    } catch (error) {
      await cleanupAtomicUploads({
        orderId: creationRequestId,
        organizationId,
        mediaIds: uploadedInThisAttempt.map(item => item.mediaId),
      });
      return { success: false, stage: "images", error };
    }

    const counters: Record<"equipment" | "label", number> = { equipment: 0, label: 0 };
    const mediaLinks = preparedImages.flatMap(image => {
      if (!image.mediaId) return [];
      const kind = image.kind === "label" ? "label" : "equipment";
      return [{ media_id: image.mediaId, sort_order: orderImageSortOrder(kind, counters[kind]++) }];
    });

    const atomicResult = await createServiceOrderAtomic({
      orderId: creationRequestId,
      organizationId,
      payload,
      technicianIds: Array.from(new Set(selectedTechnicianIds)),
      sellerIds: Array.from(new Set(selectedSellerIds)),
      technicalValues,
      mediaLinks,
    });

    if (!atomicResult.error) {
      const atomicData = atomicResult.data as any;
      return { success: true, orderId: String(atomicData?.id || creationRequestId) };
    }

    // Compatibilidade temporária enquanto a migration atômica ainda não existe
    // em algum ambiente. Nesse caso os uploads precisam ser preservados para o
    // fluxo legado, e o estado local recebe os mediaIds para evitar novo upload.
    if (isAtomicRpcUnavailable(atomicResult.error)) {
      for (const uploaded of uploadedInThisAttempt) {
        if (uploaded.key) onImageUploaded?.(uploaded.key, uploaded.mediaId);
      }
    } else {
      // Erro real da criação atômica: a OS não existe. Remove somente mídias
      // deste envio que continuam sem vínculo; se a resposta tiver se perdido
      // depois de um COMMIT, a função SQL detecta a OS e preserva as imagens.
      await cleanupAtomicUploads({
        orderId: creationRequestId,
        organizationId,
        mediaIds: uploadedInThisAttempt.map(item => item.mediaId),
      });
      return { success: false, stage: "record", error: atomicResult.error };
    }
  }

  if (editingOrder) {
    // Não regravar colunas que permanecem iguais na edição (auditoria/Realtime).
    const changedPayload = Object.fromEntries(Object.entries(payload).filter(([key, value]) =>
      JSON.stringify(value ?? null) !== JSON.stringify(editingOrder[key] ?? null),
    ));
    if (Object.keys(changedPayload).length) {
      const { error } = await updateServiceOrder(organizationId, editingOrder.id, changedPayload);
      if (error) return { success: false, stage: "record", error, orderId: editingOrder.id };
    }
  } else if (pendingOrderId) {
    savedOrderId = pendingOrderId;
    const { error } = await updateServiceOrder(organizationId, pendingOrderId, payload);
    if (error) return { success: false, stage: "record", error, orderId: pendingOrderId };
  } else {
    const { data, error } = await createServiceOrder(organizationId, payload);
    if (error) return { success: false, stage: "record", error };
    savedOrderId = data?.id;
  }

  if (!savedOrderId) return { success: false, stage: "record", error: new Error("A OS foi salva, mas não foi possível obter seu ID.") };

  const priorValues = new Map((originalTechnicalValues ?? []).map(value => [String(value.technical_field_id), value]));
  const changedTechnicalValues = editingOrder && originalTechnicalValues
    ? technicalValues.filter(value => {
        const previous = priorValues.get(String(value.technical_field_id));
        if (!previous) return true;
        const oldNumber = previous.value_number == null ? null : Number(previous.value_number);
        const newNumber = value.value_number == null ? null : Number(value.value_number);
        return String(value.value_text ?? "") !== String(previous.value_text ?? "")
          || newNumber !== oldNumber
          || value.field_type_snapshot !== previous.field_type_snapshot;
      })
    : technicalValues;
  if (changedTechnicalValues.length) {
    const technicalValuesResult = await saveTechnicalValues(savedOrderId, changedTechnicalValues);
    if (technicalValuesResult?.error) return { success: false, stage: "technical", error: technicalValuesResult.error, orderId: savedOrderId };
  }

  const uniqueTechnicianIds = Array.from(new Set(selectedTechnicianIds));
  const uniqueSellerIds = Array.from(new Set(selectedSellerIds));
  const previousTechnicianIds = Array.from(new Set((editingOrder?.technician_links || []).map((link: any) => link.employee_id).filter(Boolean).concat(editingOrder?.technician_id ? [editingOrder.technician_id] : []))) as string[];
  const previousSellerIds = Array.from(new Set((editingOrder?.seller_links || []).map((link: any) => link.employee_id).filter(Boolean).concat(editingOrder?.seller_id ? [editingOrder.seller_id] : []))) as string[];

  // Só reconstruir vínculos quando a composição de técnicos/vendedores mudar.
  // O fluxo antigo fazia DELETE + INSERT de todos em absolutamente toda edição.
  const sameIds = (left: string[], right: string[]) =>
    left.length === right.length && left.every(id => right.includes(id));
  const previousTechnicianLinkIds = (editingOrder?.technician_links || [])
    .map((link: any) => link.employee_id).filter(Boolean) as string[];
  const previousSellerLinkIds = (editingOrder?.seller_links || [])
    .map((link: any) => link.employee_id).filter(Boolean) as string[];
  const techniciansChanged = !editingOrder || !sameIds(uniqueTechnicianIds, previousTechnicianLinkIds);
  const sellersChanged = !editingOrder || !sameIds(uniqueSellerIds, previousSellerLinkIds);

  try {
    if (techniciansChanged) {
      if (editingOrder || retryingPartialCreate) {
        const { error } = await clearServiceOrderTechnicians(savedOrderId);
        if (error) throw error;
      }
      if (uniqueTechnicianIds.length) {
        const { error } = await insertServiceOrderTechnicians(savedOrderId, uniqueTechnicianIds);
        if (error) throw error;
      }
    }
    if (sellersChanged) {
      if (editingOrder || retryingPartialCreate) {
        const { error } = await clearServiceOrderSellers(savedOrderId);
        if (error) throw error;
      }
      if (uniqueSellerIds.length) {
        const { error } = await insertServiceOrderSellers(savedOrderId, uniqueSellerIds);
        if (error) throw error;
      }
    }
  } catch (error) {
    if (editingOrder) {
      if (techniciansChanged) {
        await clearServiceOrderTechnicians(savedOrderId);
        if (previousTechnicianIds.length) await insertServiceOrderTechnicians(savedOrderId, previousTechnicianIds);
      }
      if (sellersChanged) {
        await clearServiceOrderSellers(savedOrderId);
        if (previousSellerIds.length) await insertServiceOrderSellers(savedOrderId, previousSellerIds);
      }
    }
    return { success: false, stage: "relations", error, orderId: savedOrderId };
  }

  if (preparedImages.length > 0) {
    try {
      const { data: existingLinks, error: linksError } = await listServiceOrderMediaLinks(savedOrderId);
      if (linksError) throw linksError;

      const counters: Record<"equipment" | "label", number> = { equipment: 0, label: 0 };
      for (const image of preparedImages) {
        const kind = image.kind === "label" ? "label" : "equipment";
        const sortOrder = orderImageSortOrder(kind, counters[kind]++);
        if (image.mediaId) {
          const link = (existingLinks || []).find((item: any) => item.media_id === image.mediaId);
          if (link) {
            if (Number(link.sort_order) !== sortOrder) {
              const { error } = await updateServiceOrderMediaSortOrder(link.id, sortOrder);
              if (error) throw error;
            }
          } else {
            const { error } = await insertServiceOrderMedia(savedOrderId, image.mediaId, sortOrder);
            if (error) throw error;
          }
        } else if (image.file) {
          const mediaId = await uploadImage(image.file, image.kind);
          image.mediaId = mediaId;
          if (image.key) onImageUploaded?.(image.key, mediaId);
          const { error } = await insertServiceOrderMedia(savedOrderId, mediaId, sortOrder);
          if (error) throw error;
        }
      }
    } catch (error) {
      return { success: false, stage: "images", error, orderId: savedOrderId };
    }
  }

  return { success: true, orderId: savedOrderId };
}
