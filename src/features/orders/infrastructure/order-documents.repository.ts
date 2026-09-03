import { supabase } from "@/lib/supabase";
import { createMediaRecord } from "@/shared/infrastructure/media.repository";
import type {
  AttachmentType,
  OrderSituationDocument,
} from "../domain/order-situation-document";

export async function listAttachmentTypes(activeOnly = true) {
  let query = (supabase as any)
    .from("attachment_types")
    .select("id,name,is_active")
    .order("name", { ascending: true });
  if (activeOnly) query = query.eq("is_active", true);
  return query as Promise<{ data: AttachmentType[] | null; error: any }>;
}

export async function listOrderSituationDocuments(serviceOrderId: string) {
  return supabase
    .from("service_order_situation_media")
    .select("id,service_order_id,situation_id,media_id,attachment_type_id,created_at,media:media(id,file_name,mime_type),attachment_type:attachment_types(id,name,is_active)")
    .eq("service_order_id", serviceOrderId)
    .order("created_at", { ascending: true }) as unknown as Promise<{
      data: OrderSituationDocument[] | null;
      error: any;
    }>;
}

export async function attachOrderSituationDocument({
  serviceOrderId,
  situationId,
  attachmentTypeId,
  file,
}: {
  serviceOrderId: string;
  situationId: string;
  attachmentTypeId: string;
  file: File;
}) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `orders/${serviceOrderId}/situations/${situationId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error: storageError } = await supabase.storage
    .from("service-images")
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (storageError) throw storageError;

  try {
    const mediaId = await createMediaRecord({ bucket: "service-images", path, file });
    const { error } = await (supabase as any).rpc("attach_service_order_situation_media", {
      p_service_order_id: serviceOrderId,
      p_situation_id: situationId,
      p_media_id: mediaId,
      p_attachment_type_id: attachmentTypeId,
    });
    if (error) throw error;
    return mediaId;
  } catch (error) {
    await supabase.storage.from("service-images").remove([path]);
    throw error;
  }
}

export async function removeOrderSituationDocument(linkId: string) {
  const { error } = await supabase.rpc("remove_service_order_situation_media", {
    p_link_id: linkId,
  });
  if (error) throw error;
}
