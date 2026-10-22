import { useEffect, useState } from "react";
import { ArrowLeft, RefreshCw, Sparkles, Save, Coins } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";

type Usage = {month_requests:number;month_cost_usd:number;month_input_tokens:number;month_output_tokens:number;monthly_budget_usd:number;user_today_requests:number;user_daily_limit:number};
type RecordItem={created_at:string;status:string;field_key:string;action_key:string;input_tokens:number;output_tokens:number;cost_usd:number};
type Report={usage:Usage;settings:{monthly_budget_usd?:number;daily_request_limit?:number;per_minute_limit?:number};recent:RecordItem[];can_configure:boolean};
async function invoke(body:Record<string,unknown>):Promise<any>{
 const {data,error}=await supabase.functions.invoke("union-ai-text",{body});
 if(error){
   let message=error.message||"Não foi possível conectar à Union IA.";
   const response=(error as any).context;
   if(response && typeof response.json==="function"){
     try{message=(await response.json())?.error||message;}catch{/* ignore */}
   }
   throw new Error(message);
 }
 if(!data?.success)throw new Error(data?.error||"Resposta inválida da Union IA.");
 return data;
}
const money=(n:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"USD",minimumFractionDigits:4,maximumFractionDigits:4}).format(n||0);

export function UnionAiToolPage({onBack}:{onBack:()=>void}){
 const {activeOrganizationId,hasModule,hasPermission}=useAuth();
 const [report,setReport]=useState<Report|null>(null);
 const [limits,setLimits]=useState({monthly_budget_usd:2,daily_request_limit:40,per_minute_limit:5});
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [feedback,setFeedback]=useState("");
 const allowed=Boolean(activeOrganizationId&&hasModule("ai")&&hasPermission("ai.view"));
 const refresh=async()=>{
   if(!activeOrganizationId)return;
   setError("");setLoading(true);
   try{
     const data=await invoke({action:"report",organization_id:activeOrganizationId});
     setReport(data);
     setLimits({
       monthly_budget_usd:Number(data.settings?.monthly_budget_usd??2),
       daily_request_limit:Number(data.settings?.daily_request_limit??40),
       per_minute_limit:Number(data.settings?.per_minute_limit??5),
     });
   }catch(e){setError(e instanceof Error?e.message:"Erro ao carregar o consumo");}
   finally{setLoading(false);}
 };
 useEffect(()=>{setReport(null);setFeedback("");if(allowed)void refresh();},[activeOrganizationId,allowed]);
 const save=async()=>{
   if(!activeOrganizationId||saving)return;
   setSaving(true);setError("");setFeedback("");
   try{
     await invoke({action:"configure",organization_id:activeOrganizationId,...limits});
     setFeedback("Limites atualizados com sucesso.");
     await refresh();
   }catch(e){setError(e instanceof Error?e.message:"Não foi possível salvar os limites");}
   finally{setSaving(false);}
 };
 if(!allowed)return <div className="p-5 text-sm text-muted-foreground">Union IA não habilitada para sua empresa ou sem permissão de acesso.</div>;
 return <div className="space-y-5 pb-10">
   <header className="flex flex-wrap items-center justify-between gap-3">
     <div className="flex items-center gap-2">
       <Sparkles size={19} className="text-primary"/>
       <div><h1 className="text-xl font-bold text-foreground">Union IA</h1><p className="text-xs text-muted-foreground">Consumo, limites e gerações dos orçamentos</p></div>
     </div>
     <div className="flex items-center gap-2">
       <BtnSecondary onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15} className={loading?"animate-spin":""}/> Atualizar</BtnSecondary>
       <BtnSecondary onClick={onBack}><ArrowLeft size={15}/> Voltar</BtnSecondary>
     </div>
   </header>
   {error&&<div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
   {feedback&&<div role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{feedback}</div>}
   {!report&&loading?<div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">Carregando consumo da IA...</div>:null}
   {report&&<>
     <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
       {[
         ["Gasto no mês",money(report.usage.month_cost_usd)],
         ["Orçamento do mês",money(report.usage.monthly_budget_usd)],
         ["Gerações realizadas",report.usage.month_requests.toLocaleString("pt-BR")],
         ["Tokens consumidos",(report.usage.month_input_tokens+report.usage.month_output_tokens).toLocaleString("pt-BR")],
       ].map(([label,value])=><div key={label} className="rounded-xl border border-border bg-card p-4">
         <p className="text-xs font-medium text-muted-foreground">{label}</p>
         <strong className="mt-2 block text-xl font-bold tabular-nums text-foreground">{value}</strong>
       </div>)}
     </section>
     <section className="rounded-xl border border-border bg-card p-4">
       <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
         <div><h2 className="text-sm font-bold">Controle mensal</h2><p className="text-xs text-muted-foreground">GPT-6 Luna · bloqueio efetivo realizado no servidor</p></div>
         <Coins size={18} className="text-muted-foreground"/>
       </div>
       <div className="h-2 overflow-hidden rounded-full bg-muted">
         <div className="h-full rounded-full bg-primary transition-all" style={{width:`${Math.min(100,100*report.usage.month_cost_usd/Math.max(0.01,report.usage.monthly_budget_usd))}%`}}/>
       </div>
       <p className="mt-2 text-xs text-muted-foreground">Hoje você utilizou {report.usage.user_today_requests}/{report.usage.user_daily_limit} gerações. O limite é por usuário.</p>
     </section>
     <section className="rounded-xl border border-border bg-card p-4">
       <h2 className="font-bold">Limites da empresa</h2>
       <p className="mt-1 text-xs text-muted-foreground">Os limites protegem contra consumo excessivo. O valor exibido é em dólar, independente do câmbio.</p>
       <div className="mt-4 grid gap-3 sm:grid-cols-3">
         {([
           ["monthly_budget_usd","Orçamento mensal (US$)","0.50","50","0.50"],
           ["daily_request_limit","Gerações por usuário/dia","1","500","1"],
           ["per_minute_limit","Gerações por usuário/minuto","1","30","1"],
         ] as const).map(([key,label,min,max,step])=><label key={key} className="space-y-1 text-xs font-semibold">
           <span className="text-muted-foreground">{label}</span>
           <input type="number" min={min} max={max} step={step} disabled={!report.can_configure||saving}
             value={limits[key]} onChange={e=>setLimits(prev=>({...prev,[key]:Number(e.target.value)}))}
             className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"/>
         </label>)}
       </div>
       {report.can_configure?<div className="mt-4 flex justify-end">
         <BtnPrimary disabled={saving} onClick={()=>void save()}><Save size={14}/> {saving?"Salvando...":"Salvar limites"}</BtnPrimary>
       </div>:<p className="mt-3 text-xs text-muted-foreground">Apenas o proprietário ou gestor com permissão de configurações pode alterar os limites.</p>}
     </section>
     <section className="overflow-hidden rounded-xl border border-border bg-card">
       <div className="p-4"><h2 className="font-bold">Últimas gerações deste mês</h2><p className="text-xs text-muted-foreground">Somente metadados: nenhum texto de cliente é armazenado no histórico da IA.</p></div>
       <div className="overflow-x-auto"><table className="w-full min-w-[590px] text-left text-xs">
         <thead className="bg-muted/50 text-muted-foreground"><tr>
           <th className="px-4 py-3">Data</th><th className="px-4 py-3">Campo</th><th className="px-4 py-3">Operação</th>
           <th className="px-4 py-3">Situação</th><th className="px-4 py-3 text-right">Tokens</th><th className="px-4 py-3 text-right">Custo</th>
         </tr></thead>
         <tbody>{report.recent.length?report.recent.map((item,i)=><tr key={item.created_at+i} className="border-t border-border">
           <td className="px-4 py-3">{new Date(item.created_at).toLocaleString("pt-BR")}</td>
           <td className="px-4 py-3">{item.field_key==="diagnosis"?"Diagnóstico":"Solução proposta"}</td>
           <td className="px-4 py-3">{item.action_key==="generate"?"Gerar":"Melhorar"}</td>
           <td className="px-4 py-3">{item.status==="success"?"Concluída":item.status==="failed"?"Falhou":"Processando"}</td>
           <td className="px-4 py-3 text-right tabular-nums">{item.input_tokens+item.output_tokens}</td>
           <td className="px-4 py-3 text-right tabular-nums">{money(item.cost_usd)}</td>
         </tr>):<tr><td colSpan={6} className="px-4 py-7 text-center text-muted-foreground">Nenhuma geração registrada neste mês.</td></tr>}</tbody>
       </table></div>
     </section>
   </>}
 </div>;
}
