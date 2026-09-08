import { supabase } from "@/lib/supabase";

export type MediaBucket = "service-images" | "product-images" | "brand-images" | "avatars" | "public-assets";

export async function getAuthenticatedSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session?.user?.id) throw new Error("Não existe sessão autenticada. Faça login novamente para enviar imagens.");
  return session;
}

export async function createMediaRecord({ bucket, path, file }: { bucket: MediaBucket; path: string; file: File }) {
  const session = await getAuthenticatedSession();
  const { data: media, error } = await supabase.from("media").insert({
    bucket_id: bucket, storage_path: path, file_name: file.name, file_size: file.size || null,
    mime_type: file.type || null, alt_text: file.name, uploaded_by: session.user.id,
  }).select("id").single();
  if (error || !media?.id) throw new Error(error?.message || "Não foi possível registrar a imagem.");
  return media.id as string;
}

async function uploadMediaAtPath(bucket: MediaBucket, path: string, file: File) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
  if (error) throw error;
  try {
    return await createMediaRecord({ bucket, path, file });
  } catch (recordError) {
    const { error: cleanupError } = await supabase.storage.from(bucket).remove([path]);
    if (cleanupError) console.warn("[MEDIA] orphan cleanup failed:", cleanupError);
    throw recordError;
  }
}

export async function uploadMediaFile(bucket: MediaBucket, file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  return uploadMediaAtPath(bucket, path, file);
}

export async function uploadServiceOrderMediaFile(
  serviceOrderId: string,
  scope: string,
  file: File,
) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
  const safeScope = scope.replace(/[^a-z0-9/_-]/gi, "-").replace(/^\/+|\/+$/g, "") || "files";
  const path = `orders/${serviceOrderId}/${safeScope}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  return uploadMediaAtPath("service-images", path, file);
}

export function supabaseErrorMessage(error: unknown) {
  if (error && typeof error === "object") {
    const value = error as { message?: string; details?: string; hint?: string; code?: string };
    return [value.message, value.details, value.hint, value.code ? `Código: ${value.code}` : ""].filter(Boolean).join(" | ");
  }
  return error instanceof Error ? error.message : String(error);
}

export async function getMediaById(mediaId: string) {
  const { data, error } = await supabase.from("media").select("*").eq("id", mediaId).maybeSingle();
  if (error) throw error;
  return data;
}

export function getPublicStorageUrl(bucket: string, path: string) {
  if (!bucket || !path) return "";
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
