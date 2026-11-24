import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { AdminButton, type AdminButtonVariant } from "@/shared/ui/admin/AdminLayout";
import { AlertCircle, AlertTriangle, CheckCircle2, Database, EyeOff, History, Image as ImageIcon, Layers, LoaderCircle, MessageCircle, Pause, Play, RefreshCw, RotateCcw, UserCheck, UserPlus, X, type LucideIcon } from "lucide-react";
import { formatWhatsAppPhone } from "./WhatsAppInboxVisuals";

type Totals={messages:number;protocols:number;media_available:number;media_pending:number};
type BulkRun={state:string;processed:number;created:number;linked:number;bound:number;review:number;renamed:number;started_at:string;updated_at:string};
type Job={id:string;state:string;account_phone:string;total:number;updated_at:string;counts:Array<{state:string;count:number}>;totals:Totals;verified:Totals;bound:number;bulk?:BulkRun|null};
type Data={bulk_enabled?:boolean;packages:Array<{package_id:string;created_at:string}>;accounts:Array<{id:string;display_name:string;phone:string}>;jobs:Job[]};
type Audit={actor:string;action:string;created_at:string};
type Integrity={total:number;verified:number;review:number;indexed:number;bound:number;expected:Totals;actual:Totals;duplicateMessages:number;duplicateProtocols:number;index_matches:boolean;media_binary_verified:boolean;backup_modified:boolean};
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
 const [reconciliation,setReconciliation]=useState<{id:string;entries:Candidate[];page:number;cursors:(string|null)[];next:string|null}|null>(null);
 const [pendingBinding,setPendingBinding]=useState<string|null>(null);
 const [publication,setPublication]=useState<{id:string;done:number;total:number;failed:number}|null>(null);
 const [logs,setLogs]=useState<{id:string;events:Audit[]}|null>(null);
 const [integrity,setIntegrity]=useState<{id:string;report:Integrity}|null>(null);
 const [auditBusy,setAuditBusy]=useState(false);
 const [confirmation,setConfirmation]=useState<{id:string;command:string;label:string;bulk?:boolean}|null>(null);
 const requestInFlight=useRef<{epoch:number;sequence:number}|null>(null), generation=useRef(0), sequence=useRef(0);
 const [pendingAction,setPendingAction]=useState<{id?:string;key:string}|null>(null);
 const mutationLock=useRef(false);
 const automaticAttempted=useRef(new Set<string>());
 const [automatic,setAutomatic]=useState<Record<string,{processed:number;created:number;linked:number;bound:number;review:number;renamed:number;running:boolean;failed:boolean}>>({});
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
 useEffect(()=>{generation.current++;automaticAttempted.current.clear();setAutomatic({});setData(null);setAccount("");setPackageId("");setLogs(null);setIntegrity(null);setReconciliation(null);setPendingBinding(null);setPublication(null);setConfirmation(null);setError("");void refresh();return()=>{generation.current++}},[refresh]);
 useEffect(()=>{if(data||error)onPreparationChange?.(data?null:error)},[data,error,onPreparationChange]);
 const running=Boolean(data?.jobs.some(j=>active.has(j.state)||j.bulk?.state==="running"));
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
 async function auditIntegrity(id:string){
   const epoch=generation.current;setAuditBusy(true);setError("");
   try{const report=await call({action:"audit_integrity",id});if(epoch===generation.current)setIntegrity({id,report});}
   catch{if(epoch===generation.current)setError("Não foi possível concluir a auditoria do índice.");}
   finally{if(epoch===generation.current)setAuditBusy(false);}
 }
 async function showLogs(id:string){
   const epoch=generation.current;
   try{const events=await call({action:"events",id});if(epoch===generation.current)setLogs({id,events})}
   catch{if(epoch===generation.current)setError("Não foi possível carregar o histórico de operações.")}
 }
 async function showCandidates(id:string,page=0,cursors:(string|null)[]=[null]){
   const epoch=generation.current;
   setBusy(true);setError("");setPendingBinding(null);setReconciliation(null);
   try{const r=await call({action:"candidates",id,page_after:cursors[page]||null});if(epoch===generation.current)setReconciliation({id,entries:r.entries,page,cursors,next:r.next_after||null})}
   catch{if(epoch===generation.current)setError("Não foi possível consultar as correspondências.")}
   finally{if(epoch===generation.current)setBusy(false)}
 }
 async function confirmBinding(id:string,entry:Candidate){
   if(!["candidate","missing"].includes(entry.state)||pendingBinding!==entry.contact_key||entry.state==="candidate"&&!entry.match)return;
   const epoch=generation.current;setBusy(true);setError("");
   try{
     await call({action:entry.state==="missing"?"create_contact":"bind_contact",id,contact_key:entry.contact_key,contact_id:entry.match?.id,confirmed:true,page_after:reconciliation?.cursors[reconciliation.page]||null});
     if(epoch===generation.current){await showCandidates(id,reconciliation?.page||0,reconciliation?.cursors||[null]);await refresh()}
   }catch{if(epoch===generation.current)setError("Vínculo não confirmado. Confira se os dados do contato mudaram.")}
   finally{if(epoch===generation.current)setBusy(false)}
 }
 async function publishConversations(job:Job){
   if(mutationLock.current||reconciliation?.id!==job.id)return;
   const channel=data?.accounts.find(a=>a.phone===job.account_phone);
   const entries=reconciliation.entries.filter(e=>e.state==="bound"&&e.match);
   if(!channel||!entries.length)return;
   mutationLock.current=true;const epoch=generation.current;
   setBusy(true);setError("");setPublication({id:job.id,done:0,total:entries.length,failed:0});
   let done=0,failed=0;
   try{
     // Deliberately sequential and idempotent; never poll or read full history.
     for(const entry of entries){
       if(epoch!==generation.current)break;
       try{
         const result=await call({action:"open_archive",contact_only:true,conversation_id:entry.match!.id,channel_id:channel.id,account_phone:job.account_phone});
         if(!result?.conversation_id)failed++;
       }catch{failed++}
       done++;
       if(epoch===generation.current)setPublication({id:job.id,done,total:entries.length,failed});
     }
     if(epoch===generation.current&&failed)setError("Algumas conversas não foram disponibilizadas. Confira as identidades e tente novamente.");
   }finally{mutationLock.current=false;if(epoch===generation.current)setBusy(false)}
 }
 // Run once when a validated package becomes visible, including a previously
 // validated package. Closing the manager stops new requests; committed
 // bindings stay in the private journal and the next opening resumes safely.
 const canAuto=permitted("view")&&permitted("manage");
 const runAutomatic=useCallback(async(id:string)=>{
   if(mutationLock.current)return;
   automaticAttempted.current.add(id);
   mutationLock.current=true;const epoch=generation.current;
   const summary={processed:0,created:0,linked:0,bound:0,review:0,renamed:0,running:true,failed:false};
   const publish=()=>{if(epoch===generation.current)setAutomatic(old=>({...old,[id]:{...summary}}));};
   setBusy(true);setError("");publish();
   try{
     let after:string|null=null;
     for(let step=0;step<20;step++){
       if(epoch!==generation.current)return;
       const result=await call({action:"auto_reconcile",id,after});
       if(!Array.isArray(result?.entries)||result.entries.length>5)throw Error("Lote inválido.");
       for(const item of result.entries){
         summary.processed++;
         if(item.state==="created")summary.created++;
         else if(item.state==="linked")summary.linked++;
         else if(item.state==="bound")summary.bound++;
         else summary.review++;
         if(item.renamed===true)summary.renamed++;
       }
       publish();
       const next=result.next_after;
       if(!next)break;
       if(typeof next!=="string"||(after!==null&&next<=after)||step===19)throw Error("Cursor inválido.");
       after=next;
     }
     if(epoch===generation.current)await refresh(true);
   }catch{
     summary.failed=true;
     if(epoch===generation.current)setError("Conciliação automática não concluída. Retome para continuar sem duplicar contatos.");
   }finally{
     summary.running=false;publish();mutationLock.current=false;
     if(epoch===generation.current)setBusy(false);
   }
 },[call,refresh]);
 useEffect(()=>{
   if(!canAuto||busy||mutationLock.current||confirmation||reconciliation||document.visibilityState!=="visible")return;
   const next=data?.jobs.find(job=>job.state==="completed"&&!automaticAttempted.current.has(job.id)&&!job.bulk&&job.total<=100&&!data.bulk_enabled);
   if(next)void runAutomatic(next.id);
 },[canAuto,busy,confirmation,reconciliation,data,runAutomatic]);
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
     const bulk=j.bulk;
     const bulkState=bulk?.state==="running"&&j.state==="failed"?"failed":bulk?.state;
     const bulkPercent=bulk&&j.total?Math.min(100,Math.floor(bulk.processed*100/j.total)):0;
     const hours=bulk?Math.max(0,(Date.parse(bulk.updated_at)-Date.parse(bulk.started_at))/3600000):0;
     const rate=bulk&&hours>0?Math.round(bulk.processed/hours):0;
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
         {(actions[j.state]||[]).filter(a=>permitted(a.permission)&&(!data.bulk_enabled&&!bulk&&j.total<=100||a.key==="rollback"&&(!bulk||["completed","cancelled"].includes(bulk.state)))).map(a=>{
           const style=actionStyle[a.key],Icon=style.icon;
           return <AdminButton key={a.key} variant={a.key==="resume"&&j.state==="failed"?"tertiary":style.variant} disabled={busy} loading={pendingAction?.id===j.id&&pendingAction.key===a.key} loadingText={style.pending} onClick={()=>["start","cancel","rollback"].includes(a.key)?setConfirmation({id:j.id,command:a.key,label:a.label}):act({action:"control",id:j.id,command:a.key})}><Icon size={16}/>{a.label}</AdminButton>;
         })}
         {data.bulk_enabled&&permitted("manage")&&permitted("start")&&!bulk&&["prepared","queued","running","completed","paused","failed"].includes(j.state)&&<AdminButton variant="primary" disabled={busy} onClick={()=>setConfirmation({id:j.id,command:"start",label:"Iniciar importação automática",bulk:true})}><Play size={16}/> Iniciar importação automática</AdminButton>}
         {bulk&&permitted("manage")&&bulkState==="running"&&<AdminButton variant="warning" disabled={busy} onClick={()=>act({action:"bulk_control",id:j.id,command:"pause"})}><Pause size={16}/> Pausar</AdminButton>}
         {bulk&&permitted("manage")&&permitted("start")&&["paused","failed"].includes(bulkState||"")&&j.state!=="pausing"&&<AdminButton variant="primary" disabled={busy} onClick={()=>act({action:"bulk_control",id:j.id,command:"resume"})}><Play size={16}/> Retomar</AdminButton>}
         {bulk&&permitted("manage")&&["running","paused","failed"].includes(bulkState||"")&&<AdminButton variant="danger" disabled={busy} onClick={()=>setConfirmation({id:j.id,command:"cancel",label:"Interromper importação",bulk:true})}><X size={16}/> Interromper</AdminButton>}
         {j.total>100&&!data.bulk_enabled&&<p className="text-xs text-muted-foreground">O worker de importação em massa ainda não está habilitado no servidor.</p>}
         {j.state==="completed"&&permitted("manage")&&bulkState!=="running"&&<AdminButton variant="success" disabled={busy} onClick={()=>showCandidates(j.id)}><UserCheck size={16}/> Revisar contatos</AdminButton>}
         {j.state==="completed"&&!data.bulk_enabled&&!bulk&&permitted("manage")&&automatic[j.id]&&!automatic[j.id].running&&<AdminButton variant="secondary" disabled={busy} onClick={()=>void runAutomatic(j.id)}><RefreshCw size={16}/> {automatic[j.id].failed?"Retomar conciliação":"Conferir novamente"}</AdminButton>}
         {data.bulk_enabled&&j.state==="completed"&&permitted("manage")&&<AdminButton variant="secondary" disabled={busy||auditBusy||bulkState==="running"} loading={auditBusy} onClick={()=>void auditIntegrity(j.id)}><CheckCircle2 size={16}/> Auditar integridade</AdminButton>}
         <AdminButton variant="secondary" disabled={busy} onClick={()=>showLogs(j.id)}><History size={16}/> Histórico de operações</AdminButton>
       </div>
       {bulk&&<div role="status" className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
         <div className="flex items-center justify-between gap-2 text-sm"><strong>Conciliação no servidor</strong><span className="text-xs text-muted-foreground">{bulkState==="running"?(j.state==="completed"?"Conciliando":"Validando índice"):bulkState==="completed"?"Concluída":bulkState==="paused"?"Pausada":bulkState==="failed"?"Falha · pode retomar":"Interrompida"}</span></div>
         <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Conciliação automática" aria-valuenow={bulkPercent}><div className="h-full rounded-full bg-emerald-500" style={{width:bulkPercent+"%"}}/></div>
         <p className="flex justify-between text-xs"><span>{number(bulk.processed)} de {number(j.total)} processados</span><strong>{bulkPercent}%</strong></p>
         <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{([["created","Novos contatos"],["linked","Vinculados"],["bound","Já vinculados"],["renamed","Nomes melhorados"],["review","Para revisão"]] as const).map(([key,label])=><div key={key} className="rounded-md border border-border bg-card p-2"><p className="text-xs text-muted-foreground">{label}</p><strong className="text-lg tabular-nums">{number(bulk[key])}</strong></div>)}<div className="rounded-md border border-border bg-card p-2"><p className="text-xs text-muted-foreground">Média desde o início</p><strong className="text-lg tabular-nums">{rate?number(rate)+"/h":"—"}</strong></div></div>
         <p className="text-xs text-muted-foreground">Você pode fechar o CRM. Os checkpoints são mantidos no servidor; mensagens e arquivos permanecem no armazenamento privado.</p>
       </div>}
       {!bulk&&automatic[j.id]&&<div role="status" className="rounded-lg border border-border bg-muted/25 px-3 py-2 text-xs space-y-1">
         <strong>{automatic[j.id].running?"Salvando e conciliando automaticamente...":automatic[j.id].failed?"Conciliação interrompida":"Conciliação automática verificada"}</strong>
         <p>{number(automatic[j.id].processed)} de {number(j.total)} conferidos · {number(automatic[j.id].created)} criados · {number(automatic[j.id].linked)} vinculados · {number(automatic[j.id].bound)} já vinculados</p>
         <p>{number(automatic[j.id].renamed)} nomes melhorados · {number(automatic[j.id].review)} exigem revisão</p>
       </div>}
       {confirmation?.id===j.id&&<div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3"><p className="text-sm">Confirma {confirmation.label.toLowerCase()} para o número {formatWhatsAppPhone(j.account_phone)}?</p><div className="flex flex-wrap gap-2"><AdminButton variant={actionStyle[confirmation.command].variant} disabled={busy} loading={pendingAction?.id===j.id&&pendingAction.key===confirmation.command} loadingText={actionStyle[confirmation.command].pending} onClick={()=>act({action:confirmation.bulk?"bulk_control":"control",id:j.id,command:confirmation.command})}><CheckCircle2 size={16}/> Confirmar</AdminButton><AdminButton variant="secondary" disabled={busy} onClick={()=>setConfirmation(null)}>Voltar</AdminButton></div></div>}
       {j.state==="completed"&&reconciliation?.id===j.id&&<div className="rounded-md border border-border p-3 space-y-3">
         <div className="flex items-center justify-between"><strong className="text-sm">Conciliação de contatos</strong><button className="text-xs underline" onClick={()=>{setReconciliation(null);setPendingBinding(null)}}>Fechar</button></div>
         <p className="text-xs text-muted-foreground">Confirme apenas contatos que pertencem à mesma pessoa. Números compartilhados, reciclados ou sem correspondência ficam para revisão. Nenhum cadastro será sobrescrito.</p>
         {reconciliation.entries.some(e=>e.state==="bound")&&<div className="space-y-2">
           <AdminButton variant="success" disabled={busy} loading={busy&&publication?.id===j.id&&publication.done<publication.total} onClick={()=>void publishConversations(j)}><MessageCircle size={16}/> Disponibilizar conversas vinculadas</AdminButton>
           <p className="text-xs text-muted-foreground">Disponibiliza os históricos confirmados em Finalizados, sem iniciar atendimentos, enviar mensagens ou alterar cadastros.</p>
           {publication?.id===j.id&&<p role="status" className="text-xs">{publication.done-publication.failed} de {publication.total} disponíveis{publication.failed>0?` · ${publication.failed} para conferir`:""}</p>}
         </div>}
         <div className="space-y-2">{reconciliation.entries.map(e=><div key={e.contact_key} className="border border-border rounded-md p-3 space-y-1">
           <div className="flex items-center justify-between gap-2"><strong className="text-sm">{formatWhatsAppPhone(e.phone)}</strong><span className="text-xs">{e.state==="bound"?"Vinculado":e.state==="candidate"?"Confirmar correspondência":e.state==="missing"?"Sem cadastro":"Revisão necessária"}</span></div>
           <p className="text-xs break-words">Nome recuperado: {e.historical_name||"Não informado"}</p>
           <p className="text-xs break-words">Cadastro atual: {e.match?.display_name||"Não identificado"}</p>
           {e.state==="missing"&&(pendingBinding===e.contact_key?<div className="space-y-2"><p className="text-xs">Criar este contato na agenda e vincular seu histórico? Nenhum atendimento será iniciado.</p><div className="flex gap-2"><AdminButton disabled={busy} onClick={()=>void confirmBinding(j.id,e)}><UserPlus size={15}/> Criar e vincular</AdminButton><AdminButton variant="secondary" onClick={()=>setPendingBinding(null)}>Voltar</AdminButton></div></div>:<AdminButton variant="secondary" disabled={busy} onClick={()=>setPendingBinding(e.contact_key)}>Conferir novo cadastro</AdminButton>)}
           {e.state==="candidate"&&e.match&&(pendingBinding===e.contact_key?<div className="space-y-2"><p className="text-xs">Confirma que este histórico pertence ao contato atual?</p><div className="flex gap-2"><AdminButton disabled={busy} onClick={()=>void confirmBinding(j.id,e)}><UserCheck size={15}/> Confirmar vínculo</AdminButton><AdminButton variant="secondary" onClick={()=>setPendingBinding(null)}>Voltar</AdminButton></div></div>:<AdminButton variant="secondary" disabled={busy} onClick={()=>setPendingBinding(e.contact_key)}>Conferir vínculo</AdminButton>)}
         </div>)}</div>
         <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground"><span>Página {reconciliation.page+1}</span><div className="flex gap-2"><AdminButton variant="secondary" size="sm" disabled={busy||reconciliation.page===0} onClick={()=>void showCandidates(j.id,reconciliation.page-1,reconciliation.cursors)}>Anterior</AdminButton><AdminButton variant="secondary" size="sm" disabled={busy||!reconciliation.next} onClick={()=>void showCandidates(j.id,reconciliation.page+1,[...reconciliation.cursors.slice(0,reconciliation.page+1),reconciliation.next])}>Próxima</AdminButton></div></div>
       </div>}
       {integrity?.id===j.id&&<div className="rounded-lg border border-border p-3 space-y-2 text-xs">
         <div className="flex justify-between gap-2"><strong>Auditoria do índice privado</strong><button type="button" className="underline" onClick={()=>setIntegrity(null)}>Fechar</button></div>
         <p className={integrity.report.index_matches?"text-emerald-700 dark:text-emerald-300":"text-destructive"}>{integrity.report.index_matches?"Contagens do índice conferem com o manifesto validado.":"Divergências no índice: investigar antes de avançar."}</p>
         <p>{number(integrity.report.indexed)} contatos indexados · {number(integrity.report.bound)} vinculados · {number(integrity.report.review)} para revisão de origem</p>
         <div className="overflow-hidden rounded-md border border-border divide-y divide-border">{metrics.map(([key,name])=><div key={key} className="flex justify-between px-2 py-2"><span>{name}</span><strong>{number(integrity.report.actual[key])} / {number(integrity.report.expected[key])}</strong></div>)}</div>
         <p>IDs de mensagens repetidos: {number(integrity.report.duplicateMessages)} · IDs de protocolos repetidos: {number(integrity.report.duplicateProtocols)}</p>
         <p className="text-muted-foreground">Esta auditoria compara o índice e o manifesto. Não comprova a integridade binária de todos os anexos no R2.</p>
       </div>}
       {logs?.id===j.id&&<div className="max-h-48 overflow-auto rounded-md border border-border p-2"><div className="flex items-center justify-between"><strong className="text-xs">Operações recentes</strong><button className="text-xs underline" onClick={()=>setLogs(null)}>Fechar</button></div>{logs.events.map((e,i)=><p key={i} className="text-xs py-1">{new Date(e.created_at).toLocaleString("pt-BR")} · {e.action==="prepare"?"Preparação":e.action==="validation_failed"?"Validação falhou":e.action} · {e.actor==="worker"?"Processamento automático":"Usuário "+e.actor.slice(0,8)}</p>)}</div>}
       </div>
     </section>
   })}
   {!data.jobs.length&&<p className="text-sm text-muted-foreground">Nenhuma importação preparada.</p>}
   </>}
 </div>;
}
