import { useEffect, useState } from "react";
import { Sparkles, WandSparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { capitalizeSentenceStarts } from "../domain/capitalize-sentence-starts";

type Field = "diagnosis" | "proposed_solution";
type Mode = "generate" | "improve";
type Usage = {
  month_requests:number;month_input_tokens:number;month_output_tokens:number;month_cost_usd:number;
  monthly_budget_usd:number;user_today_requests:number;user_daily_limit:number;
};
type Preview = { text:string;field:Field;mode:Mode;cost:number;inputTokens:number;outputTokens:number };
async function invokeAi(body:Record<string,unknown>):Promise<any> {
  const {data,error}=await supabase.functions.invoke("union-ai-text",{body});
  if(error){
    let message=error.message||"Não foi possível acessar a Union IA.";
    const response=(error as any).context;
    if(response && typeof response.json==="function"){
      try {const payload=await response.json();message=payload?.error||message;}catch{/* sem corpo JSON */}
    }
    throw new Error(message);
  }
  if(!data?.success)throw new Error(data?.error||"A IA não retornou uma resposta válida.");
  return data;
}
const usd=(v:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"USD",minimumFractionDigits:4,maximumFractionDigits:4}).format(v);

export function UnionQuoteAiActions({organizationId,orderId,field,currentText,diagnosisText,onApply}:{
  organizationId:string;orderId:string;field:Field;currentText:string;diagnosisText:string;
  onApply:(text:string)=>void;
}) {
  const {hasPermission,hasModule,activeOrganizationId}=useAuth();
  const [preview,setPreview]=useState<Preview|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const authorized=Boolean(hasModule("ai")&&hasPermission("ai.view")&&hasPermission("orders.edit")&&activeOrganizationId===organizationId);
  useEffect(()=>{setPreview(null);setError("");},[orderId,field]);
  const generate=async(mode:Mode)=>{
    if(loading||!authorized)return;
    setLoading(true);setError("");
    try{
      const response=await invokeAi({
        action:mode,organization_id:organizationId,order_id:orderId,field,
        current_text:currentText,diagnosis_context:field==="proposed_solution"?diagnosisText:"",
      });
      setPreview({text:String(response.text||"").slice(0,400),field,mode,
        cost:Number(response.usage?.cost_usd||0),
        inputTokens:Number(response.usage?.input_tokens||0),
        outputTokens:Number(response.usage?.output_tokens||0)});
      window.dispatchEvent(new CustomEvent("union-ai-consumption",{detail:{organizationId}}));
    }catch(e){setError(e instanceof Error?e.message:"Erro ao gerar texto.");}
    finally{setLoading(false);}
  };
  if(!authorized)return null;
  return <>
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <button type="button" onClick={()=>void generate("generate")} disabled={loading}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-primary/25 bg-primary/5 px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-wait disabled:opacity-50">
        <Sparkles size={13} className={loading?"animate-pulse":""}/>
        {loading?"Gerando...":"Gerar com IA"}
      </button>
      <button type="button" onClick={()=>void generate("improve")} disabled={loading||currentText.trim().length<8}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        title={currentText.trim().length<8?"Digite pelo menos 8 caracteres para melhorar":"Melhorar texto preenchido"}>
        <WandSparkles size={13}/> Melhorar texto
      </button>
    </div>
    {!!error&&<p role="alert" className="text-right text-xs text-destructive">{error}</p>}
    <AdminDialog open={Boolean(preview)} onClose={()=>!loading&&setPreview(null)}
      title={field==="diagnosis"?"Union IA · Diagnóstico":"Union IA · Solução proposta"}
      description="Confira a sugestão antes de aplicar. A IA não confirma diagnósticos nem salva a OS automaticamente."
      className="max-w-xl"
      footer={<div className="flex w-full justify-end gap-2">
        <BtnSecondary onClick={()=>setPreview(null)}>Descartar</BtnSecondary>
        <BtnPrimary onClick={()=>{
          if(!preview)return;
          onApply(capitalizeSentenceStarts(preview.text).slice(0,400));
          setPreview(null);
        }}>Aplicar texto</BtnPrimary>
      </div>}>
      {preview&&<div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground">Texto sugerido · {preview.text.length}/400 caracteres</p>
        <div className="whitespace-pre-wrap rounded-lg border border-border bg-muted/35 p-4 text-sm leading-relaxed text-foreground">
          {preview.text}
        </div>
        <p className="text-xs text-muted-foreground">
          {preview.inputTokens+preview.outputTokens} tokens nesta geração · Custo estimado {usd(preview.cost)}
        </p>
        <p className="text-xs text-muted-foreground">Após aplicar, revise e salve o orçamento normalmente.</p>
      </div>}
    </AdminDialog>
  </>;
}

export function UnionQuoteAiUsage({organizationId}:{organizationId:string}){
  const {hasModule,hasPermission,activeOrganizationId}=useAuth();
  const [usage,setUsage]=useState<Usage|null>(null);
  const [error,setError]=useState("");
  const authorized=Boolean(hasModule("ai")&&hasPermission("ai.view")&&activeOrganizationId===organizationId);
  useEffect(()=>{
    if(!authorized||!organizationId){setUsage(null);return;}
    let alive=true;
    const load=()=>{void invokeAi({action:"usage",organization_id:organizationId})
      .then(data=>{if(alive){setUsage(data.usage);setError("");}})
      .catch(e=>{if(alive)setError(e instanceof Error?e.message:"Consumo indisponível");});};
    const onChange=(event:Event)=>{
      if((event as CustomEvent).detail?.organizationId===organizationId)load();
    };
    load();window.addEventListener("union-ai-consumption",onChange);
    return ()=>{alive=false;window.removeEventListener("union-ai-consumption",onChange);};
  },[organizationId,authorized]);
  if(!authorized)return null;
  return <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
    <span className="inline-flex items-center gap-1.5"><Sparkles size={13}/> Union IA · GPT-6 Luna</span>
    {usage
      ? <span className="tabular-nums">Mês: {usage.month_requests} gerações · {usd(usage.month_cost_usd)} / {usd(usage.monthly_budget_usd)}
          {" · "}Hoje: {usage.user_today_requests}/{usage.user_daily_limit}</span>
      : <span>{error||"Consultando consumo..."}</span>}
  </div>;
}
