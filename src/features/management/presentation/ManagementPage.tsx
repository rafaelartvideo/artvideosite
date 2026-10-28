import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, File, FileImage, FileText, Folder, FolderOpen, Globe, KeyRound, Megaphone, MoreVertical, Search, Upload, Link2, BriefcaseBusiness, ArrowLeft, Pencil, Archive } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminButton, AdminCard, AdminCardContent, AdminDialog, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { FInput, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  createManagementFolder, createManagementSpace, listManagementFolders, listManagementRecords, listManagementSpaces,
  openManagementFile, removeManagementFolder, removeManagementRecord, renameManagementFolder,
  saveManagementRecord, updateManagementSpace, uploadManagementFiles,
  type ManagementFolder, type ManagementKind, type ManagementRecord, type ManagementSpace,
} from "../infrastructure/management.repository";

type DialogKind = "space" | "folder" | "record" | null;
type RecordEditKind = Exclude<ManagementKind, "file">;
const TYPES: {value:RecordEditKind;label:string}[] = [
  {value:"note",label:"Anotação"}, {value:"account",label:"Conta / acesso"},
  {value:"website",label:"Site / domínio"}, {value:"campaign",label:"Campanha"}, {value:"link",label:"Link"},
];
const FOLDER_ICONS = [KeyRound, Globe, FileImage, File, Megaphone, FileText, BriefcaseBusiness];
const FOLDER_LABELS = ["Contas e acessos","Sites e domínios","Imagens e mídias","Arquivos","Campanhas","Documentos","Projetos"];
function folderIcon(name: string) {
  const index=FOLDER_LABELS.indexOf(name);
  return index<0 ? Folder : FOLDER_ICONS[index];
}
function formatDate(value:string) {
  return new Date(value).toLocaleDateString("pt-BR");
}
function formatFileSize(size:number|null) {
  if(size==null) return "";
  if(size<1024) return `${size} B`;
  return size<1048576 ? `${(size/1024).toFixed(1)} KB` : `${(size/1048576).toFixed(1)} MB`;
}
export function ManagementPage({spaceId,folderId,onRouteChange}:{
  spaceId?:string|null;folderId?:string|null;
  onRouteChange:(spaceId:string|null,folderId?:string|null)=>void;
}) {
  const {hasPermission}=useAuth();
  const canManage=hasPermission("platform.management.manage");
  const [spaces,setSpaces]=useState<ManagementSpace[]>([]);
  const [folders,setFolders]=useState<ManagementFolder[]>([]);
  const [records,setRecords]=useState<ManagementRecord[]>([]);
  const [loading,setLoading]=useState(true);
  const [contentLoading,setContentLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [search,setSearch]=useState("");
  const [dialog,setDialog]=useState<DialogKind>(null);
  const [editingSpace,setEditingSpace]=useState<ManagementSpace|null>(null);
  const [editingFolder,setEditingFolder]=useState<ManagementFolder|null>(null);
  const [editingRecord,setEditingRecord]=useState<ManagementRecord|null>(null);
  const [name,setName]=useState("");
  const [description,setDescription]=useState("");
  const [iconText,setIconText]=useState("");
  const [accent,setAccent]=useState("#1032DC");
  const [kind,setKind]=useState<RecordEditKind>("note");
  const [url,setUrl]=useState("");
  const [accountUser,setAccountUser]=useState("");
  const [actionMenu,setActionMenu]=useState<string|null>(null);
  const [uploading,setUploading]=useState(false);
  const [revision,setRevision]=useState(0);
  const uploadRef=useRef<HTMLInputElement|null>(null);
  const selectedSpace=spaces.find(s=>s.id===spaceId)||null;
  const selectedFolder=folders.find(f=>f.id===folderId)||null;
  const visibleFolderId=selectedFolder?.id||null;
  const folderChildren=useMemo(()=>folders.filter(f=>f.parent_id===visibleFolderId)
    .filter(f=>f.name.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")))
    .sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")), [folders,visibleFolderId,search]);
  const visibleRecords=useMemo(()=>records.filter(r=>r.folder_id===visibleFolderId)
    .filter(r=>(r.title+" "+r.description).toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")))
    .sort((a,b)=>a.title.localeCompare(b.title,"pt-BR")), [records,visibleFolderId,search]);
  const crumbs=useMemo(()=>{
    const path:ManagementFolder[]=[];
    let current=selectedFolder;
    const seen=new Set<string>();
    while(current && !seen.has(current.id)) {
      path.unshift(current);seen.add(current.id);
      current=folders.find(f=>f.id===current?.parent_id);
    }
    return path;
  },[folders,selectedFolder?.id]);

  useEffect(()=>{
    let current=true;setLoading(true);
    listManagementSpaces().then(data=>{if(current)setSpaces(data);})
      .catch(error=>notifyAdmin(systemErrorMessage(error,"Não foi possível carregar os projetos."),"error"))
      .finally(()=>{if(current)setLoading(false);});
    return()=>{current=false;};
  },[revision]);
  useEffect(()=>{
    if(!spaceId){setFolders([]);setRecords([]);return;}
    let current=true;setContentLoading(true);
    Promise.all([listManagementFolders(spaceId),listManagementRecords(spaceId)]).then(([f,r])=>{
      if(current){setFolders(f);setRecords(r);}
    }).catch(error=>notifyAdmin(systemErrorMessage(error,"Não foi possível carregar as pastas."),"error"))
      .finally(()=>{if(current)setContentLoading(false);});
    return()=>{current=false;};
  },[spaceId,revision]);

  const resetForm=()=>{
    setName("");setDescription("");setIconText("");setAccent("#1032DC");
    setKind("note");setUrl("");setAccountUser("");setEditingSpace(null);setEditingFolder(null);setEditingRecord(null);
  };
  const openSpace=(space?:ManagementSpace)=>{
    resetForm();if(space){setEditingSpace(space);setName(space.name);setDescription(space.description);setIconText(space.icon_text);setAccent(space.accent_color);}
    setDialog("space");
  };
  const openFolder=(folder?:ManagementFolder)=>{
    resetForm();if(folder){setEditingFolder(folder);setName(folder.name);}
    setDialog("folder");
  };
  const openRecord=(record?:ManagementRecord)=>{
    resetForm();if(record){
      if(record.kind==="file")return;
      setEditingRecord(record);setName(record.title);setDescription(record.description);setKind(record.kind);
      setUrl(record.url||"");setAccountUser(String(record.metadata?.username||""));
    }setDialog("record");
  };
  const close=()=>{if(!saving){setDialog(null);resetForm();}};
  const refresh=()=>setRevision(current=>current+1);
  const save=async()=>{
    if(!canManage||saving||!name.trim())return;
    setSaving(true);
    try{
      if(dialog==="space"){
        if(editingSpace) await updateManagementSpace(editingSpace.id,{name:name.trim(),description:description.trim(),icon_text:iconText.trim().slice(0,6),accent_color:accent});
        else await createManagementSpace({name:name.trim(),description:description.trim(),icon_text:iconText.trim().slice(0,6),accent_color:accent});
      } else if(dialog==="folder"&&spaceId){
        if(editingFolder)await renameManagementFolder(editingFolder.id,name.trim());
        else await createManagementFolder(spaceId,visibleFolderId,name.trim());
      } else if(dialog==="record"&&spaceId&&visibleFolderId){
        await saveManagementRecord({id:editingRecord?.id,space_id:spaceId,folder_id:visibleFolderId,
          title:name.trim(),kind,description:description.trim(),url:url.trim()||null,
          metadata:kind==="account"?{username:accountUser.trim()}:{}});
      }
      notifyAdmin("Registro salvo.");
      setDialog(null);resetForm();refresh();
    }catch(error){notifyAdmin(systemErrorMessage(error,"Não foi possível salvar."),"error");}
    finally{setSaving(false);}
  };
  const archiveSpace=async(space:ManagementSpace)=>{
    if(!window.confirm(`Deseja ${space.is_archived?"restaurar":"arquivar"} o espaço "${space.name}"?`))return;
    try{await updateManagementSpace(space.id,{is_archived:!space.is_archived});refresh();notifyAdmin("Espaço atualizado.");}
    catch(error){notifyAdmin(systemErrorMessage(error),"error");}
  };
  const deleteFolder=async(folder:ManagementFolder)=>{
    if(!window.confirm(`Excluir a pasta "${folder.name}" e todo o seu conteúdo? Esta ação não pode ser desfeita.`))return;
    try{await removeManagementFolder(folder.id);refresh();notifyAdmin("Pasta excluída.");}
    catch(error){notifyAdmin(systemErrorMessage(error),"error");}
  };
  const deleteRecord=async(record:ManagementRecord)=>{
    if(!window.confirm(`Excluir "${record.title}" definitivamente?`))return;
    try{await removeManagementRecord(record);refresh();notifyAdmin("Registro excluído.");}
    catch(error){notifyAdmin(systemErrorMessage(error),"error");}
  };
  const upload=async(files:FileList|null)=>{
    if(!files?.length||!spaceId||!visibleFolderId)return;
    setUploading(true);
    try{await uploadManagementFiles(spaceId,visibleFolderId,Array.from(files));refresh();notifyAdmin("Arquivo enviado.");}
    catch(error){notifyAdmin(systemErrorMessage(error,"Não foi possível enviar o arquivo."),"error");}
    finally{setUploading(false);if(uploadRef.current)uploadRef.current.value="";}
  };
  const openFile=async(record:ManagementRecord)=>{
    if(!record.storage_path)return;
    try{
      const signedUrl=await openManagementFile(record.storage_path);
      window.open(signedUrl,"_blank","noopener,noreferrer");
    }catch(error){notifyAdmin(systemErrorMessage(error,"Não foi possível abrir o arquivo."),"error");}
  };
  const navigateFolder=(id:string|null)=>{setSearch("");setActionMenu(null);onRouteChange(spaceId||null,id);};

  return <div className="min-w-0 space-y-5">
    <PageHeader title="Central de Gestão" subtitle="Organize seus projetos, contas, sites, arquivos e campanhas em um só lugar."/>
    <AdminCard>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
          <button type="button" onClick={()=>{setSearch("");onRouteChange(null,null);}} className="font-semibold text-primary hover:underline">Meus espaços</button>
          {selectedSpace&&<>
            <ChevronRight size={15} className="text-muted-foreground"/>
            <button type="button" onClick={()=>navigateFolder(null)} className={crumbs.length?"text-primary hover:underline":"font-semibold text-foreground"}>{selectedSpace.name}</button>
            {crumbs.map((folder,i)=><span key={folder.id} className="inline-flex items-center gap-1">
              <ChevronRight size={15} className="text-muted-foreground"/>
              <button type="button" className={i===crumbs.length-1?"font-semibold text-foreground":"text-primary hover:underline"} onClick={()=>navigateFolder(folder.id)}>{folder.name}</button>
            </span>)}
          </>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedSpace&&<AdminButton variant="secondary" size="sm" onClick={()=>selectedFolder?navigateFolder(selectedFolder.parent_id):onRouteChange(null,null)}>Voltar</AdminButton>}
          {canManage&&(selectedSpace
            ? <><AdminButton size="sm" variant="secondary" onClick={()=>openFolder()}>Nova pasta</AdminButton>
              {visibleFolderId&&<>
                <AdminButton size="sm" variant="secondary" onClick={()=>uploadRef.current?.click()} loading={uploading}>Enviar arquivo</AdminButton>
                <AdminButton size="sm" onClick={()=>openRecord()}>Novo registro</AdminButton>
              </>}</>
            : <AdminButton size="sm" onClick={()=>openSpace()}>Novo espaço</AdminButton>)}
          <input ref={uploadRef} className="hidden" type="file" multiple onChange={e=>void upload(e.target.files)}/>
        </div>
      </div>
      <div className="p-4 sm:p-5">
        <div className="relative mb-5 max-w-lg">
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={selectedSpace?"Buscar nesta pasta...":"Buscar espaços..."}
            className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-3 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"/>
        </div>
        {loading || contentLoading ? <LoadingState text="Carregando Central de Gestão..."/> : !selectedSpace ? <>
          <h3 className="mb-3 text-sm font-bold text-foreground">Espaços</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {spaces.filter(s=>(s.name+" "+s.description).toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))).map(space=><div key={space.id}
              className="group relative flex min-h-36 flex-col justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/40">
              <button type="button" className="absolute inset-0 z-0 rounded-xl" aria-label={`Abrir ${space.name}`} onClick={()=>{setSearch("");onRouteChange(space.id,null);}}/>
              <div className="pointer-events-none relative flex items-start justify-between gap-2">
                <div style={{backgroundColor:space.accent_color}} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white">
                  {space.icon_text||space.name.slice(0,2).toUpperCase()}
                </div>
                <Folder size={22} style={{color:space.accent_color}}/>
              </div>
              <div className="pointer-events-none relative mt-4 min-w-0">
                <p className="truncate text-sm font-bold text-foreground">{space.name}{space.is_archived?" · Arquivado":""}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{space.description||"Espaço de trabalho"}</p>
              </div>
              {canManage&&<div className="absolute right-3 bottom-3 z-10 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                <button type="button" title="Editar espaço" aria-label="Editar espaço" className="rounded-md bg-card p-1.5 text-muted-foreground hover:text-primary" onClick={()=>openSpace(space)}><Pencil size={15}/></button>
                <button type="button" title={space.is_archived?"Restaurar":"Arquivar"} aria-label={space.is_archived?"Restaurar":"Arquivar"} className="rounded-md bg-card p-1.5 text-muted-foreground hover:text-primary" onClick={()=>void archiveSpace(space)}><Archive size={15}/></button>
              </div>}
            </div>)}
          </div>
          {!spaces.length&&<p className="py-12 text-center text-sm text-muted-foreground">Nenhum espaço cadastrado.</p>}
        </> : <>
          <div className="mb-4 flex items-center gap-3">
            <div style={{backgroundColor:selectedSpace.accent_color}} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-black text-white">{selectedSpace.icon_text||"P"}</div>
            <div><h3 className="font-bold text-foreground">{selectedFolder?.name||selectedSpace.name}</h3>
              <p className="text-xs text-muted-foreground">{folderChildren.length} pastas · {visibleRecords.length} registros</p></div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {folderChildren.map(folder=>{
              const Icon=folderIcon(folder.name);
              return <div key={folder.id} className="group relative flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:border-primary/40 hover:bg-muted/30">
                <button type="button" onClick={()=>navigateFolder(folder.id)} className="absolute inset-0" aria-label={`Abrir pasta ${folder.name}`}/>
                <Icon size={25} className="pointer-events-none relative shrink-0 text-primary"/>
                <span className="pointer-events-none relative min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{folder.name}</span>
                {canManage&&<div className="relative z-10">
                  <button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label={`Opções de ${folder.name}`} onClick={()=>setActionMenu(actionMenu===folder.id?null:folder.id)}><MoreVertical size={17}/></button>
                  {actionMenu===folder.id&&<div className="absolute right-0 top-full z-30 mt-1 w-36 rounded-lg border border-border bg-card p-1 shadow-xl">
                    <button className="w-full rounded px-3 py-2 text-left text-xs hover:bg-muted" onClick={()=>{setActionMenu(null);openFolder(folder);}}>Renomear</button>
                    <button className="w-full rounded px-3 py-2 text-left text-xs text-red-600 hover:bg-muted" onClick={()=>{setActionMenu(null);void deleteFolder(folder);}}>Excluir</button>
                  </div>}
                </div>}
              </div>;
            })}
            {visibleRecords.map(record=>{
              const Icon=record.kind==="website"?Globe:record.kind==="account"?KeyRound:record.kind==="campaign"?Megaphone:record.kind==="link"?Link2:record.kind==="file"?File:FileText;
              return <div key={record.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-3">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={()=>record.kind==="file"?void openFile(record):openRecord(record)}>
                  <Icon size={24} className="shrink-0 text-muted-foreground"/>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-foreground">{record.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{record.kind==="file"?formatFileSize(record.size_bytes):record.description||record.url||"Registro"} · {formatDate(record.created_at)}</span>
                  </span>
                </button>
                {canManage&&<button type="button" aria-label={`Excluir ${record.title}`} title="Excluir registro" onClick={()=>void deleteRecord(record)} className="rounded p-2 text-xs text-muted-foreground hover:text-red-600">Excluir</button>}
              </div>;
            })}
          </div>
          {!folderChildren.length&&!visibleRecords.length&&<div className="flex flex-col items-center gap-2 py-14 text-center">
            <FolderOpen size={34} className="text-muted-foreground"/>
            <p className="text-sm font-medium text-foreground">{search?"Nada encontrado.":"Esta pasta está vazia."}</p>
            <p className="text-xs text-muted-foreground">Crie uma pasta ou adicione registros para organizar o conteúdo.</p>
          </div>}
        </>}
      </div>
    </AdminCard>
    <AdminDialog open={dialog!==null} title={dialog==="space"?(editingSpace?"Editar espaço":"Novo espaço"):dialog==="folder"?(editingFolder?"Renomear pasta":"Nova pasta"):(editingRecord?"Editar registro":"Novo registro")}
      onClose={close} footer={<div className="flex justify-end gap-2"><AdminButton variant="secondary" onClick={close} disabled={saving}>Cancelar</AdminButton><AdminButton onClick={()=>void save()} loading={saving} disabled={!name.trim()}>Salvar</AdminButton></div>}>
      <div className="space-y-4">
        <FInput label="Nome" value={name} required onChange={e=>setName(e.target.value)} maxLength={dialog==="record"?160:100}/>
        {dialog==="space"&&<>
          <FTextarea label="Descrição" value={description} onChange={e=>setDescription(e.target.value)}/>
          <div className="grid grid-cols-2 gap-3">
            <FInput label="Iniciais / ícone" value={iconText} onChange={e=>setIconText(e.target.value)} maxLength={6}/>
            <div><label className="mb-2 block text-xs font-semibold text-foreground">Cor de identificação</label><input type="color" className="h-10 w-full cursor-pointer rounded border border-border bg-card" value={accent} onChange={e=>setAccent(e.target.value)}/></div>
          </div>
        </>}
        {dialog==="record"&&<>
          <div><label className="mb-2 block text-xs font-bold text-foreground">Tipo de registro</label>
            <select value={kind} onChange={e=>setKind(e.target.value as RecordEditKind)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground">
              {TYPES.map(type=><option value={type.value} key={type.value}>{type.label}</option>)}
            </select></div>
          {(kind==="website"||kind==="link"||kind==="campaign"||kind==="account")&&
            <FInput label="Endereço / URL (opcional)" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://"/>}
          {kind==="account"&&<>
            <FInput label="Usuário ou e-mail da conta" value={accountUser} onChange={e=>setAccountUser(e.target.value)}/>
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-foreground">Não cadastre senhas, tokens ou chaves secretas aqui. Um cofre de credenciais será integrado separadamente.</p>
          </>}
          <FTextarea label="Descrição / observações" value={description} onChange={e=>setDescription(e.target.value)}/>
        </>}
      </div>
    </AdminDialog>
  </div>;
}
