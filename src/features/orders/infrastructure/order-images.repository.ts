import { supabase } from "@/lib/supabase";
import { createMediaRecord } from "@/shared/infrastructure/media.repository";

const ORDER_IMAGE_BUCKET = "service-images";

export const uploadOrderImageFile = (path: string, file: File) =>
  supabase.storage.from(ORDER_IMAGE_BUCKET).upload(path, file, { upsert: true });

export const removeOrderImageFile = (path: string) =>
  supabase.storage.from(ORDER_IMAGE_BUCKET).remove([path]);

export async function uploadOrderImage(file: File, organizationId?: string | null) {
  if (!organizationId) {
    throw new Error("Não foi possível identificar a empresa para enviar a imagem da OS.");
  }

  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase() || "jpg";

  const path =
    `orders/${organizationId}/draft/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await uploadOrderImageFile(path, file);

  if (uploadError) {
    console.error("[MEDIA] Storage upload error:", uploadError);
    throw uploadError;
  }

  try {
    return await createMediaRecord({
      bucket: "service-images",
      path,
      file,
      organizationId,
    });
  } catch (error) {
    console.error("[MEDIA] Media record error:", error);
    const { error: removeError } = await removeOrderImageFile(path);
    if (removeError) console.warn("[MEDIA] Could not remove orphan storage file:", removeError);
    throw error;
  }
}

export async function cleanupFailedOrderCreationImages({
  orderId,
  organizationId,
  mediaIds,
}: {
  orderId: string;
  organizationId: string;
  mediaIds: string[];
}) {
  const uniqueMediaIds = Array.from(new Set(mediaIds.filter(Boolean)));
  if (!uniqueMediaIds.length) return;

  const { data, error } = await supabase.rpc("cleanup_failed_order_creation_media", {
    p_order_id: orderId,
    p_organization_id: organizationId,
    p_media_ids: uniqueMediaIds,
  });

  if (error) throw error;

  const paths = Array.from(new Set(
    (Array.isArray(data) ? data : [])
      .filter((item: any) => item?.bucket_id === ORDER_IMAGE_BUCKET && item?.storage_path)
      .map((item: any) => String(item.storage_path)),
  ));

  if (!paths.length) return;

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { error: removeError } = await supabase.storage.from(ORDER_IMAGE_BUCKET).remove(paths);
    if (!removeError) return;
    lastError = removeError;
    if (attempt < 2) await new Promise(resolve => window.setTimeout(resolve, 250 * (attempt + 1)));
  }

  console.warn("[MEDIA] Could not remove failed OS creation files from storage:", lastError);
}
