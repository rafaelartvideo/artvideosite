import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { AdminButton, type AdminButtonVariant } from "@/shared/ui/admin/AdminLayout";
import { AlertCircle, AlertTriangle, CheckCircle2, Database, EyeOff, History, Image as ImageIcon, Layers, LoaderCircle, MessageCircle, Pause, Play, RefreshCw, RotateCcw, UserCheck, UserPlus, X, type LucideIcon } from "lucide-react";
import { formatWhatsAppPhone } from "./WhatsAppInboxVisuals";

type Totals={messages:number;protocols:number;media_available:number;media_pending:number};
type Job={id:string;state:string;account_phone:string;total:number;updated_at:string;counts:Array<{state:string;count:number}>;totals:Totals;verified:Totals;bound:number};
type Data={packages:Array<{package_id:string;created_at:string}>;accounts:Array<{id:string;display_name:string;phone:string}>;jobs:Job[]};
type Audit={actor:string;action:string;created_at:string};
type Candidate={contact_key:string;phone:string;historical_name:string;state:"candidate"|"bound"|"missing"|"review";match:{id:string;display_name:string|null}|null};
const active=new Set(["queued","running","pausing","cancelling"]);
const label:Record<string,string>={prepared:"Preparado",queued:"Na fila",running:"Validando histórico",pausing:"Pausando",paused:"Pausado",cancelling:"Interrompendo",cancelled:"Interrompido",failed:"Falha de validação",completed:"Índice validado",rolled_back:"Vínculo desfeito"};
const actions:Record<string,Array<{key:string;label:string;permission:string}>>={
 prepared:[{key:"start",label:"Iniciar validação",permission:"start"},{key:"cancel",label:"Cancelar",permission:"manage"}],
 queued:[{key:"pause",label:"Pausar",permission:"manage"},{key:"cancel",label:"Interromper",permission:"manage"}],
 running:[{key:"pause",label:"Pausar",permission:"manage"},{key:"cancel",label:"Interromper",permission:"manage"}],
 paused:[{key:"resume",label:"Retomar",permission:"manage"},{key:"cancel",label:"Cancelar",permission:"manage"}],
 failed:[{key:"resume",label:"Tentar novamente",permission:"manage"},{key:"cancel",label:"Cancelar",permission:"manage"}],
 completed:[{key:"rollback",label:"Desfazer vínculo",permission:"rollback"}],
 cancelled:[{key:"rollback",label:"Desfazer vínculo",permission:"rollback"}],
};
const actionStyle:Record<string,{icon:LucideIcon;variant:AdminButtonVariant;pending:string}>={
 start:{icon:Play,variant:"primary",pending:"Iniciando..."},
 pause:{icon:Pause,variant:"warning",pending:"Pausando..."},
 resume:{icon:RefreshCw,variant:"primary",pending:"Retomando..."},
 cancel:{icon:X,variant:"danger",pending:"Cancelando..."},
 rollback:{icon:RotateCcw,variant:"danger",pending:"Desfazendo..."},
};
const tones={
 neutral:"border-border bg-muted/50 text-muted-foreground",
 blue:"border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/70 dark:bg-blue-950/35 dark:text-blue-300",
 purple:"border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/70 dark:bg-violet-950/35 dark:text-violet-300",
 green:"border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/35 dark:text-emerald-300",
 amber:"border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/35 dark:text-amber-300",
 red:"border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/35 dark:text-red-300",
};
function ImportStatus({state}:{state:string}){
 const processing=active.has(state);
 const tone=state==="failed"||state==="cancelled"||state==="cancelling"?"red":state==="completed"?"green":state==="paused"||state==="pausing"?"amber":state==="rolled_back"?"neutral":"blue";
 const Icon=processing?LoaderCircle:state==="failed"?AlertCircle:state==="completed"?CheckCircle2:state==="paused"?Pause:state==="cancelled"?X:state==="rolled_back"?RotateCcw:Database;
 return <span className={"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold "+tones[tone]}><Icon size={14} className={processing?"animate-spin motion-reduce:animate-none":"shrink-0"}/>{label[state]||state}</span>;
}
const metrics:[keyof Totals,string,LucideIcon,keyof typeof tones][]=[
 ["messages","Mensagens",MessageCircle,"blue"],["protocols","Protocolos",Layers,"purple"],["media_available","Mídias referenciadas",ImageIcon,"green"],["media_pending","Mídias indisponíveis",EyeOff,"red"],
];
const number=(value:number)=>new Intl.NumberFormat("pt-BR").format(value||0);
export function WhatsAppHistoryImports({onPreparationChange}:{onPreparationChange?:(error:string|null)=>void}={}){
 const {activeOrganizationId,hasPermission}=useAuth();
 const [data,setData]=useState<Data|null>(null);
 const [account,setAccount]=useState(""),[packageId,setPackageId]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [reconciliation,setReconciliation]=useState<{id:string;entries:Candidate[]}|null>(null);
 const [pendingBinding,setPendingBinding]=useState<string|null>(null);
 const [logs,setLogs]=useState<{id:string;events:Audit[]}|null>(null);
 const [confirmation,setConfirmation]=useState<{id:string;command:string;label:string}|null>(null);
 const requestInFlight=useRef<{epoch:number;sequence:number}|null>(null), generation=useRef(0), sequence=useRef(0);
 const [pendingAction,setPendingAction]=useState<{id?:string;key:string}|null>(null);
 const mutationLock=useRef(false);
 const permitted=(key:string)=>hasPermission("whatsapp.history_import."+key);
 const call=useCallback(async(body:Record<string,unknown>)=>{
   if(!activeOrganizationId)throw Error("Empresa indisponível.");
   const {data,error}=await supabase.functions.invoke("union-history-import",{body:{...body,organization_id:activeOrganizationId}});
   if(error||data?.success!==true)throw Error("Não foi possível confirmar a operação de importação.");
   return data.result;
 },[activeOrganizationId]);
 const refresh=useCallback(async(force=false)=>{
   const epoch=generation.current;
   if(!force&&requestInFlight.current?.epoch===epoch)return;
   const request={epoch,sequence:++sequence.current};
   requestInFlight.current=request;
   const current=()=>epoch===generation.current&&requestInFlight.current===request;
   try{const result=await call({action:"list"});if(!current())return;setData(result);setError("")}
   catch{if(current())setError("Não foi possível consultar as importações. Tente novamente.")}
   finally{if(requestInFlight.current===request)requestInFlight.current=null}
 },[call]);
 useEffect(()=>{generation.current++;setData(null);setAccount("");setPackageId("");setLogs(null);setReconciliation(null);setPendingBinding(null);setConfirmation(null);setError("");void refresh();return()=>{generation.current++}},[refresh]);
 useEffect(()=>{if(data||error)onPreparationChange?.(data?null:error)},[data,error,onPreparationChange]);
 const running=Boolean(data?.jobs.some(j=>active.has(j.state)));
 useEffect(()=>{
   const visible=()=>{if(document.visibilityState==="visible"&&!mutationLock.current)void refresh()};
   document.addEventListener("visibilitychange",visible);
   const timer=running?window.setInterval(visible,10000):undefined;
   return()=>{document.removeEventListener("visibilitychange",visible);if(timer!==undefined)window.clearInterval(timer)};
 },[running,refresh]);
 async function act(body:Record<string,unknown>){
   if(mutationLock.current)return;
   mutationLock.current=true;
   const epoch=generation.current;setBusy(true);setError("");setPendingAction({id:typeof body.id==="string"?body.id:undefined,key:String(body.command||body.action)});
   try{await call(body);if(epoch===generation.current){setConfirmation(null);await refresh(true)}}
   catch{if(epoch===generation.current){await refresh(true);if(epoch===generation.current)setError("Operação não confirmada. Confira a situação antes de tentar novamente.")}}
   finally{mutationLock.current=false;if(epoch===generation.current){setBusy(false);setPendingAction(null)}}
 }
 async function showLogs(id:string){
   const epoch=generation.current;
   try{const events=await call({action:"events",id});if(epoch===generation.current)setLogs({id,events})}
   catch{if(epoch===generation.current)setError("Não foi possível carregar o histórico de operações.")}
 }
 async function showCandidates(id:string){
   const epoch=generation.current;
   setBusy(true);setError("");setPendingBinding(null);setReconciliation(null);
   try{const r=await call({action:"candidates",id});if(epoch===generation.current)setReconciliation({id,entries:r.entries})}
   catch{if(epoch===generation.current)setError("Não foi possível consultar as correspondências.")}
   finally{if(epoch===generation.current)setBusy(false)}
 }
 async function confirmBinding(id:string,entry:Candidate){
   if(!["candidate","missing"].includes(entry.state)||pendingBinding!==entry.contact_key||entry.state==="candidate"&&!entry.match)return;
   const epoch=generation.current;setBusy(true);setError("");
   try{
     await call({action:entry.state==="missing"?"create_contact":"bind_contact",id,contact_key:entry.contact_key,contact_id:entry.match?.id,confirmed:true});
     if(epoch===generation.current){await showCandidates(id);await refresh()}
   }catch{if(epoch===generation.current)setError("Vínculo não confirmado. Confira se os dados do contato mudaram.")}
   finally{if(epoch===generation.current)setBusy(false)}
 }
 if(!permitted("view"))return <p className="p-4 text-sm text-muted-foreground">Sem permissão para visualizar importações.</p>;
 return <div className="min-w-0 space-y-4" aria-busy={busy}>
   {error&&data&&<div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 p-3 text-sm text-destructive"><AlertTriangle size={16} className="shrink-0"/><span className="flex-1">{error}</span><AdminButton size="sm" variant="tertiary" disabled={busy} onClick={()=>refresh(true)}><RefreshCw size={14}/> Tentar novamente</AdminButton></div>}
   {!data&&!error&&!onPreparationChange&&<div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><LoaderCircle size={20} className="animate-spin"/>Preparando importação...</div>}
   {data&&<><section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
     <div className="flex items-center gap-2 border-b border-border bg-muted/35 px-4 py-3 text-sm font-bold"><Database size={18} className="text-primary"/> Gerenciador de históricos</div>
     <div className="space-y-3 p-4">
       <div className="grid min-w-0 items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
         <label className="block min-w-0 space-y-1.5 text-sm font-semibold"><span>Pacote privado autorizado</span><div className="relative"><Database size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/><select className="min-h-10 w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60" disabled={busy} value={packageId} onChange={e=>setPackageId(e.target.value)}><option value="">Selecione</option>{data.packages.map(p=><option key={p.package_id} value={p.package_id}>Histórico {p.package_id.slice(0,8)} · {new Date(p.created_at).toLocaleDateString("pt-BR")}</option>)}</select></div></label>
         <label className="block min-w-0 space-y-1.5 text-sm font-semibold"><span>Conta de WhatsApp</span><div className="relative"><MessageCircle size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 dark:text-emerald-400"/><select className="min-h-10 w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60" disabled={busy} value={account} onChange={e=>setAccount(e.target.value)}><option value="">Selecione</option>{data.accounts.map(a=><option key={a.id} value={a.id}>{a.display_name} · {formatWhatsAppPhone(a.phone)}</option>)}</select></div></label>
         {permitted("start")&&<AdminButton className="min-h-10 w-full whitespace-nowrap md:w-auto" disabled={busy||!account||!packageId} loading={pendingAction?.key==="prepare"} loadingText="Preparando..." onClick={()=>act({action:"prepare",channel_id:account,package_id:packageId})}><Layers size={17}/> Preparar e conferir</AdminButton>}
       </div>
       {!data.packages.length&&<p className="text-xs text-muted-foreground">Nenhum pacote disponibilizado para esta empresa.</p>}
       {!data.accounts.length&&<p className="text-xs text-muted-foreground">Conecte uma conta de WhatsApp antes de preparar o lote.</p>}
     </div>
   </section>
   {data.jobs.map(j=>{
     const count=(s:string)=>j.counts.find(c=>c.state===s)?.count||0;
     const verified=count("verified"),review=count("review"),percent=j.total?Math.floor(verified*100/j.total):0;
     return <section key={j.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
       <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/35 px-4 py-3">
         <div className="flex min-w-0 items-center gap-2.5"><span className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border "+tones.green}><MessageCircle size={20}/></span><strong className="text-sm sm:text-base">Importação · {formatWhatsAppPhone(j.account_phone)}</strong></div>
         <ImportStatus state={j.state}/>
       </div>
       <div className="space-y-4 p-4">
       <div className="space-y-2">
         <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Contatos validados" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><div className={"h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none "+(j.state==="failed"?"bg-red-500":j.state==="completed"?"bg-emerald-500":j.state==="paused"||j.state==="pausing"?"bg-amber-500":"bg-primary")} style={{width:percent+"%"}}/></div>
         <p className="flex flex-wrap items-baseline gap-x-2 text-sm"><strong>{number(verified)} de {number(j.total)} validados</strong><span className="text-muted-foreground">· {number(review)} para revisão</span><strong className="ml-auto tabular-nums">{percent}%</strong></p>
         <p className="text-xs text-muted-foreground">{number(j.bound)} contatos vinculados · {number(Math.max(0,j.total-(j.bound||0)))} sem vínculo confirmado</p>
       </div>
       <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">{metrics.map(([key,name,Icon,tone])=><div key={key} className={"flex min-w-0 items-center gap-2.5 rounded-lg border p-3 "+tones[tone]}><Icon size={22} className="shrink-0"/><div className="min-w-0"><p className="text-xs font-medium leading-tight">{name}</p><strong className="text-base tabular-nums text-foreground">{number(j.verified[key])} / {number(j.totals[key])}</strong></div></div>)}</div>
       <div className="flex flex-wrap gap-2">
         {(actions[j.state]||[]).filter(a=>permitted(a.permission)).map(a=>{
           const style=actionStyle[a.key],Icon=style.icon;
           return <AdminButton key={a.key} variant={a.key==="resume"&&j.state==="failed"?"tertiary":style.variant} disabled={busy} loading={pendingAction?.id===j.id&&pendingAction.key===a.key} loadingText={style.pending} onClick={()=>["start","cancel","rollback"].includes(a.key)?setConfirmation({id:j.id,command:a.key,label:a.label}):act({action:"control",id:j.id,command:a.key})}><Icon size={16}/>{a.label}</AdminButton>;
         })}
         {j.state==="completed"&&permitted("manage")&&<AdminButton variant="success" disabled={busy} onClick={()=>showCandidates(j.id)}><UserCheck size={16}/> Conciliar contatos</AdminButton>}
         <AdminButton variant="secondary" disabled={busy} onClick={()=>showLogs(j.id)}><History size={16}/> Histórico de operações</AdminButton>
       </div>
       {confirmation?.id===j.id&&<div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3"><p className="text-sm">Confirma {confirmation.label.toLowerCase()} para o número {formatWhatsAppPhone(j.account_phone)}?</p><div className="flex flex-wrap gap-2"><AdminButton variant={actionStyle[confirmation.command].variant} disabled={busy} loading={pendingAction?.id===j.id&&pendingAction.key===confirmation.command} loadingText={actionStyle[confirmation.command].pending} onClick={()=>act({action:"control",id:j.id,command:confirmation.command})}><CheckCircle2 size={16}/> Confirmar</AdminButton><AdminButton variant="secondary" disabled={busy} onClick={()=>setConfirmation(null)}>Voltar</AdminButton></div></div>}
       {j.state==="completed"&&reconciliation?.id===j.id&&<div className="rounded-md border border-border p-3 space-y-3">
         <div className="flex items-center justify-between"><strong className="text-sm">Conciliação de contatos</strong><button className="text-xs underline" onClick={()=>{setReconciliation(null);setPendingBinding(null)}}>Fechar</button></div>
         <p className="text-xs text-muted-foreground">Confirme apenas contatos que pertencem à mesma pessoa. Números compartilhados, reciclados ou sem correspondência ficam para revisão. Nenhum cadastro será sobrescrito.</p>
         <div className="max-h-96 overflow-y-auto space-y-2">{reconciliation.entries.map(e=><div key={e.contact_key} className="border border-border rounded-md p-3 space-y-1">
           <div className="flex items-center justify-between gap-2"><strong className="text-sm">{formatWhatsAppPhone(e.phone)}</strong><span className="text-xs">{e.state==="bound"?"Vinculado":e.state==="candidate"?"Confirmar correspondência":e.state==="missing"?"Sem cadastro":"Revisão necessária"}</span></div>
           <p className="text-xs break-words">Nome recuperado: {e.historical_name||"Não informado"}</p>
           <p className="text-xs break-words">Cadastro atual: {e.match?.display_name||"Não identificado"}</p>
           {e.state==="missing"&&(pendingBinding===e.contact_key?<div className="space-y-2"><p className="text-xs">Criar este contato na agenda e vincular seu histórico? Nenhum atendimento será iniciado.</p><div className="flex gap-2"><AdminButton disabled={busy} onClick={()=>void confirmBinding(j.id,e)}><UserPlus size={15}/> Criar e vincular</AdminButton><AdminButton variant="secondary" onClick={()=>setPendingBinding(null)}>Voltar</AdminButton></div></div>:<AdminButton variant="secondary" disabled={busy} onClick={()=>setPendingBinding(e.contact_key)}>Conferir novo cadastro</AdminButton>)}
           {e.state==="candidate"&&e.match&&(pendingBinding===e.contact_key?<div className="space-y-2"><p className="text-xs">Confirma que este histórico pertence ao contato atual?</p><div className="flex gap-2"><AdminButton disabled={busy} onClick={()=>void confirmBinding(j.id,e)}><UserCheck size={15}/> Confirmar vínculo</AdminButton><AdminButton variant="secondary" onClick={()=>setPendingBinding(null)}>Voltar</AdminButton></div></div>:<AdminButton variant="secondary" disabled={busy} onClick={()=>setPendingBinding(e.contact_key)}>Conferir vínculo</AdminButton>)}
         </div>)}</div>
       </div>}
       {logs?.id===j.id&&<div className="max-h-48 overflow-auto rounded-md border border-border p-2"><div className="flex items-center justify-between"><strong className="text-xs">Operações recentes</strong><button className="text-xs underline" onClick={()=>setLogs(null)}>Fechar</button></div>{logs.events.map((e,i)=><p key={i} className="text-xs py-1">{new Date(e.created_at).toLocaleString("pt-BR")} · {e.action==="prepare"?"Preparação":e.action==="validation_failed"?"Validação falhou":e.action} · {e.actor==="worker"?"Processamento automático":"Usuário "+e.actor.slice(0,8)}</p>)}</div>}
       </div>
     </section>
   })}
   {!data.jobs.length&&<p className="text-sm text-muted-foreground">Nenhuma importação preparada.</p>}
   </>}
 </div>;
}
