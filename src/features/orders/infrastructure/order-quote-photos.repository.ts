import { supabase } from "@/lib/supabase";
import { uploadServiceOrderMediaFile } from "@/shared/infrastructure/media.repository";

export type OrderQuotePhoto = {
  id: string;
  mediaId: string;
  fileName: string;
  url: string;
};

type PhotoRow = {
  id: string;
  media_id: string;
  media: { file_name: string | null; bucket_id: string; storage_path: string } | { file_name: string | null; bucket_id: string; storage_path: string }[] | null;
};

export async function listOrderQuotePhotos(organizationId: string, orderId: string): Promise<OrderQuotePhoto[]> {
  const { data, error } = await supabase.from("service_order_quote_photos")
    .select("id,media_id,media:media(file_name,bucket_id,storage_path)")
    .eq("organization_id", organizationId)
    .eq("service_order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = ((data || []) as unknown as PhotoRow[])
    .map(row => ({
      id: row.id,
      mediaId: row.media_id,
      media: Array.isArray(row.media) ? row.media[0] : row.media,
    }))
    .filter(row => row.media?.bucket_id === "service-images" && Boolean(row.media.storage_path));
  if (!rows.length) return [];

  // Uma única chamada ao Storage para todas as URLs temporárias, evitando N requests.
  const { data: signed, error: signError } = await supabase.storage
    .from("service-images").createSignedUrls(rows.map(row => row.media!.storage_path), 3600);
  if (signError) throw signError;
  const byPath = new Map((signed || []).filter(link => link.signedUrl)
    .map(link => [link.path, link.signedUrl] as const));
  return rows.flatMap(row => {
    const url = byPath.get(row.media!.storage_path);
    return url ? [{ id: row.id, mediaId: row.mediaId, fileName: row.media!.file_name || "Foto do orçamento", url }] : [];
  });
}

const ALLOWED_IMAGES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

export function validateOrderQuotePhoto(file: File) {
  if (!ALLOWED_IMAGES.has(file.type.toLowerCase())) {
    throw new Error("Selecione fotos JPEG, PNG, WEBP ou HEIC.");
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error(`A foto "${file.name}" excede 20 MB.`);
  }
}

export async function addOrderQuotePhoto(organizationId: string, orderId: string, file: File) {
  validateOrderQuotePhoto(file);
  // O otimizador/compressor é o mesmo utilizado nos anexos das OS.
  const mediaId = await uploadServiceOrderMediaFile(orderId, "attachments/quote", file, organizationId);
  try {
    const { error } = await supabase.from("service_order_quote_photos").insert({
      organization_id: organizationId, service_order_id: orderId, media_id: mediaId,
    });
    if (error) throw error;
  } catch (error) {
    // Compensação: registro de mídia e objeto no Storage não ficam órfãos.
    try {
      const { data: cleanup, error: cleanupError } = await supabase.rpc(
        "discard_unlinked_service_order_quote_photo_v1", {
          p_media_id: mediaId, p_organization_id: organizationId, p_order_id: orderId,
        },
      );
      if (cleanupError) throw cleanupError;
      const item = (cleanup as any[])?.[0];
      if (item?.storage_path && item?.bucket_id) {
        const { error: storageError } = await supabase.storage.from(item.bucket_id).remove([item.storage_path]);
        if (storageError) console.warn("[QUOTE PHOTOS] Falha ao limpar arquivo após erro de vínculo.", storageError);
      }
    } catch (cleanupError) {
      console.warn("[QUOTE PHOTOS] Não foi possível limpar o upload sem vínculo.", cleanupError);
    }
    throw error;
  }
}

export async function removeOrderQuotePhoto(photoId: string) {
  const { data, error } = await supabase.rpc("remove_service_order_quote_photo_v1", { p_photo_id: photoId });
  if (error) throw error;
  const item = (data as any[])?.[0];
  if (item?.bucket_id && item?.storage_path) {
    const { error: storageError } = await supabase.storage.from(item.bucket_id).remove([item.storage_path]);
    if (storageError) console.warn("[QUOTE PHOTOS] Foto desvinculada, mas limpeza do Storage falhou.", storageError);
  }
}
