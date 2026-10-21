import { supabase } from "@/lib/supabase";
import { extensionForUploadFile, prepareImageForUpload } from "@/shared/application/upload-file-optimizer";
import type { OrderImage } from "@/features/orders/domain/order-image";

const BUCKET = "quote-images";

export async function loadQuoteEquipmentImages(organizationId: string, quoteId: string): Promise<OrderImage[]> {
  const { data, error } = await supabase.from("quote_media")
    .select("id,storage_path,file_name,kind")
    .eq("organization_id", organizationId)
    .eq("quote_request_id", quoteId)
    .order("created_at");
  if (error) throw error;
  const output: OrderImage[] = [];
  for (const media of data || []) {
    const { data: signed, error: signedError } = await supabase.storage.from(BUCKET)
      .createSignedUrl(media.storage_path, 3600);
    if (signedError || !signed?.signedUrl) throw signedError || new Error("Não foi possível abrir a imagem do orçamento.");
    output.push({
      key: media.id,
      name: media.file_name,
      kind: media.kind === "label" ? "label" : "equipment",
      url: signed.signedUrl,
    });
  }
  return output;
}

export async function uploadQuoteEquipmentImage(organizationId: string, quoteId: string, image: OrderImage) {
  if (!image.file) return;
  const prepared = await prepareImageForUpload(image.file, image.kind === "label" ? "service-label" : "service-photo");
  const extension = extensionForUploadFile(prepared);
  const storagePath = "quotes/" + organizationId + "/" + quoteId + "/" + crypto.randomUUID() + "." + extension;
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, prepared, { upsert: false });
  if (error) throw error;
  const saved = await supabase.from("quote_media").insert({
    quote_request_id: quoteId,
    organization_id: organizationId,
    bucket_id: BUCKET,
    storage_path: storagePath,
    file_name: image.name || prepared.name,
    kind: image.kind === "label" ? "label" : "equipment",
  }).select("id").single();
  if (saved.error) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw saved.error;
  }
  return saved.data.id;
}

export async function deleteQuoteEquipmentImage(organizationId: string, quoteId: string, imageId: string) {
  const found = await supabase.from("quote_media")
    .select("id,storage_path").eq("id", imageId).eq("organization_id", organizationId)
    .eq("quote_request_id", quoteId).maybeSingle();
  if (found.error) throw found.error;
  if (!found.data) return;
  const { error } = await supabase.from("quote_media").delete().eq("id", imageId)
    .eq("organization_id", organizationId).eq("quote_request_id", quoteId);
  if (error) throw error;
  const removed = await supabase.storage.from(BUCKET).remove([found.data.storage_path]);
  if (removed.error) console.warn("[QUOTES] Unlinked image could not be cleaned from storage.", removed.error);
}
