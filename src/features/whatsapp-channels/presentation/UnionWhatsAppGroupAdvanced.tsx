import { useEffect, useRef, useState } from "react";
import { ClipboardCopy, ImagePlus, LoaderCircle, RefreshCcw, ShieldCheck, Trash2, UserCheck } from "lucide-react";
import { operateUnionWhatsAppInbox, type UnionWhatsAppGroupDetails, type UnionWhatsAppGroupJoinRequest } from "../infrastructure/union-whatsapp-inbox.repository";
import { systemErrorMessage } from "@/shared/domain/error-message";

const field="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-primary";
const btn="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50";
type GroupCommand="invite"|"announce"|"locked"|"memberaddmode"|"ephemeral"|"joinapproval"|"requests"|"requests_update"|"photo"|"photo_remove";
type GroupDuration="off"|"24h"|"7d"|"90d";

export function UnionWhatsAppGroupAdvanced({organizationId,accountPhone,group,onChanged}:{
  organizationId:string;accountPhone:string;group:UnionWhatsAppGroupDetails;onChanged:()=>void;
}){
  const [busy,setBusy]=useState<GroupCommand|null>(null);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [invite,setInvite]=useState("");
  const [requests,setRequests]=useState<UnionWhatsAppGroupJoinRequest[]>([]);
  const [requestsLoaded,setRequestsLoaded]=useState(false);
  const [confirm,setConfirm]=useState("");
  const [announce,setAnnounce]=useState(group.is_announce);
  const [locked,setLocked]=useState(group.is_locked);
  const [addMode,setAddMode]=useState<"admin_add"|"all_member_add">("admin_add");
  const [duration,setDuration]=useState<GroupDuration>("off");
  const [joinApproval,setJoinApproval]=useState(false);
  const fileRef=useRef<HTMLInputElement|null>(null);

  useEffect(()=>{
    setInvite("");setRequests([]);setRequestsLoaded(false);setConfirm("");
    setError("");setNotice("");setAnnounce(group.is_announce);setLocked(group.is_locked);
    setAddMode("admin_add");setDuration("off");setJoinApproval(false);
  },[group.jid]);
  useEffect(()=>setAnnounce(group.is_announce),[group.is_announce]);
  useEffect(()=>setLocked(group.is_locked),[group.is_locked]);

  const run=async(command:GroupCommand,extras:Record<string,unknown>={},dangerous=false)=>{
    if(busy)return;
    const key=command+":"+JSON.stringify(extras);
    if(dangerous && confirm!==key){setConfirm(key);setNotice("");setError("");return;}
    setConfirm("");setBusy(command);setError("");setNotice("");
    try{
      const result=await operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),"contacts_groups_manage",{
        account_phone:accountPhone,group_command:command,group_jid:group.jid,...extras,
      });
      if(command==="invite"){
        const link=result.invite_link||"";
        if(!link)throw new Error("O WhatsApp não confirmou um convite.");
        setInvite(link);
        setNotice(extras.group_reset?"O convite anterior foi revogado.":"Link de convite consultado.");
      }else if(command==="requests"){
        setRequests(result.requests||[]);setRequestsLoaded(true);
      }else{
        if(command==="requests_update"){setRequestsLoaded(false);setRequests([]);}
        setNotice("Alteração confirmada pelo WhatsApp.");
        onChanged();
      }
    }catch(reason){
      setError(systemErrorMessage(reason,"O WhatsApp não confirmou esta operação."));
    }finally{setBusy(null);}
  };

  const uploadPhoto=async(file:File|null)=>{
    if(!file || busy)return;
    if(file.size>8*1024*1024){setError("A foto deve ter no máximo 8 MB antes da otimização.");return;}
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)){
      setError("Envie uma foto JPG, PNG ou WebP.");return;
    }
    setBusy("photo");setError("");setNotice("");
    try{
      const bitmap=await createImageBitmap(file);
      try{
        const canvas=document.createElement("canvas"),size=Math.min(480,bitmap.width,bitmap.height);
        canvas.width=size;canvas.height=size;
        const ctx=canvas.getContext("2d");
        if(!ctx)throw new Error("Não foi possível converter esta imagem.");
        const square=Math.min(bitmap.width,bitmap.height);
        ctx.drawImage(bitmap,(bitmap.width-square)/2,(bitmap.height-square)/2,square,square,0,0,size,size);
        let jpeg="";
        for(const quality of [0.83,0.72,0.6,0.48]){
          jpeg=canvas.toDataURL("image/jpeg",quality);
          if(jpeg.length<=140000)break;
        }
        if(jpeg.length>140000)throw new Error("Não foi possível reduzir a foto. Escolha uma imagem menor.");
        await operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),"contacts_groups_manage",{
          account_phone:accountPhone,group_command:"photo",group_jid:group.jid,group_photo:jpeg,
        });
        setNotice("Foto atualizada no WhatsApp.");onChanged();
      }finally{bitmap.close();}
    }catch(reason){
      setError(systemErrorMessage(reason,"Não foi possível trocar a foto do grupo."));
    }finally{setBusy(null);if(fileRef.current)fileRef.current.value="";}
  };
  const copyLink=async()=>{if(!invite)return;try{await navigator.clipboard.writeText(invite);setNotice("Link copiado.");}
    catch{setError("Selecione o link e copie manualmente.");}};
  const isLoading=Boolean(busy);
  return <section aria-label="Configurações avançadas do grupo" className="space-y-4 rounded-xl border border-border p-3 sm:p-4">
    <div className="flex items-center gap-2"><ShieldCheck size={17} className="text-primary"/>
      <h4 className="text-sm font-bold">Administração do grupo</h4>
    </div>
    {error&&<p role="alert" className="rounded-lg border border-destructive/30 p-2 text-xs text-destructive">{error}</p>}
    {notice&&<p role="status" className="text-xs text-primary">{notice}</p>}
    <div className="space-y-2">
      <p className="text-xs font-bold">Convite do grupo</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} disabled={isLoading} onClick={()=>void run("invite")}>Obter link</button>
        <button type="button" className={btn+" text-destructive"} disabled={isLoading}
          onClick={()=>void run("invite",{group_reset:true},true)}>Redefinir convite</button>
      </div>
      {invite&&<div className="flex min-w-0 items-center gap-2">
        <input aria-label="Link de convite do grupo" className={field} readOnly value={invite}/>
        <button type="button" aria-label="Copiar link" className={btn} onClick={()=>void copyLink()}><ClipboardCopy size={17}/></button>
      </div>}
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-xs font-semibold">
        <span>Quem pode enviar mensagens?</span>
        <select className={field} value={announce?"admin":"all"} onChange={event=>setAnnounce(event.target.value==="admin")}>
          <option value="all">Todos os participantes</option><option value="admin">Somente administradores</option>
        </select>
        <button type="button" className={btn} disabled={isLoading} onClick={()=>void run("announce",{group_mode:announce})}>Aplicar</button>
      </label>
      <label className="space-y-1 text-xs font-semibold">
        <span>Quem pode editar o grupo?</span>
        <select className={field} value={locked?"admin":"all"} onChange={event=>setLocked(event.target.value==="admin")}>
          <option value="all">Todos os participantes</option><option value="admin">Somente administradores</option>
        </select>
        <button type="button" className={btn} disabled={isLoading} onClick={()=>void run("locked",{group_mode:locked})}>Aplicar</button>
      </label>
      <label className="space-y-1 text-xs font-semibold">
        <span>Quem pode adicionar membros?</span>
        <select className={field} value={addMode} onChange={event=>setAddMode(event.target.value as typeof addMode)}>
          <option value="admin_add">Somente administradores</option>
          <option value="all_member_add">Todos os participantes</option>
        </select>
        <button type="button" className={btn} disabled={isLoading} onClick={()=>void run("memberaddmode",{group_mode:addMode})}>Aplicar</button>
      </label>
      <label className="space-y-1 text-xs font-semibold">
        <span>Mensagens temporárias</span>
        <select className={field} value={duration} onChange={event=>setDuration(event.target.value as GroupDuration)}>
          <option value="off">Desativadas</option><option value="24h">24 horas</option>
          <option value="7d">7 dias</option><option value="90d">90 dias</option>
        </select>
        <button type="button" className={btn} disabled={isLoading} onClick={()=>void run("ephemeral",{group_duration:duration})}>Aplicar</button>
      </label>
      <label className="space-y-1 text-xs font-semibold sm:col-span-2">
        <span>Exigir aprovação para entrar</span>
        <select className={field} value={joinApproval?"on":"off"} onChange={event=>setJoinApproval(event.target.value==="on")}>
          <option value="off">Não</option><option value="on">Sim</option>
        </select>
        <button type="button" className={btn} disabled={isLoading} onClick={()=>void run("joinapproval",{group_mode:joinApproval})}>Aplicar</button>
      </label>
    </div>
    <p className="text-[11px] text-muted-foreground">As opções de entrada e mensagens temporárias mostram valores de edição, não necessariamente os ajustes atuais do WhatsApp. A alteração só é feita ao clicar em Aplicar.</p>
    <div className="space-y-2 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold"><UserCheck size={14} className="mr-1 inline"/>Solicitações para entrar</p>
        <button type="button" className={btn} disabled={isLoading} onClick={()=>void run("requests")}>
          <RefreshCcw size={13} className="mr-1 inline"/>Consultar
        </button>
      </div>
      {requestsLoaded&&!requests.length&&<p className="text-xs text-muted-foreground">Nenhuma solicitação pendente.</p>}
      {requests.map(request=><div key={request.jid} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-xs">
        <span className="min-w-0 break-all">{request.jid}</span>
        <div className="flex gap-2">
          <button type="button" className={btn} disabled={isLoading} onClick={()=>void run("requests_update",{
            group_phones:[request.jid],group_participant_action:"approve"})}>Aprovar</button>
          <button type="button" className={btn+" text-destructive"} disabled={isLoading} onClick={()=>void run("requests_update",{
            group_phones:[request.jid],group_participant_action:"reject"},true)}>Rejeitar</button>
        </div>
      </div>)}
    </div>
    <div className="space-y-2 border-t border-border pt-4">
      <p className="text-xs font-bold">Foto do grupo</p>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        aria-label="Selecionar foto do grupo" onChange={event=>void uploadPhoto(event.target.files?.[0]||null)}/>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} disabled={isLoading} onClick={()=>fileRef.current?.click()}>
          <ImagePlus size={14} className="mr-1 inline"/>Trocar foto
        </button>
        <button type="button" className={btn+" text-destructive"} disabled={isLoading}
          onClick={()=>void run("photo_remove",{},true)}><Trash2 size={14} className="mr-1 inline"/>Remover foto</button>
      </div>
      <p className="text-[11px] text-muted-foreground">JPG, PNG ou WebP. A imagem é recortada e convertida localmente para JPEG antes do envio.</p>
    </div>
    {confirm&&<div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 p-3 text-xs">
      <span>Confirmar esta ação no WhatsApp?</span>
      <button type="button" className={btn+" text-destructive"} disabled={isLoading}
        onClick={()=>{
          const [cmd,encoded]=[confirm.slice(0,confirm.indexOf(":")),confirm.slice(confirm.indexOf(":")+1)];
          setConfirm("");void run(cmd as GroupCommand,JSON.parse(encoded));
        }}>Confirmar</button>
      <button type="button" className={btn} onClick={()=>setConfirm("")}>Cancelar</button>
    </div>}
    {isLoading&&<p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
      <LoaderCircle size={14} className="animate-spin"/>Consultando WhatsApp...
    </p>}
  </section>;
}
