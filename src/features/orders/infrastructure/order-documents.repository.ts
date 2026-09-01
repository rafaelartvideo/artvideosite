import { supabase } from "@/lib/supabase";
import { createMediaRecord } from "@/shared/infrastructure/media.repository";
import type { OrderSituationDocument } from "../domain/order-situation-document";

export async function listOrderSituationDocuments(serviceOrderId: string) {
  return supabase
    .from("service_order_situation_media")
    .select("id,service_order_id,situation_id,media_id,created_at,media:media(id,file_name)")
    .eq("service_order_id", serviceOrderId)
    .order("created_at", { ascending: true }) as unknown as Promise<{
      data: OrderSituationDocument[] | null;
      error: any;
    }>;
}

export async function attachOrderSituationDocument({
  serviceOrderId,
  situationId,
  file,
}: {
  serviceOrderId: string;
  situationId: string;
  file: File;
}) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `orders/${serviceOrderId}/situations/${situationId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error: storageError } = await supabase.storage
    .from("service-images")
    .upload(path, file, { upsert: false });
  if (storageError) throw storageError;

  try {
    const mediaId = await createMediaRecord({ bucket: "service-images", path, file });
    const { error } = await supabase.rpc("attach_service_order_situation_media", {
      p_service_order_id: serviceOrderId,
      p_situation_id: situationId,
      p_media_id: mediaId,
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
