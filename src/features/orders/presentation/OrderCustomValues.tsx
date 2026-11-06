import { useState } from "react";
import type { CustomField } from "../domain/order-rules";
import { Section } from "@/shared/ui/admin/AdminLayout";
import {
  createStorageSignedUrl,
  getMediaById,
  uploadServiceOrderMediaFile,
  type MediaBucket,
} from "@/shared/infrastructure/media.repository";

const input="w-full min-w-0 rounded-lg border border-border bg-card p-3 text-sm text-foreground";
type FileValue = { media_id: string; file_name: string };
const fileValue=(value:unknown):FileValue|null=>{
  if(!value || typeof value!=="object") return null;
  const candidate=value as Partial<FileValue>;
  return typeof candidate.media_id==="string" && candidate.media_id.length>0
    ? {media_id:candidate.media_id,file_name:String(candidate.file_name||"Arquivo anexado")}
    : null;
};
function CustomFileInput({
  value,onChange,orderId,organizationId,disabled,
}:{
  value:unknown;onChange:(value:FileValue|null)=>void;
  orderId?:string;organizationId?:string|null;disabled:boolean;
}){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const attached=fileValue(value);
  const upload=async(file?:File)=>{
    if(!file || busy || disabled)return;
    if(!orderId || !organizationId){setError("Crie a OS antes de anexar arquivos.");return;}
    if(file.size>10*1024*1024){setError("O arquivo deve ter até 10 MB.");return;}
    setBusy(true);setError("");
    try{
      const mediaId=await uploadServiceOrderMediaFile(orderId,"attachments/custom-fields",file,organizationId);
      onChange({media_id:mediaId,file_name:file.name});
    }catch(err){
      setError(err instanceof Error?err.message:"Não foi possível enviar o arquivo.");
    }finally{setBusy(false);}
  };
  const open=async()=>{
    if(!attached || busy)return;
    setError("");setBusy(true);
    try{
      const media=await getMediaById(attached.media_id);
      if(!media?.bucket_id || !media.storage_path)throw new Error("Arquivo não encontrado ou sem permissão.");
      const url=await createStorageSignedUrl(media.bucket_id as MediaBucket,media.storage_path,300,true);
      const anchor=document.createElement("a");
      anchor.href=url;anchor.target="_blank";anchor.rel="noopener noreferrer";
      anchor.click();
    }catch(err){setError(err instanceof Error?err.message:"Não foi possível abrir o arquivo.");}
    finally{setBusy(false);}
  };
  return <div className="space-y-2">
    {attached&&<div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="min-w-0 break-all text-foreground">{attached.file_name}</span>
      <button type="button" className="text-primary underline" disabled={busy} onClick={()=>void open()}>Abrir arquivo</button>
      {!disabled&&<button type="button" className="text-red-600" disabled={busy} onClick={()=>onChange(null)}>Remover</button>}
    </div>}
    {!orderId?<p className="text-xs text-muted-foreground">Disponível para envio após criar a OS.</p>
      :!disabled&&<input className={input} type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.webp"
        disabled={busy} aria-label="Selecionar arquivo"
        onChange={event=>{void upload(event.target.files?.[0]);event.target.value="";}}/>}
    {busy&&<p className="text-xs text-muted-foreground">Processando arquivo...</p>}
    {error&&<p role="alert" className="text-xs text-red-600">{error}</p>}
    {attached&&<p className="text-xs text-muted-foreground">Arquivo enviado. Salve a OS para vincular o anexo.</p>}
  </div>;
}
export function OrderCustomValues({
  fields,values,onChange,editing,orderId,organizationId,canUpload=true,
}:{
  fields:CustomField[];values:Record<string,any>;
  onChange:(v:Record<string,any>)=>void;editing:boolean;
  orderId?:string;organizationId?:string|null;canUpload?:boolean;
}){
  const shown=fields.filter(field=>field.mode!=="hidden"||(editing&&values[field.key]!=null));
  if(!shown.length)return null;
  const update=(key:string,value:any)=>onChange({...values,[key]:value});
  return <Section title="Campos personalizados">
    <div className="grid gap-3 sm:grid-cols-2">
      {shown.map(field=><div key={field.key} className="min-w-0 space-y-1">
        <span className="block text-xs font-semibold text-foreground">{field.label}
          {field.mode==="required"&&field.stage==="create"&&!editing&&<span className="text-red-600"> *</span>}
        </span>
        {field.type==="file"?
          <CustomFileInput value={values[field.key]} onChange={value=>update(field.key,value)}
            orderId={orderId} organizationId={organizationId}
            disabled={!canUpload||field.mode==="hidden"}/>
        :field.type==="select"?
          <select aria-label={field.label} className={input} value={String(values[field.key]||"")} onChange={e=>update(field.key,e.target.value)}>
            <option value="">Selecionar...</option>
            {(field.options||[]).map(option=><option key={option} value={option}>{option}</option>)}
          </select>
        :field.type==="checkbox"?
          <input aria-label={field.label} className="h-5 w-5 accent-primary" type="checkbox"
            checked={values[field.key]===true||values[field.key]==="true"}
            onChange={e=>update(field.key,e.target.checked)}/>
        :<input aria-label={field.label} className={input} type={field.type==="date"?"date":field.type==="number"?"number":"text"}
          value={String(values[field.key]??"")} onChange={e=>update(field.key,e.target.value)}/>}
      </div>)}
    </div>
  </Section>;
}
