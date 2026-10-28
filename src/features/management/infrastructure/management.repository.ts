import { supabase } from "@/lib/supabase";

export type ManagementSpace = {
  id: string; slug: string; name: string; description: string; icon_text: string;
  accent_color: string; is_archived: boolean; created_at: string; updated_at: string;
};
export type ManagementFolder = {
  id: string; space_id: string; parent_id: string | null; name: string;
  created_at: string; updated_at: string;
};
export type ManagementKind = "note" | "account" | "website" | "campaign" | "link" | "file";
export type ManagementRecord = {
  id: string; space_id: string; folder_id: string; title: string; kind: ManagementKind;
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
  return unwrap((await supabase.from("management_spaces").select("*").order("name")) as any) || [];
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
  return unwrap((await supabase.from("management_folders").select("*").eq("space_id",spaceId).order("name")) as any) || [];
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
  const { error } = await supabase.from("management_folders").delete().eq("id",id);
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
  const {error} = await query;
  if (error) throw error;
}
export async function removeManagementRecord(record: ManagementRecord) {
  if (record.storage_path) {
    const {error} = await supabase.storage.from(BUCKET).remove([record.storage_path]);
    if (error) throw error;
  }
  const {error} = await supabase.from("management_records").delete().eq("id",record.id);
  if (error) throw error;
}
export async function uploadManagementFiles(spaceId: string, folderId: string, files: File[]) {
  for(const file of files) {
    if(file.size>25*1024*1024) throw new Error("O limite é de 25 MB por arquivo.");
    const extension = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g,"").slice(0,10) || "bin";
    const path = `${spaceId}/${folderId}/${crypto.randomUUID()}.${extension}`;
    const uploaded = await supabase.storage.from(BUCKET).upload(path,file,{contentType:file.type || "application/octet-stream"});
    if(uploaded.error) throw uploaded.error;
    const {error} = await supabase.from("management_records").insert({
      space_id:spaceId,folder_id:folderId,title:file.name,kind:"file",
      description:"",storage_path:path,mime_type:file.type || null,size_bytes:file.size,
    });
    if(error) {
      await supabase.storage.from(BUCKET).remove([path]);
      throw error;
    }
  }
}
export async function openManagementFile(path: string) {
  const {data,error} = await supabase.storage.from(BUCKET).createSignedUrl(path,60);
  if(error) throw error;
  return data.signedUrl;
}
