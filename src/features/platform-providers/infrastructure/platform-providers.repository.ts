import { supabase } from "@/lib/supabase";

export const PLATFORM_PROVIDER_BUCKET = "platform-provider-documents";
export type PlatformService = {
  id: string; organization_id: string; name: string; is_active: boolean;
};
export type PlatformProvider = {
  id: string; name: string; document: string | null;
  phone: string | null; whatsapp: string | null; email: string | null;
  state: string; city: string; neighborhood: string | null;
  street: string | null; street_number: string | null; zip_code: string | null;
  notes: string | null; is_active: boolean; service_ids: string[];
  service_names: string[]; attachment_count: number; total_count: number;
};
export type PlatformProviderAttachment = {
  id: string; organization_id: string; provider_id: string;
  storage_path: string; file_name: string; mime_type: string | null;
  file_size: number; created_at: string;
};
export type PlatformProviderDraft = {
  name: string; document: string; phone: string; whatsapp: string; email: string;
  state: string; city: string; neighborhood: string; street: string;
  street_number: string; zip_code: string; notes: string; is_active: boolean;
};
export type ProviderFilters = {
  search: string; serviceId: string; state: string; city: string;
  status: "all" | "active" | "inactive"; page: number; pageSize: number;
};

export const emptyProviderDraft = (): PlatformProviderDraft => ({
  name: "", document: "", phone: "", whatsapp: "", email: "",
  state: "", city: "", neighborhood: "", street: "", street_number: "",
  zip_code: "", notes: "", is_active: true,
});

export function draftFromProvider(provider: PlatformProvider): PlatformProviderDraft {
  return {
    name: provider.name, document: provider.document || "",
    phone: provider.phone || "", whatsapp: provider.whatsapp || "",
    email: provider.email || "", state: provider.state, city: provider.city,
    neighborhood: provider.neighborhood || "", street: provider.street || "",
    street_number: provider.street_number || "", zip_code: provider.zip_code || "",
    notes: provider.notes || "", is_active: provider.is_active,
  };
}

export async function listPlatformServices(orgId: string): Promise<PlatformService[]> {
  const { data, error } = await supabase.from("platform_provider_services")
    .select("id,organization_id,name,is_active").eq("organization_id", orgId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []) as PlatformService[];
}

export async function addPlatformService(orgId: string, name: string): Promise<PlatformService> {
  const normalized = name.trim();
  if (normalized.length < 2 || normalized.length > 120) throw new Error("Informe um serviço com 2 a 120 caracteres.");
  const { data, error } = await supabase.from("platform_provider_services")
    .insert({ organization_id: orgId, name: normalized })
    .select("id,organization_id,name,is_active").single();
  if (error) throw error;
  return data as PlatformService;
}

export async function editPlatformService(orgId: string, id: string, fields: {name?: string; is_active?: boolean}) {
  if (fields.name !== undefined && (fields.name.trim().length < 2 || fields.name.trim().length > 120)) {
    throw new Error("Informe um nome válido com 2 a 120 caracteres.");
  }
  const { error } = await supabase.from("platform_provider_services")
    .update({ ...fields, ...(fields.name !== undefined ? { name: fields.name.trim() } : {}), updated_at: new Date().toISOString() })
    .eq("organization_id", orgId).eq("id", id);
  if (error) throw error;
}

export async function listPlatformProviders(filters: ProviderFilters): Promise<{ providers: PlatformProvider[]; total: number }> {
  const { data, error } = await supabase.rpc("list_platform_service_providers", {
    p_search: filters.search.trim(), p_service_id: filters.serviceId || null,
    p_state: filters.state, p_city: filters.city, p_status: filters.status,
    p_limit: filters.pageSize, p_offset: (filters.page - 1) * filters.pageSize,
  });
  if (error) throw error;
  const providers = (data || []) as PlatformProvider[];
  return { providers, total: Number(providers[0]?.total_count || 0) };
}

export async function listProviderLocations(): Promise<Array<{ state: string; city: string }>> {
  const { data, error } = await supabase.rpc("list_platform_provider_locations");
  if (error) throw error;
  return (data || []) as Array<{ state: string; city: string }>;
}

export async function savePlatformProvider(
  id: string | null, draft: PlatformProviderDraft, services: string[],
): Promise<string> {
  if (draft.name.trim().length < 2) throw new Error("Informe o nome do prestador.");
  if (!draft.state || draft.state.length !== 2 || draft.city.trim().length < 2) {
    throw new Error("Informe estado e cidade do prestador.");
  }
  if (!draft.phone.trim() && !draft.whatsapp.trim()) throw new Error("Informe um telefone ou WhatsApp.");
  if (!services.length) throw new Error("Marque ao menos um serviço prestado.");
  const { data, error } = await supabase.rpc("save_platform_service_provider", {
    p_provider_id: id, p_payload: draft, p_service_ids: services,
  });
  if (error) throw error;
  if (!data) throw new Error("Não foi possível obter o prestador salvo.");
  return String(data);
}

export async function listProviderAttachments(orgId: string, providerId: string): Promise<PlatformProviderAttachment[]> {
  const { data, error } = await supabase.from("platform_provider_attachments")
    .select("id,organization_id,provider_id,storage_path,file_name,mime_type,file_size,created_at")
    .eq("organization_id", orgId).eq("provider_id", providerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as PlatformProviderAttachment[];
}

const mimeByExtension: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg",
  png: "image/png", webp: "image/webp", txt: "text/plain",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export async function addProviderAttachment(orgId: string, providerId: string, file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  const mime = mimeByExtension[extension];
  if (!mime) throw new Error("Formato não aceito. Use PDF, imagem, TXT, DOC ou DOCX.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Cada anexo deve ter no máximo 10 MB.");
  const path = orgId + "/" + providerId + "/" + crypto.randomUUID() + "." + extension;
  const { error: uploadError } = await supabase.storage.from(PLATFORM_PROVIDER_BUCKET)
    .upload(path, file, { contentType: mime, upsert: false });
  if (uploadError) throw uploadError;
  const { error } = await supabase.from("platform_provider_attachments")
    .insert({ organization_id: orgId, provider_id: providerId, storage_path: path,
      file_name: file.name.slice(0, 250), mime_type: mime, file_size: file.size });
  if (error) {
    await supabase.storage.from(PLATFORM_PROVIDER_BUCKET).remove([path]);
    throw error;
  }
}

export async function openProviderAttachment(attachment: PlatformProviderAttachment) {
  const { data, error } = await supabase.storage.from(PLATFORM_PROVIDER_BUCKET)
    .createSignedUrl(attachment.storage_path, 60);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Anexo indisponível.");
  const anchor = document.createElement("a");
  anchor.href = data.signedUrl; anchor.target = "_blank"; anchor.rel = "noopener noreferrer";
  anchor.click();
}

export async function removeProviderAttachment(attachment: PlatformProviderAttachment) {
  const { error } = await supabase.from("platform_provider_attachments")
    .delete().eq("id", attachment.id).eq("organization_id", attachment.organization_id);
  if (error) throw error;
  const removed = await supabase.storage.from(PLATFORM_PROVIDER_BUCKET).remove([attachment.storage_path]);
  if (removed.error) throw removed.error;
}

export type ProviderBackgroundCheck = {
  id: string; provider_id: string; source: "policia_federal" | "justica_estadual";
  uf: string; result: "processing" | "negative" | "review" | "inconclusive" | "error";
  source_status: string | null; certificate_number: string | null; validation_code: string | null;
  issue_date: string | null; valid_until: string | null; request_date: string;
  completed_at: string | null; error_reason: string | null;
};

export type BackgroundCheckRequest = {
  providerId: string; source: "policia_federal" | "justica_estadual";
  purpose: string; informedDeclaration: boolean;
  motherName?: string; fatherName?: string; rg?: string; birthDate?: string;
};

export async function listProviderBackgroundChecks(organizationId: string, providerId: string) {
  const {data,error} = await supabase.from("platform_provider_background_checks")
    .select("id,provider_id,source,uf,result,source_status,certificate_number,validation_code,issue_date,valid_until,request_date,completed_at,error_reason")
    .eq("organization_id",organizationId).eq("provider_id",providerId)
    .order("request_date",{ascending:false}).limit(15);
  if (error) throw error;
  return (data||[]) as ProviderBackgroundCheck[];
}

export async function requestProviderBackgroundCheck(payload: BackgroundCheckRequest) {
  const {data,error} = await supabase.functions.invoke("platform-provider-background-check",{
    body:payload,
  });
  if (error) {
    const failureResponse = (error as {context?: unknown}).context;
    if (failureResponse instanceof Response) {
      try {
        const failure = await failureResponse.clone().json() as {error?: string};
        if (failure?.error) throw new Error(failure.error);
      } catch (failure) {
        if (failure instanceof Error && failure.message !== "Unexpected end of JSON input") {
          throw failure;
        }
      }
    }
    throw error;
  }
  if (data?.error) throw new Error(String(data.error));
  return data as {success:true;checkId:string;result:string;source_status:string};
}
