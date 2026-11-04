import { useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle, PhoneIncoming, ShieldCheck, Save, Info } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/shared/ui/admin/AdminLayout";

type QueueChoice = {id:string;name:string;test_extension:number;enabled:boolean;provisioning_status:string};
type RoutePlan = {organization_id:string;destination_type:"direct_301"|"queue";queue_id:string|null;updated_at:string};

export function UnionPbxInboundPage({onBack}:{onBack:()=>void}) {
  const {activeOrganizationId,hasPermission}=useAuth();
  const canManage=hasPermission("pbx.manage");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [options,setOptions]=useState<QueueChoice[]>([]);
  const [target,setTarget]=useState<"direct_301"|"queue">("direct_301");
  const [queueId,setQueueId]=useState("");
  const [plan,setPlan]=useState<RoutePlan|null>(null);

  useEffect(()=>{
    let cancelled=false;
    setLoading(true);setError("");setNotice("");setOptions([]);
    setTarget("direct_301");setQueueId("");setPlan(null);
    if(!activeOrganizationId||!canManage) {
      setLoading(false);
      return ()=>{cancelled=true;};
    }
    void Promise.all([
      supabase.from("pbx_queues")
        .select("id,name,test_extension,enabled,provisioning_status")
        .eq("organization_id",activeOrganizationId).eq("enabled",true)
        .eq("provisioning_status","applied").order("test_extension").limit(50),
      supabase.from("pbx_inbound_route_plans")
        .select("organization_id,destination_type,queue_id,updated_at")
        .eq("organization_id",activeOrganizationId).maybeSingle(),
    ]).then(([queues,plans])=>{
      if(cancelled) return;
      if(queues.error||plans.error) {
        setError("Não foi possível carregar os destinos ou o planejamento da linha.");
        return;
      }
      const choices=(queues.data||[]) as QueueChoice[];
      setOptions(choices);
      const saved=plans.data as RoutePlan|null;
      setPlan(saved);
      if(saved?.destination_type==="queue"&&saved.queue_id) {
        setTarget("queue");
        setQueueId(saved.queue_id);
      } else {
        setTarget("direct_301");
        setQueueId(choices[0]?.id||"");
      }
    }).catch(()=>{
      if(!cancelled)setError("Falha ao carregar o planejamento da entrada FVX.");
    }).finally(()=>{
      if(!cancelled)setLoading(false);
    });
    return ()=>{cancelled=true;};
  },[activeOrganizationId,canManage]);

  async function save(){
    if(!activeOrganizationId||!canManage||saving) return;
    if(target==="queue"&&!options.some(q=>q.id===queueId)) {
      setError("Selecione uma fila ativa e aplicada.");
      return;
    }
    setSaving(true);setError("");setNotice("");
    const {error:saveError}=await supabase.rpc("pbx_save_inbound_route_plan",{
      p_organization_id:activeOrganizationId,
      p_destination_type:target,
      p_queue_id:target==="queue"?queueId:null,
    });
    setSaving(false);
    if(saveError) {
      setError(saveError.message);
      return;
    }
    setPlan({
      organization_id:activeOrganizationId,
      destination_type:target,
      queue_id:target==="queue"?queueId:null,
      updated_at:new Date().toISOString(),
    });
    setNotice("Planejamento salvo. Nenhuma alteração foi aplicada à VPS nem ao encaminhamento da FVX.");
  }

  return <div className="min-w-0 space-y-5">
    <PageHeader title="Entrada de chamadas — FVX"
      subtitle="Planeje o destino das chamadas recebidas sem interromper a linha atual."/>
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <PhoneIncoming size={22} className="mt-0.5 shrink-0 text-primary"/>
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Roteamento identificado no Asterisk</h2>
          <p className="text-sm text-muted-foreground">
            Contexto <strong className="text-foreground">union-entrada</strong>, com ligação direta para
            <strong className="text-foreground"> ramal 301</strong> (25 segundos).
            A rota foi confirmada na VPS antes desta etapa; o CRM ainda não altera essa configuração.
          </p>
        </div>
      </div>
      <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
        <ShieldCheck size={17} className="mt-0.5 shrink-0 text-primary"/>
        <p>Esta tela salva apenas o <strong>planejamento</strong>. Não envia mudanças para o agente,
          não modifica arquivos do Asterisk e não redireciona a operadora.
          A ativação e o retorno seguro ao 301 serão habilitados somente após validação separada.</p>
      </div>
    </section>

    {error&&<p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
    {notice&&<p role="status" className="rounded-lg border border-border bg-card p-3 text-sm text-foreground">{notice}</p>}

    <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 className="text-base font-semibold text-foreground">Destino planejado</h2>
      {loading?<p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle size={17} className="animate-spin"/> Carregando destinos</p>:
      <>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
          <input type="radio" name="pbx-inbound-destination" checked={target==="direct_301"}
            onChange={()=>setTarget("direct_301")} className="mt-1 h-4 w-4 accent-primary"/>
          <span>
            <strong className="block text-sm text-foreground">Atendimento direto · Ramal 301</strong>
            <span className="text-xs text-muted-foreground">Mantém o encaminhamento tradicional do número principal.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
          <input type="radio" name="pbx-inbound-destination" checked={target==="queue"}
            disabled={!options.length} onChange={()=>setTarget("queue")}
            className="mt-1 h-4 w-4 accent-primary"/>
          <span className="min-w-0 flex-1 space-y-2">
            <strong className="block text-sm text-foreground">Distribuir pela fila de atendimento</strong>
            <span className="block text-xs text-muted-foreground">
              Futuramente, as ligações serão direcionadas para a fila selecionada, após ativação controlada na VPS.
            </span>
            <select value={queueId} onChange={e=>setQueueId(e.target.value)}
              onClick={e=>e.stopPropagation()}
              disabled={!options.length} aria-label="Fila de destino planejada"
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground">
              {!options.length&&<option value="">Nenhuma fila ativa aplicada</option>}
              {options.map(q=><option value={q.id} key={q.id}>{q.test_extension} · {q.name}</option>)}
            </select>
          </span>
        </label>
        {plan&&<p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info size={15}/> Último planejamento registrado: {new Date(plan.updated_at).toLocaleString("pt-BR")}
        </p>}
        {canManage&&<div className="flex justify-end">
          <button type="button" onClick={()=>void save()}
            disabled={saving||(target==="queue"&&!options.length)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0057e7] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {saving?<LoaderCircle size={16} className="animate-spin"/>:<Save size={16}/>}
            Salvar planejamento
          </button>
        </div>}
      </>}
    </section>
    <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
      <ArrowLeft size={16}/> Voltar ao telefone
    </button>
  </div>;
}
