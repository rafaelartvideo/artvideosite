import { supabase } from "@/lib/supabase";

export type ManagementSpace = {
  id: string; slug: string; name: string; description: string; icon_text: string;
  accent_color: string; logo_path: string | null; is_archived: boolean; created_at: string; updated_at: string;
};
export type ManagementFolder = {
  id: string; space_id: string; parent_id: string | null; name: string;
  created_at: string; updated_at: string;
};
export type ManagementKind = "note" | "account" | "website" | "campaign" | "link" | "file";
export type ManagementRecord = {
  id: string; space_id: string; folder_id: string; title: string; kind: ManagementKind;
  deleted_at?: string | null; deleted_by?: string | null;
  description: string; url: string | null; metadata: Record<string, unknown>;
  storage_path: string | null; mime_type: string | null; size_bytes: number | null;
  created_at: string; updated_at: string;
};
const BUCKET = "union-management";
const ROOT_FOLDERS = ["Contas e acessos", "Sites e domínios", "Imagens e mídias", "Arquivos", "Campanhas", "Documentos", "Projetos"];
function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}
export async function listManagementSpaces(): Promise<ManagementSpace[]> {
  return unwrap<ManagementSpace[]>((await supabase.from("management_spaces").select("*").order("name")) as any) || [];
}
export async function createManagementSpace(input: { name: string; description: string; icon_text: string; accent_color: string; }): Promise<ManagementSpace> {
  // Um sufixo aleatório evita colisões entre projetos de nomes iguais.
  const normalized = input.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "projeto";
  const slug = `${normalized.slice(0, 60)}-${crypto.randomUUID().slice(0, 8)}`;
  const space = unwrap((await supabase.from("management_spaces").insert({ ...input, slug }).select("*").single()) as any) as ManagementSpace;
  // Se a criação das pastas falhar, o espaço permanece para permitir recuperação.
  const { error } = await supabase.from("management_folders").insert(ROOT_FOLDERS.map(name => ({ space_id: space.id, name })));
  if (error) throw new Error("Espaço criado, mas não foi possível preparar as pastas: " + error.message);
  return space;
}
export async function updateManagementSpace(id: string, input: Partial<Pick<ManagementSpace,"name"|"description"|"icon_text"|"accent_color"|"is_archived">>) {
  const { error } = await supabase.from("management_spaces").update(input).eq("id", id);
  if (error) throw error;
}
export async function listManagementFolders(spaceId: string): Promise<ManagementFolder[]> {
  return unwrap<ManagementFolder[]>((await supabase.from("management_folders").select("*").eq("space_id",spaceId).order("name")) as any) || [];
}
export async function createManagementFolder(spaceId: string, parentId: string | null, name: string) {
  const { error } = await supabase.from("management_folders").insert({ space_id:spaceId, parent_id:parentId, name });
  if (error) throw error;
}
export async function renameManagementFolder(id: string, name: string) {
  const { error } = await supabase.from("management_folders").update({name}).eq("id",id);
  if (error) throw error;
}
export async function removeManagementFolder(id: string) {
  const { error } = await supabase.rpc("management_trash_folder", { p_folder:id, p_restore:false });
  if (error) throw error;
}
export async function restoreManagementFolder(id: string) {
  const { error } = await supabase.rpc("management_trash_folder", { p_folder:id, p_restore:true });
  if (error) throw error;
}
export async function listManagementRecords(spaceId: string): Promise<ManagementRecord[]> {
  // Paginação por lotes no banco para não impor um limite silencioso de 1.000 registros.
  const result: ManagementRecord[] = [];
  for (let offset=0;;offset+=200) {
    const page = unwrap((await supabase.from("management_records").select("*").eq("space_id",spaceId).order("created_at",{ascending:false}).range(offset,offset+199)) as any) as ManagementRecord[] || [];
    result.push(...page);
    if (page.length<200) return result;
  }
}
export async function saveManagementRecord(input: {
  id?: string; space_id: string; folder_id: string; title: string;
  kind: Exclude<ManagementKind,"file">; description: string; url: string | null;
  metadata?: Record<string,unknown>;
}) {
  const payload = {space_id:input.space_id,folder_id:input.folder_id,title:input.title,
    kind:input.kind,description:input.description,url:input.url,metadata:input.metadata ?? {}};
  const query = input.id
    ? supabase.from("management_records").update(payload).eq("id",input.id)
    : supabase.from("management_records").insert(payload);
  const {data,error} = await query.select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}
export async function removeManagementRecord(record: ManagementRecord) {
  // Lixeira recuperável: não apaga arquivos nem versões neste fluxo.
  const {error} = await supabase.from("management_records")
    .update({ deleted_at: new Date().toISOString() }).eq("id",record.id);
  if (error) throw error;
}
export async function restoreManagementRecord(recordId: string) {
  const {error} = await supabase.from("management_records")
    .update({ deleted_at: null, deleted_by: null }).eq("id",recordId);
  if (error) throw error;
}
export async function uploadManagementFiles(spaceId: string, folderId: string, files: File[]) {
  for(const file of files) {
    if(file.size>25*1024*1024) throw new Error("O limite é de 25 MB por arquivo.");
    const extension = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g,"").slice(0,10) || "bin";
    const path = `${spaceId}/${folderId}/${crypto.randomUUID()}.${extension}`;
    const uploaded = await supabase.storage.from(BUCKET).upload(path,file,{contentType:file.type || "application/octet-stream"});
    if(uploaded.error) throw uploaded.error;
    const {data,error} = await supabase.from("management_records").insert({
      space_id:spaceId,folder_id:folderId,title:file.name,kind:"file",
      description:"",storage_path:path,mime_type:file.type || null,size_bytes:file.size,
    }).select("id").single();
    if(error) {
      await supabase.storage.from(BUCKET).remove([path]);
      throw error;
    }
    // Todo arquivo nasce com versão 1; versões futuras nunca sobrescrevem o original.
    const {error:versionError} = await supabase.rpc("management_register_file_version",{
      p_record:data.id,p_path:path,p_mime:file.type || "application/octet-stream",p_size:file.size,
    });
    if(versionError) {
      await supabase.from("management_records").delete().eq("id",data.id);
      await supabase.storage.from(BUCKET).remove([path]);
      throw versionError;
    }
  }
}
export async function openManagementFile(path: string) {
  const {data,error} = await supabase.storage.from(BUCKET).createSignedUrl(path,60);
  if(error) throw error;
  return data.signedUrl;
}

export async function uploadManagementLogo(spaceId: string, file: File, previousPath?: string | null) {
  if(!["image/png","image/jpeg","image/webp"].includes(file.type)) throw new Error("Use PNG, JPG ou WebP para a logomarca.");
  if(file.size>3*1024*1024) throw new Error("A logomarca deve ter no máximo 3 MB.");
  const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
  const path=`${spaceId}/logos/${crypto.randomUUID()}.${ext}`;
  const uploaded=await supabase.storage.from(BUCKET).upload(path,file,{contentType:file.type});
  if(uploaded.error) throw uploaded.error;
  const {error}=await supabase.from("management_spaces").update({logo_path:path}).eq("id",spaceId);
  if(error){await supabase.storage.from(BUCKET).remove([path]);throw error;}
  if(previousPath)await supabase.storage.from(BUCKET).remove([previousPath]);
}
export async function managementLogoUrl(path:string) {
  return openManagementFile(path);
}

export type ManagementActivity = {
  id: number; space_id: string; entity_type: string; entity_id: string;
  operation: string; label: string; actor_user_id: string | null; created_at: string;
};
export type ManagementFileVersion = {
  id: string; record_id: string; version_no: number; storage_path: string;
  mime_type: string | null; size_bytes: number; created_at: string;
};
export async function listManagementActivity(spaceId: string): Promise<ManagementActivity[]> {
  const {data,error} = await supabase.from("management_activity").select("*")
    .eq("space_id",spaceId).order("created_at",{ascending:false}).limit(100);
  if(error) throw error;
  return (data || []) as ManagementActivity[];
}
export async function listManagementFileVersions(recordId: string): Promise<ManagementFileVersion[]> {
  const {data,error} = await supabase.from("management_file_versions").select("*")
    .eq("record_id",recordId).order("version_no",{ascending:false});
  if(error) throw error;
  return (data || []) as ManagementFileVersion[];
}
export async function uploadManagementFileVersion(record: ManagementRecord, file: File) {
  if(record.kind!=="file" || !record.storage_path) throw new Error("Registro de arquivo inválido.");
  if(file.size>25*1024*1024) throw new Error("Limite de 25 MB por versão.");
  const extension = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g,"").slice(0,10) || "bin";
  const path = `${record.space_id}/${record.folder_id}/${crypto.randomUUID()}.${extension}`;
  const uploaded = await supabase.storage.from(BUCKET).upload(path,file,{contentType:file.type||"application/octet-stream"});
  if(uploaded.error) throw uploaded.error;
  const {error} = await supabase.rpc("management_register_file_version",{
    p_record:record.id, p_path:path, p_mime:file.type||"application/octet-stream", p_size:file.size,
  });
  if(error) { await supabase.storage.from(BUCKET).remove([path]); throw error; }
}
export async function hasManagementCredential(recordId: string): Promise<boolean> {
  const {data,error} = await supabase.rpc("management_vault_has_secret",{p_record:recordId});
  if(error) throw error;
  return data === true;
}
export async function saveManagementCredential(recordId: string, secret: string): Promise<void> {
  const {error} = await supabase.rpc("management_vault_write",{p_record:recordId,p_secret:secret});
  if(error) throw error;
}
export async function revealManagementCredential(recordId: string): Promise<string | null> {
  const {data,error} = await supabase.rpc("management_vault_reveal",{p_record:recordId});
  if(error) throw error;
  return data as string | null;
}
export async function loadManagementTasks(spaceId: string) {
  const {data,error} = await supabase.from("work_items")
    .select("id,title,status,due_at,priority,created_at")
    .eq("management_space_id",spaceId).order("created_at",{ascending:false}).limit(150);
  if(error) throw error;
  return (data||[]) as {id:string;title:string;status:string;due_at:string|null;priority:string;created_at:string}[];
}
export async function createManagementTask(input:{
  organizationId:string;spaceId:string;title:string;dueAt:string|null;priority:"normal"|"high"|"urgent";
}) {
  const {error} = await supabase.from("work_items").insert({
    organization_id:input.organizationId, management_space_id:input.spaceId,
    title:input.title.trim(),kind:"task",status:"pending",priority:input.priority,
    category:"Central de Gestão",description:"",due_at:input.dueAt,reminder_minutes:input.dueAt?[1440,60]:[],
    assigned_employee_ids:[],
  });
  if(error) throw error;
}
