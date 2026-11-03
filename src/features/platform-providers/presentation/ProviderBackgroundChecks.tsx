import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck2, ShieldCheck } from "lucide-react";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  listProviderBackgroundChecks, requestProviderBackgroundCheck,
  type PlatformProvider, type ProviderBackgroundCheck,
} from "../infrastructure/platform-providers.repository";

const TJ_UFS = new Set(["AC","AM","BA","CE","DF","ES","GO","MT","PA","PB","PE","PI","RN","RR","RS","SE","TO"]);
type Source = "policia_federal" | "justica_estadual";
type Action = Source | "both";
const inputClass = "h-10 min-w-0 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary";
const labels: Record<Source,string> = {
  policia_federal: "Polícia Federal",
  justica_estadual: "Justiça Estadual (TJ)",
};
const statuses: Record<ProviderBackgroundCheck["result"],string> = {
  processing:"Em processamento",
  negative:"Certidão negativa",
  review:"Revisão humana necessária",
  inconclusive:"Inconclusivo",
  error:"Falha na emissão",
};
function simpleDate(value: string | null) {
  if (!value) return "—";
  const date = value.slice(0,10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date.slice(8,10)+"/"+date.slice(5,7)+"/"+date.slice(0,4);
  return value;
}
export function ProviderBackgroundChecks({provider,organizationId,canCheck}:{
  provider:PlatformProvider; organizationId:string; canCheck:boolean;
}) {
  const queryClient=useQueryClient();
  const [informed,setInformed]=useState(false);
  const [purpose,setPurpose]=useState("Verificação de prestador para serviços contratados pela Union World.");
  const [motherName,setMotherName]=useState("");
  const [fatherName,setFatherName]=useState("");
  const [birthDate,setBirthDate]=useState("");
  const [rg,setRg]=useState("");
  const [checking,setChecking]=useState<Action|null>(null);
  const cpfDigits=(provider.document||"").replace(/\D/g,"");
  const hasCpf=cpfDigits.length===11;
  const supportedTJ=TJ_UFS.has(provider.state);
  const key=["platform-provider-background-checks",organizationId,provider.id];
  const history=useQuery({
    queryKey:key,
    queryFn:()=>listProviderBackgroundChecks(organizationId,provider.id),
    enabled:canCheck,staleTime:20000,
  });

  const consult=async(action:Action)=>{
    if(checking || !canCheck) return;
    if(!hasCpf){notifyAdmin("Informe um CPF válido nos dados do prestador.","error");return;}
    if(!informed || purpose.trim().length<10){
      notifyAdmin("Registre a finalidade e confirme que o prestador foi informado.","error");return;
    }
    if((action==="justica_estadual" || action==="both") && !supportedTJ){
      notifyAdmin("Este fornecedor ainda não disponibiliza certidão do TJ para a UF do prestador.","error");return;
    }
    const sources:Source[]=action==="both"?["policia_federal","justica_estadual"]:[action];
    const cost=(sources.length*0.36).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
    if(!window.confirm("Confirmar "+sources.length+" consulta(s) de antecedentes para "+provider.name+"?\nCusto indicativo: "+cost+
      ". O prestador deve ter sido informado e a finalidade deve ser legítima. Uma nova consulta pode gerar nova cobrança.")) return;
    setChecking(action);
    try{
      for(const source of sources){
        const [year,month,day]=birthDate.split("-");
        await requestProviderBackgroundCheck({
          providerId:provider.id,source,purpose:purpose.trim(),informedDeclaration:true,
          motherName:motherName.trim(),fatherName:fatherName.trim(),rg:rg.trim(),
          birthDate:birthDate?day+"/"+month+"/"+year:"",
        });
        await queryClient.invalidateQueries({queryKey:key});
      }
      notifyAdmin("Solicitação concluída. Confira os resultados e as certidões no histórico.","success");
    }catch(error){
      notifyAdmin(systemErrorMessage(error,"Não foi possível concluir a consulta. Confira o histórico antes de tentar de novo."),"error");
      await queryClient.invalidateQueries({queryKey:key});
    }finally{setChecking(null);}
  };

  return <section className="space-y-4 border-t border-border pt-4">
    <div className="flex items-start gap-3">
      <span className="rounded-lg bg-primary/10 p-2 text-primary"><ShieldCheck size={19}/></span>
      <div>
        <h3 className="text-sm font-bold text-foreground">Consulta de antecedentes criminais</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Emissão sob demanda via Direct Data a partir do CPF cadastrado. Polícia Federal e certidão criminal do TJ da UF do prestador.
          Não corresponde à folha policial completa nem substitui análise individual.
        </p>
      </div>
    </div>

    {!canCheck ? <p className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
      Seu perfil não possui a permissão específica de consultar antecedentes.
    </p> : <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="text-xs font-bold text-foreground">Polícia Federal</div>
          <div className="mt-1 text-xs text-muted-foreground">Consulta federal · R$ 0,36 por tentativa</div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="text-xs font-bold text-foreground">Tribunal de Justiça — {provider.state}</div>
          <div className="mt-1 text-xs text-muted-foreground">{supportedTJ?"Consulta estadual · R$ 0,36 por tentativa":"UF sem cobertura confirmada no fornecedor"}</div>
        </div>
      </div>

      {!hasCpf && <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-foreground">
        É necessário salvar um CPF de pessoa física no cadastro para habilitar a consulta.
      </p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="min-w-0">
          <span className="mb-1 block text-xs font-bold text-foreground">Nome da mãe (se disponível)</span>
          <input className={inputClass} value={motherName} onChange={e=>setMotherName(e.target.value)} maxLength={160}/>
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-xs font-bold text-foreground">Data de nascimento (se disponível)</span>
          <input className={inputClass} type="date" value={birthDate} onChange={e=>setBirthDate(e.target.value)}/>
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-xs font-bold text-foreground">RG (se disponível)</span>
          <input className={inputClass} value={rg} onChange={e=>setRg(e.target.value)} maxLength={35}/>
        </label>
        <label className="min-w-0 sm:col-span-2 lg:col-span-3">
          <span className="mb-1 block text-xs font-bold text-foreground">Nome do pai (se disponível)</span>
          <input className={inputClass} value={fatherName} onChange={e=>setFatherName(e.target.value)} maxLength={160}/>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">Os dados complementares são enviados somente durante esta consulta e não ficam salvos no cadastro da Union.</p>

      <label className="block">
        <span className="mb-1 block text-xs font-bold text-foreground">Finalidade documentada <span className="text-destructive">*</span></span>
        <input className={inputClass} value={purpose} maxLength={300} onChange={e=>setPurpose(e.target.value)}/>
      </label>
      <label className="flex items-start gap-3 text-xs leading-5 text-foreground">
        <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary"
          checked={informed} onChange={e=>setInformed(e.target.checked)}/>
        Declaro que o prestador foi informado sobre a verificação e que a Union possui uma finalidade e base legal adequada para realizá-la.
      </label>
      <div className="flex flex-wrap gap-2">
        <AdminButton variant="secondary" disabled={Boolean(checking)||!hasCpf||!informed}
          loading={checking==="policia_federal"} onClick={()=>void consult("policia_federal")}>Consultar PF</AdminButton>
        <AdminButton variant="secondary" disabled={Boolean(checking)||!hasCpf||!informed||!supportedTJ}
          loading={checking==="justica_estadual"} onClick={()=>void consult("justica_estadual")}>Consultar TJ {provider.state}</AdminButton>
        <AdminButton disabled={Boolean(checking)||!hasCpf||!informed||!supportedTJ}
          loading={checking==="both"} onClick={()=>void consult("both")}>Consultar ambas · R$ 0,72</AdminButton>
      </div>
      <p className="text-xs text-muted-foreground">Valores indicativos divulgados pelo fornecedor, sujeitos à contratação. Cada solicitação é registrada para auditoria. Não existe aprovação ou reprovação automática.</p>

      <div className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Histórico de certidões</h4>
        {history.isPending?<LoadingState text="Carregando histórico"/>:history.isError?
          <p className="text-xs text-destructive">{systemErrorMessage(history.error,"Histórico indisponível.")}</p>:
          history.data?.length?history.data.map(item=><div key={item.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <FileCheck2 size={15} className="shrink-0 text-primary"/> {labels[item.source]}{item.uf?" — "+item.uf:""}
              </span>
              <span className="text-[11px] text-muted-foreground">{simpleDate(item.request_date)}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <span className={item.result==="negative"?"font-bold text-emerald-600":item.result==="review"?"font-bold text-amber-600":"font-bold text-foreground"}>
                {statuses[item.result]}</span>
              {item.certificate_number&&<span>Nº {item.certificate_number}</span>}
              {item.valid_until&&<span>Validade: {simpleDate(item.valid_until)}</span>}
              {item.validation_code&&<span>Código: {item.validation_code}</span>}
            </div>
            {item.result==="review"&&<p className="mt-2 text-xs text-muted-foreground">Requer análise manual. Não indica, por si só, impedimento para prestação de serviços.</p>}
            {item.error_reason&&<p className="mt-2 text-xs text-muted-foreground">{item.error_reason}</p>}
          </div>):<p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">
            Nenhuma consulta realizada para este prestador.
          </p>}
      </div>
    </>}
  </section>;
}
