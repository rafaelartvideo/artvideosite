import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import { AlertTriangle, Database, RefreshCw } from "lucide-react";

type Job={id:string;state:string;account_phone:string;total:number;updated_at:string;counts:Array<{state:string;count:number}>};
type Data={packages:Array<{package_id:string;created_at:string}>;accounts:Array<{id:string;display_name:string;phone:string}>;jobs:Job[]};
type Audit={actor:string;action:string;created_at:string};
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
export function WhatsAppHistoryImports(){
 const {activeOrganizationId,hasPermission}=useAuth();
 const [data,setData]=useState<Data|null>(null);
 const [account,setAccount]=useState(""),[packageId,setPackageId]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [logs,setLogs]=useState<{id:string;events:Audit[]}|null>(null);
 const [confirmation,setConfirmation]=useState<{id:string;command:string;label:string}|null>(null);
 const requestInFlight=useRef(false), generation=useRef(0);
 const permitted=(key:string)=>hasPermission("whatsapp.history_import."+key);
 const call=useCallback(async(body:Record<string,unknown>)=>{
   if(!activeOrganizationId)throw Error("Empresa indisponível.");
   const {data,error}=await supabase.functions.invoke("union-history-import",{body:{...body,organization_id:activeOrganizationId}});
   if(error||data?.success!==true)throw Error("Não foi possível confirmar a operação de importação.");
   return data.result;
 },[activeOrganizationId]);
 const refresh=useCallback(async()=>{
   if(requestInFlight.current)return;
   requestInFlight.current=true;const epoch=generation.current;
   try{const result=await call({action:"list"});if(epoch!==generation.current)return;setData(result);setError("")}
   catch{if(epoch===generation.current)setError("Serviço privado de importação indisponível. Nenhum histórico foi importado por esta tela.")}
   finally{requestInFlight.current=false}
 },[call]);
 useEffect(()=>{generation.current++;setData(null);setAccount("");setPackageId("");setLogs(null);setConfirmation(null);setError("");void refresh();return()=>{generation.current++}},[refresh]);
 const running=Boolean(data?.jobs.some(j=>active.has(j.state)));
 useEffect(()=>{
   if(!running)return;
   const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void refresh()},10000);
   return()=>window.clearInterval(timer);
 },[running,refresh]);
 async function act(body:Record<string,unknown>){
   const epoch=generation.current;setBusy(true);setError("");
   try{await call(body);if(epoch===generation.current){setConfirmation(null);await refresh()}}
   catch{if(epoch===generation.current)setError("Operação não confirmada. Atualize a lista antes de tentar novamente.")}
   finally{if(epoch===generation.current)setBusy(false)}
 }
 async function showLogs(id:string){
   const epoch=generation.current;
   try{const events=await call({action:"events",id});if(epoch===generation.current)setLogs({id,events})}
   catch{if(epoch===generation.current)setError("Não foi possível carregar o histórico de operações.")}
 }
 if(!permitted("view"))return <p className="p-4 text-sm text-muted-foreground">Sem permissão para visualizar importações.</p>;
 return <div className="space-y-4 p-3">
   <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Database size={18}/><strong>Gerenciador de históricos</strong></div><AdminButton variant="secondary" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={15}/> Atualizar</AdminButton></div>
   <p className="rounded-lg border border-border p-3 text-xs text-muted-foreground">Fase piloto: prepara e valida o índice privado. Ainda não publica mensagens na interface de atendimento. Os arquivos originais permanecem preservados.</p>
   {error&&<div role="alert" className="flex gap-2 rounded-lg border border-destructive/30 p-3 text-sm text-destructive"><AlertTriangle size={16}/>{error}</div>}
   {!data&&!error&&<p className="text-sm text-muted-foreground">Consultando importações...</p>}
   {data&&<><div className="rounded-lg border border-border p-4 space-y-3">
     <div className="grid gap-3 sm:grid-cols-2">
       <label className="space-y-1 text-sm"><span>Pacote privado autorizado</span><select className="w-full rounded-lg border border-border bg-card p-2" value={packageId} onChange={e=>setPackageId(e.target.value)}><option value="">Selecione</option>{data.packages.map(p=><option key={p.package_id} value={p.package_id}>Histórico {p.package_id.slice(0,8)} · {new Date(p.created_at).toLocaleDateString("pt-BR")}</option>)}</select></label>
       <label className="space-y-1 text-sm"><span>Conta de WhatsApp</span><select className="w-full rounded-lg border border-border bg-card p-2" value={account} onChange={e=>setAccount(e.target.value)}><option value="">Selecione</option>{data.accounts.map(a=><option key={a.id} value={a.id}>{a.display_name} · +{a.phone}</option>)}</select></label>
     </div>
     {!data.packages.length&&<p className="text-xs text-muted-foreground">Nenhum pacote disponibilizado pela administração Union para esta empresa.</p>}
     {!data.accounts.length&&<p className="text-xs text-muted-foreground">Conecte uma conta de WhatsApp antes de preparar o lote.</p>}
     {permitted("start")&&<AdminButton disabled={busy||!account||!packageId} onClick={()=>void act({action:"prepare",channel_id:account,package_id:packageId})}>Preparar e conferir</AdminButton>}
   </div>
   {data.jobs.map(j=>{
     const count=(s:string)=>j.counts.find(c=>c.state===s)?.count||0;
     const verified=count("verified"),review=count("review"),percent=j.total?Math.floor(verified*100/j.total):0;
     return <div key={j.id} className="rounded-lg border border-border p-4 space-y-3">
       <div className="flex flex-wrap items-center justify-between gap-2"><strong>Importação · +{j.account_phone}</strong><span className="text-sm font-medium">{label[j.state]||j.state}</span></div>
       <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-primary" style={{width:percent+"%"}}/></div>
       <p className="text-sm">{verified} de {j.total} validados · {review} para revisão · {percent}%</p>
       <div className="flex flex-wrap gap-2">
         {(actions[j.state]||[]).filter(a=>permitted(a.permission)).map(a=><AdminButton key={a.key} variant="secondary" disabled={busy} onClick={()=>["start","cancel","rollback"].includes(a.key)?setConfirmation({id:j.id,command:a.key,label:a.label}):void act({action:"control",id:j.id,command:a.key})}>{a.label}</AdminButton>)}
         <AdminButton variant="secondary" disabled={busy} onClick={()=>void showLogs(j.id)}>Histórico de operações</AdminButton>
       </div>
       {confirmation?.id===j.id&&<div className="rounded-md border border-border p-3 space-y-2"><p className="text-sm">Confirma {confirmation.label.toLowerCase()} para o número +{j.account_phone}?</p><div className="flex gap-2"><AdminButton disabled={busy} onClick={()=>void act({action:"control",id:j.id,command:confirmation.command})}>Confirmar</AdminButton><AdminButton variant="secondary" onClick={()=>setConfirmation(null)}>Voltar</AdminButton></div></div>}
       {logs?.id===j.id&&<div className="max-h-48 overflow-auto rounded-md border border-border p-2"><div className="flex items-center justify-between"><strong className="text-xs">Operações recentes</strong><button className="text-xs underline" onClick={()=>setLogs(null)}>Fechar</button></div>{logs.events.map((e,i)=><p key={i} className="text-xs py-1">{new Date(e.created_at).toLocaleString("pt-BR")} · {e.action==="prepare"?"Preparação":e.action==="validation_failed"?"Validação falhou":e.action} · {e.actor==="worker"?"Processamento automático":"Usuário "+e.actor.slice(0,8)}</p>)}</div>}
     </div>
   })}
   {!data.jobs.length&&<p className="text-sm text-muted-foreground">Nenhuma importação preparada.</p>}
   </>}
 </div>;
}
