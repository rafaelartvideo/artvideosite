import { supabase } from "@/lib/supabase";
import { extensionForUploadFile, prepareFileForUpload } from "@/shared/application/upload-file-optimizer";

export type MediaBucket = "service-images" | "product-images" | "brand-images" | "avatars" | "public-assets" | "registration-files";

export async function getAuthenticatedSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session?.user?.id) throw new Error("Não existe sessão autenticada. Faça login novamente para enviar imagens.");
  return session;
}

export async function createMediaRecord({ bucket, path, file, organizationId }: { bucket: MediaBucket; path: string; file: File; organizationId?: string | null }) {
  const session = await getAuthenticatedSession();
  const payload: Record<string, unknown> = {
    bucket_id: bucket,
    storage_path: path,
    file_name: file.name,
    file_size: file.size || null,
    mime_type: file.type || null,
    alt_text: file.name,
    uploaded_by: session.user.id,
  };
  if (organizationId) payload.organization_id = organizationId;
  const { data: media, error } = await supabase.from("media").insert(payload as any).select("id").single();
  if (error || !media?.id) throw new Error(error?.message || "Não foi possível registrar a imagem.");
  return media.id as string;
}

async function uploadMediaAtPath(bucket: MediaBucket, path: string, file: File, organizationId?: string | null) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
  if (error) throw error;
  try {
    return await createMediaRecord({ bucket, path, file, organizationId });
  } catch (recordError) {
    const { error: cleanupError } = await supabase.storage.from(bucket).remove([path]);
    if (cleanupError) console.warn("[MEDIA] orphan cleanup failed:", cleanupError);
    throw recordError;
  }
}

export async function uploadMediaFile(bucket: MediaBucket, file: File, organizationId?: string | null) {
  const preset = bucket === "product-images" || bucket === "brand-images" || bucket === "public-assets"
    ? "catalog-image"
    : bucket === "service-images"
      ? "service-photo"
      : "document-image";
  const preparedFile = await prepareFileForUpload(file, preset);
  const extension = extensionForUploadFile(preparedFile);
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const path = organizationId ? `${organizationId}/${fileName}` : fileName;
  return uploadMediaAtPath(bucket, path, preparedFile, organizationId);
}

export async function uploadServiceOrderMediaFile(
  serviceOrderId: string,
  scope: string,
  file: File,
  organizationId?: string | null,
) {
  const preparedFile = await prepareFileForUpload(file, "service-photo");
  const extension = extensionForUploadFile(preparedFile);
  const safeScope = scope.replace(/[^a-z0-9/_-]/gi, "-").replace(/^\/+|\/+$/g, "") || "files";
  const path = `orders/${serviceOrderId}/${safeScope}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  return uploadMediaAtPath("service-images", path, preparedFile, organizationId);
}

export async function uploadRegistrationRecordMediaFile(
  organizationId: string,
  entityId: string,
  recordId: string,
  file: File,
) {
  const preparedFile = await prepareFileForUpload(file, "document-image");
  const extension = extensionForUploadFile(preparedFile);
  const path = `${organizationId}/registrations/${entityId}/${recordId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  return uploadMediaAtPath("registration-files", path, preparedFile, organizationId);
}

export async function createStorageSignedUrl(
  bucket: MediaBucket,
  path: string,
  expiresIn = 300,
  download?: string | boolean,
) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn, download ? { download } : undefined);
  if (error || !data?.signedUrl) throw new Error(error?.message || "Não foi possível abrir o arquivo.");
  return data.signedUrl;
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

export async function resolveMediaStorageUrl(bucket: string, path: string, expiresIn = 3600) {
  if (!bucket || !path) return "";
  if (bucket === "service-images") {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error || !data?.signedUrl) throw new Error(error?.message || "Não foi possível abrir a imagem.");
    return data.signedUrl;
  }
  return getPublicStorageUrl(bucket, path);
}
