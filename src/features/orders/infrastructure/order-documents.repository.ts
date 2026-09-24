import { getActiveOrganizationId } from "@/lib/active-organization";
import { supabase } from "@/lib/supabase";
import { createMediaRecord } from "@/shared/infrastructure/media.repository";
import { extensionForUploadFile, prepareFileForUpload } from "@/shared/application/upload-file-optimizer";
import type {
  AttachmentType,
  OrderSituationDocument,
} from "../domain/order-situation-document";

async function resolveOrganizationId(organizationIdOverride?: string | null) {
  return organizationIdOverride || await getActiveOrganizationId();
}

export async function getServiceOrderOrganizationId(serviceOrderId: string) {
  const { data, error } = await supabase
    .from("service_orders")
    .select("organization_id")
    .eq("id", serviceOrderId)
    .maybeSingle();

  if (error) throw error;
  const organizationId = (data as any)?.organization_id as string | null | undefined;
  if (!organizationId) throw new Error("Não foi possível identificar a empresa proprietária desta OS.");
  return organizationId;
}

export async function listAttachmentTypes(activeOnly = true, organizationIdOverride?: string | null) {
  const organizationId = await resolveOrganizationId(organizationIdOverride);
  let query = (supabase as any)
    .from("attachment_types")
    .select("id,name,is_active")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });
  if (activeOnly) query = query.eq("is_active", true);
  return query as Promise<{ data: AttachmentType[] | null; error: any }>;
}

export async function listOrderSituationDocuments(serviceOrderId: string, organizationIdOverride?: string | null) {
  const organizationId = organizationIdOverride || await getServiceOrderOrganizationId(serviceOrderId);
  return supabase
    .from("service_order_situation_media")
    .select("id,service_order_id,situation_id,media_id,attachment_type_id,created_at,media:media(id,file_name,mime_type),attachment_type:attachment_types(id,name,is_active)")
    .eq("organization_id", organizationId)
    .eq("service_order_id", serviceOrderId)
    .order("created_at", { ascending: true }) as unknown as Promise<{
      data: OrderSituationDocument[] | null;
      error: any;
    }>;
}

export async function attachOrderSituationDocument({
  organizationId: organizationIdOverride,
  serviceOrderId,
  situationId,
  attachmentTypeId,
  file,
}: {
  organizationId?: string | null;
  serviceOrderId: string;
  situationId?: string | null;
  attachmentTypeId?: string | null;
  file: File;
}) {
  const organizationId = organizationIdOverride || await getServiceOrderOrganizationId(serviceOrderId);
  const { data: order, error: orderError } = await supabase
    .from("service_orders")
    .select("id")
    .eq("id", serviceOrderId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) throw new Error("A OS não pertence à empresa informada ou não está disponível para este acesso.");

  const preparedFile = await prepareFileForUpload(file, "document-image");
  const extension = extensionForUploadFile(preparedFile);
  const scope = situationId ? `situations/${situationId}` : "attachments";
  const path = `orders/${serviceOrderId}/${scope}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error: storageError } = await supabase.storage
    .from("service-images")
    .upload(path, preparedFile, { upsert: false, contentType: preparedFile.type || undefined });
  if (storageError) throw storageError;

  try {
    const mediaId = await createMediaRecord({ bucket: "service-images", path, file: preparedFile, organizationId });
    const { error } = situationId
      ? await (supabase as any).rpc("attach_service_order_situation_media", {
          p_service_order_id: serviceOrderId,
          p_situation_id: situationId,
          p_media_id: mediaId,
          p_attachment_type_id: attachmentTypeId || null,
        })
      : await (supabase as any).rpc("attach_service_order_attachment", {
          p_service_order_id: serviceOrderId,
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
  const { data, error } = await (supabase as any).rpc("remove_service_order_situation_media_and_cleanup", {
    p_link_id: linkId,
  });
  if (error) throw error;

  const cleanup = Array.isArray(data) ? data[0] : null;
  if (!cleanup?.bucket_id || !cleanup?.storage_path) return;

  const { error: storageError } = await supabase.storage
    .from(String(cleanup.bucket_id))
    .remove([String(cleanup.storage_path)]);

  if (storageError) {
    console.warn("[MEDIA] Não foi possível remover o arquivo órfão do Storage:", storageError);
  }
}
