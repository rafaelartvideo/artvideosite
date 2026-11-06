import { supabase } from "@/lib/supabase";
import { extensionForUploadFile, prepareFileForUpload } from "@/shared/application/upload-file-optimizer";

export const PLATFORM_PROVIDER_BUCKET = "platform-provider-documents";
export type PlatformService = {
  id: string; organization_id: string; name: string; is_active: boolean;
  equipment_name: string | null;
  profession_name: string;
};
export type PlatformProvider = {
  id: string; name: string; profession: string | null; document: string | null;
  phone: string | null; whatsapp: string | null; email: string | null;
  instagram: string | null;
  state: string; city: string; neighborhood: string | null;
  street: string | null; street_number: string | null; zip_code: string | null;
  person_type: "PF" | "PJ"; birth_date: string | null; gender: "M" | "F" | "I" | null;
  legal_name: string | null; complement: string | null;
  notes: string | null; is_active: boolean; service_ids: string[];
  service_names: string[]; attachment_count: number; total_count: number;
};
export type PlatformProviderAttachment = {
  id: string; organization_id: string; provider_id: string;
  storage_path: string; file_name: string; mime_type: string | null;
  file_size: number; created_at: string;
};
export type PlatformProviderDraft = {
  name: string; profession: string; document: string; phone: string; whatsapp: string; email: string; instagram: string;
  state: string; city: string; neighborhood: string; street: string;
  street_number: string; zip_code: string; notes: string; is_active: boolean;
  person_type: "PF" | "PJ"; birth_date: string; gender: "M" | "F" | "I" | "";
  legal_name: string; complement: string;
};
export type ProviderFilters = {
  search: string; serviceIds: string[]; equipmentNames: string[]; states: string[]; cities: string[];
  statuses: ("active" | "inactive")[]; page: number; pageSize: number;
};

export const emptyProviderDraft = (): PlatformProviderDraft => ({
  name: "", profession: "", document: "", phone: "", whatsapp: "", email: "", instagram: "",
  state: "", city: "", neighborhood: "", street: "", street_number: "",
  zip_code: "", notes: "", is_active: true,
  person_type: "PF", birth_date: "", gender: "", legal_name: "", complement: "",
});

export function draftFromProvider(provider: PlatformProvider): PlatformProviderDraft {
  return {
    name: provider.name, profession: provider.profession || "", document: provider.document || "",
    phone: provider.phone || "", whatsapp: provider.whatsapp || "",
    email: provider.email || "", instagram: provider.instagram || "",
    state: provider.state, city: provider.city,
    neighborhood: provider.neighborhood || "", street: provider.street || "",
    street_number: provider.street_number || "", zip_code: provider.zip_code || "",
    notes: provider.notes || "", is_active: provider.is_active,
    person_type: provider.person_type || (provider.document?.replace(/\D/g, "").length === 14 ? "PJ" : "PF"),
    birth_date: provider.birth_date || "", gender: provider.gender || "",
    legal_name: provider.legal_name || "", complement: provider.complement || "",
  };
}

export async function listPlatformServices(orgId: string): Promise<PlatformService[]> {
  const { data, error } = await supabase.from("platform_provider_services")
    .select("id,organization_id,name,is_active,equipment_name,profession_name").eq("organization_id", orgId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []) as PlatformService[];
}

export async function addPlatformService(orgId: string, name: string, professionName: string, equipmentName = ""): Promise<PlatformService> {
  const normalized = name.trim();
  const equipment = equipmentName.trim();
  const profession = professionName.trim();
  if (profession.length < 2 || profession.length > 120) throw new Error("Informe uma profissão com 2 a 120 caracteres.");
  if (normalized.length < 2 || normalized.length > 120) throw new Error("Informe um serviço com 2 a 120 caracteres.");
  if (equipment.length > 120 || (equipment.length > 0 && equipment.length < 2)) throw new Error("O equipamento deve ter entre 2 e 120 caracteres.");
  const { data, error } = await supabase.from("platform_provider_services")
    .insert({ organization_id: orgId, name: normalized, profession_name: profession, equipment_name: equipment || null })
    .select("id,organization_id,name,is_active,equipment_name,profession_name").single();
  if (error) throw error;
  return data as PlatformService;
}

export type PlatformServiceBatchItem = { name: string; equipment_name: string | null; profession_name: string };

export async function addPlatformServices(orgId: string, items: PlatformServiceBatchItem[]): Promise<PlatformService[]> {
  if (!items.length || items.length > 50) throw new Error("Informe entre 1 e 50 serviços por lote.");
  const normalized = items.map(item => ({
    organization_id: orgId,
    name: item.name.trim(),
    profession_name: item.profession_name.trim(),
    equipment_name: item.equipment_name?.trim() || null,
  }));
  const keys = normalized.map(item => `${item.profession_name.toLocaleLowerCase("pt-BR")}|${(item.equipment_name || "").toLocaleLowerCase("pt-BR")}|${item.name.toLocaleLowerCase("pt-BR")}`);
  if (new Set(keys).size !== keys.length) throw new Error("O lote contém serviços repetidos na mesma categoria.");
  if (normalized.some(item => item.profession_name.length < 2 || item.profession_name.length > 120 ||
      item.name.length < 2 || item.name.length > 120 ||
      (item.equipment_name !== null && (item.equipment_name.length < 2 || item.equipment_name.length > 120)))) {
    throw new Error("Informe nomes de serviços e equipamentos entre 2 e 120 caracteres.");
  }
  // Uma unica requisicao INSERT: ou todos os itens sao gravados ou nenhum, sem gravacao parcial.
  const { data, error } = await supabase.from("platform_provider_services")
    .insert(normalized).select("id,organization_id,name,is_active,equipment_name,profession_name");
  if (error?.code === "23505") throw new Error("Um ou mais serviços já existem nessa categoria. Revise os nomes antes de cadastrar o lote.");
  if (error) throw error;
  return (data || []) as PlatformService[];
}

export async function deletePlatformService(orgId: string, serviceId: string): Promise<void> {
  const { count, error: countError } = await supabase.from("platform_provider_service_links")
    .select("provider_id", { head: true, count: "exact" })
    .eq("organization_id", orgId).eq("service_id", serviceId);
  if (countError) throw countError;
  if ((count || 0) > 0) throw new Error(`Este serviço está vinculado a ${count} prestador(es). Remova os vínculos antes de excluir ou utilize Desativar.`);
  const { data, error } = await supabase.from("platform_provider_services")
    .delete().eq("organization_id", orgId).eq("id", serviceId).select("id");
  if (error?.code === "23503") throw new Error("Este serviço ainda está vinculado a um prestador. Remova o vínculo antes de excluir.");
  if (error) throw error;
  if (!data?.length) throw new Error("Serviço não encontrado ou sem permissão para excluir.");
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
  const { data, error } = await supabase.rpc("list_platform_service_providers_v6", {
    p_search: filters.search.trim(), p_service_ids: filters.serviceIds,
    p_equipment_names: filters.equipmentNames,
    p_states: filters.states, p_cities: filters.cities, p_statuses: filters.statuses,
    p_limit: filters.pageSize, p_offset: (filters.page - 1) * filters.pageSize,
  });
  if (error) throw error;
  const providers = (data || []) as PlatformProvider[];
  return { providers, total: Number(providers[0]?.total_count || 0) };
}

export async function countPlatformProviders(orgId: string) {
  const {count,error} = await supabase.from("platform_service_providers")
    .select("id",{head:true,count:"exact"}).eq("organization_id",orgId);
  if (error) throw error;
  return count ?? 0;
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
  if (draft.profession.trim().length > 120 || (draft.profession.trim().length > 0 && draft.profession.trim().length < 2)) {
    throw new Error("Informe uma profissão válida de até 120 caracteres.");
  }
  const { data, error } = await supabase.rpc("save_platform_service_provider", {
    p_provider_id: id, p_payload: draft, p_service_ids: services,
  });
  if (error) throw error;
  if (!data) throw new Error("Não foi possível obter o prestador salvo.");
  return String(data);
}

/**
 * Exclui somente prestadores da empresa operadora que o usuario pode gerenciar.
 * As FKs de servicos, anexos e verificacoes realizam cascade no banco.
 * A limpeza privada dos blobs ocorre depois do delete para nunca remover arquivos
 * se a exclusao do registro falhar.
 */
export async function deletePlatformProvider(orgId: string, providerId: string): Promise<{ orphanedFiles: number }> {
  // Registra os caminhos de todos os anexos antes de excluir suas referencias.
  // Consulta paginada para nao perder documentos se houver mais de 1000 arquivos.
  const paths: string[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("platform_provider_attachments")
      .select("storage_path")
      .eq("organization_id", orgId).eq("provider_id", providerId)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    paths.push(...(data || []).map(item => item.storage_path));
    if (!data || data.length < pageSize) break;
  }

  const { data, error } = await supabase.from("platform_service_providers")
    .delete().eq("organization_id", orgId).eq("id", providerId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Prestador não encontrado ou sem permissão para excluir.");

  // A exclusao do cadastro ja ocorreu. Se o Storage falhar, o chamador
  // informa explicitamente quantos arquivos privados precisam de limpeza.
  let orphanedFiles = 0;
  for (let index = 0; index < paths.length; index += 100) {
    const batch = paths.slice(index, index + 100);
    try {
      const { error: storageError } = await supabase.storage.from(PLATFORM_PROVIDER_BUCKET).remove(batch);
      if (storageError) orphanedFiles += batch.length;
    } catch {
      orphanedFiles += batch.length;
    }
  }
  return { orphanedFiles };
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
  // Camera/OS file pickers can omit MIME: use the validated extension for processing.
  const typedFile = file.type === mime ? file : new File([file], file.name, { type: mime, lastModified: file.lastModified });
  const preparedFile = await prepareFileForUpload(typedFile, "document-image");
  const path = orgId + "/" + providerId + "/" + crypto.randomUUID() + "." + extensionForUploadFile(preparedFile);
  const { error: uploadError } = await supabase.storage.from(PLATFORM_PROVIDER_BUCKET)
    .upload(path, preparedFile, { contentType: preparedFile.type, upsert: false });
  if (uploadError) throw uploadError;
  const { error } = await supabase.from("platform_provider_attachments")
    .insert({ organization_id: orgId, provider_id: providerId, storage_path: path,
      file_name: preparedFile.name.slice(0, 250), mime_type: preparedFile.type, file_size: preparedFile.size });
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
