import { pbxRequest, pbxOperationError } from "../application/pbx-request";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, LoaderCircle, PhoneIncoming, ShieldCheck, Save, Info } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { PageHeader, AdminButton } from "@/shared/ui/admin/AdminLayout";
import { AdminSelect } from "@/shared/ui/admin/AdminFormControls";
import { AdminWorkspaceSkeleton } from "@/shared/ui/admin/AdminWorkspaceSkeleton";

type QueueChoice = {id:string;name:string;test_extension:number;enabled:boolean;provisioning_status:string};
type RoutePlan = {organization_id:string;destination_type:"direct_301"|"queue";queue_id:string|null;updated_at:string};

export function UnionPbxInboundPage({onBack}:{onBack:()=>void}) {
  const requestScope = useRef(new AbortController());
  useEffect(() => {
    const scope = new AbortController(); requestScope.current = scope;
    return () => scope.abort();
  }, []);
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
      pbxRequest(signal => supabase.from("pbx_queues")
        .select("id,name,test_extension,enabled,provisioning_status")
        .eq("organization_id",activeOrganizationId).eq("enabled",true)
        .eq("provisioning_status","applied").order("test_extension").limit(50).abortSignal(signal), "Consulta PABX", { signal: requestScope.current.signal }).catch(pbxOperationError),
      pbxRequest(signal => supabase.from("pbx_inbound_route_plans")
        .select("organization_id,destination_type,queue_id,updated_at")
        .eq("organization_id",activeOrganizationId).maybeSingle().abortSignal(signal), "Consulta PABX", { signal: requestScope.current.signal }).catch(pbxOperationError),
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
    const {error:saveError}=await pbxRequest(signal => supabase.rpc("pbx_save_inbound_route_plan",{
      p_organization_id:activeOrganizationId,
      p_destination_type:target,
      p_queue_id:target==="queue"?queueId:null,
    }).abortSignal(signal), "Alteração PABX", { signal: requestScope.current.signal }).catch(pbxOperationError);
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
          <h2 className="text-sm font-semibold text-foreground">Planejamento da linha FVX</h2>
          <p className="text-sm text-muted-foreground">
            Número principal <strong className="text-foreground">(11) 4290-1575</strong>.
            Escolha o destino proposto e salve o planejamento. A aplicação em produção exige validação separada.
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
      {loading?<AdminWorkspaceSkeleton variant="cards" rows={2} />:
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
            <AdminSelect value={queueId} onValueChange={value=>{setTarget('queue');setQueueId(value);}}
              disabled={!options.length} ariaLabel="Fila de destino planejada"
              options={options.length ? options.map(q=>({value:q.id,label:`${q.test_extension} · ${q.name}`})) : [{value:'',label:'Nenhuma fila ativa aplicada'}]} />
          </span>
        </label>
        {plan&&<p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info size={15}/> Último planejamento registrado: {new Date(plan.updated_at).toLocaleString("pt-BR")}
        </p>}
        {canManage&&<div className="flex justify-end">
          <AdminButton variant="primary" type="button" onClick={()=>void save()}
            disabled={saving||(target==="queue"&&!options.length)}
            >
            {saving?<LoaderCircle size={16} className="animate-spin"/>:<Save size={16}/>}
            Salvar planejamento
          </AdminButton>
        </div>}
      </>}
    </section>
    <AdminButton variant="ghost" type="button" onClick={onBack} >
      <ArrowLeft size={16}/> Voltar ao telefone
    </AdminButton>
  </div>;
}
