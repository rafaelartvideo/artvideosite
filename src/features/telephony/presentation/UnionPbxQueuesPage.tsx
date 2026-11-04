import { useEffect, useMemo, useState } from "react";
import { Headphones, LoaderCircle, Pencil, Plus, RefreshCw, Save, ShieldCheck, Users, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/shared/ui/admin/AdminLayout";
import { QueueLiveDetails, usePbxQueueLive } from "./UnionPbxQueueLiveStatus";

type PbxQueue = {
  id: string;
  organization_id: string;
  name: string;
  test_extension: number;
  strategy: "ringall" | "rrmemory" | "linear";
  ring_seconds: number;
  max_wait_seconds: number;
  enabled: boolean;
  provisioning_status: "pending" | "applied" | "failed";
  last_error: string | null;
};
type PbxMember = {queue_id: string; extension_id: string; position: number};
type PbxExtension = {
  id: string;
  number: number;
  display_name: string;
  desired_enabled: boolean;
  provisioning_status: string;
};
type QueueForm = {
  id: string | null;
  name: string;
  testExtension: string;
  strategy: PbxQueue["strategy"];
  ringSeconds: string;
  maxWaitSeconds: string;
  enabled: boolean;
  extensionIds: string[];
};

const emptyForm:QueueForm = {
  id:null, name:"", testExtension:"850",strategy:"ringall",
  ringSeconds:"20",maxWaitSeconds:"120",enabled:true,extensionIds:[],
};
const fieldClass = "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60";
const strategyLabels:Record<PbxQueue["strategy"],string> = {
  ringall:"Tocar em todos ao mesmo tempo",
  rrmemory:"Alternar atendentes (rodízio)",
  linear:"Tocar na ordem dos ramais",
};
const statusLabels:Record<PbxQueue["provisioning_status"],string> = {
  pending:"Aguardando aplicação na VPS",
  applied:"Configuração aplicada",
  failed:"Falha na sincronização",
};

export function UnionPbxQueuesPage({onBack}:{onBack:()=>void}) {
  const { activeOrganizationId, hasPermission }=useAuth();
  const canManage=hasPermission("pbx.manage");
  const live=usePbxQueueLive(canManage ? activeOrganizationId : null);
  const [queues,setQueues]=useState<PbxQueue[]>([]);
  const [members,setMembers]=useState<PbxMember[]>([]);
  const [extensions,setExtensions]=useState<PbxExtension[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [reload,setReload]=useState(0);
  const [formOpen,setFormOpen]=useState(false);
  const [form,setForm]=useState<QueueForm>(emptyForm);

  useEffect(()=>{
    let cancelled=false;
    setLoading(true);setError("");setQueues([]);setMembers([]);setExtensions([]);
    setFormOpen(false);setForm(emptyForm);
    if(!canManage||!activeOrganizationId) {
      setLoading(false);
      return ()=>{cancelled=true;};
    }
    void (async()=>{
      const [queueResult,extensionResult]=await Promise.all([
        supabase.from("pbx_queues")
          .select("id,organization_id,name,test_extension,strategy,ring_seconds,max_wait_seconds,enabled,provisioning_status,last_error")
          .eq("organization_id",activeOrganizationId).order("test_extension").limit(50),
        supabase.from("pbx_extensions")
          .select("id,number,display_name,desired_enabled,provisioning_status")
          .eq("organization_id",activeOrganizationId).order("number").limit(300),
      ]);
      if(cancelled) return;
      if(queueResult.error||extensionResult.error){
        setError("Não foi possível carregar as filas e os ramais. " +
          (queueResult.error?.message||extensionResult.error?.message||""));
        setLoading(false);
        return;
      }
      const list=(queueResult.data||[]) as PbxQueue[];
      setQueues(list);
      setExtensions((extensionResult.data||[]) as PbxExtension[]);
      if(list.length){
        const memberResult=await supabase.from("pbx_queue_members")
          .select("queue_id,extension_id,position")
          .in("queue_id",list.map(item=>item.id))
          .order("position");
        if(cancelled) return;
        if(memberResult.error) setError("Não foi possível carregar os integrantes das filas.");
        else setMembers((memberResult.data||[]) as PbxMember[]);
      }
      setLoading(false);
    })();
    return ()=>{cancelled=true;};
  },[activeOrganizationId,canManage,reload]);

  const memberByQueue=useMemo(()=>{
    const map=new Map<string,string[]>();
    for(const entry of members){
      const current=map.get(entry.queue_id)||[];
      current.push(entry.extension_id);
      map.set(entry.queue_id,current);
    }
    return map;
  },[members]);
  const extensionById=useMemo(()=>new Map(extensions.map(item=>[item.id,item])),[extensions]);
  const eligibleExtensions=extensions.filter(item=>item.desired_enabled &&
    (item.provisioning_status==="applied"||item.provisioning_status==="manual"));

  function beginNew(){
    const occupied=new Set([...queues.map(q=>q.test_extension),...extensions.map(e=>e.number)]);
    let number=850;
    while(number<=899 && occupied.has(number)) number++;
    if(number>899){setError("Todos os números de teste entre 850 e 899 estão ocupados.");return;}
    setForm({...emptyForm,testExtension:String(number)});
    setFormOpen(true);setError("");setNotice("");
  }

  function beginEdit(item:PbxQueue){
    setForm({
      id:item.id,name:item.name,testExtension:String(item.test_extension),
      strategy:item.strategy,ringSeconds:String(item.ring_seconds),
      maxWaitSeconds:String(item.max_wait_seconds),enabled:item.enabled,
      extensionIds:memberByQueue.get(item.id)||[],
    });
    setFormOpen(true);setError("");setNotice("");
  }

  function toggleMember(id:string){
    setForm(current=>{
      const exists=current.extensionIds.includes(id);
      return {...current,extensionIds:exists
        ?current.extensionIds.filter(value=>value!==id)
        :[...current.extensionIds,id]};
    });
  }

  async function save(next:QueueForm){
    if(!activeOrganizationId||!canManage||saving)return;
    const testExtension=Number(next.testExtension);
    const ringSeconds=Number(next.ringSeconds);
    const maxWaitSeconds=Number(next.maxWaitSeconds);
    if(next.name.trim().length<2||next.name.trim().length>80 ||
      !Number.isInteger(testExtension)||testExtension<850||testExtension>899 ||
      !Number.isInteger(ringSeconds)||ringSeconds<10||ringSeconds>40 ||
      !Number.isInteger(maxWaitSeconds)||maxWaitSeconds<30||maxWaitSeconds>300 ||
      (next.enabled&&next.extensionIds.length===0)){
      setError("Confira nome, número (850–899), tempos e pelo menos um ramal participante.");
      return;
    }
    setSaving(true);setError("");setNotice("");
    const {error:saveError}=await supabase.rpc("pbx_save_queue",{
      p_organization_id:activeOrganizationId,
      p_queue_id:next.id,
      p_name:next.name.trim(),
      p_test_extension:testExtension,
      p_strategy:next.strategy,
      p_ring_seconds:ringSeconds,
      p_max_wait_seconds:maxWaitSeconds,
      p_enabled:next.enabled,
      p_extension_ids:next.extensionIds,
    });
    setSaving(false);
    if(saveError){setError(saveError.message);return;}
    setFormOpen(false);
    setNotice("Fila salva. Aguardando a sincronização do agente na VPS.");
    setReload(key=>key+1);
  }

  async function retry(item:PbxQueue){
    if(!activeOrganizationId||!canManage||saving||item.provisioning_status!=="failed")return;
    setSaving(true);setError("");
    const {error:retryError}=await supabase.rpc("pbx_retry_queue",{
      p_organization_id:activeOrganizationId,p_queue_id:item.id,
    });
    setSaving(false);
    if(retryError)setError(retryError.message);
    else {setNotice("Nova tentativa solicitada.");setReload(key=>key+1);}
  }

  async function changeEnabled(item:PbxQueue){
    if(saving)return;
    const extensionIds=memberByQueue.get(item.id)||[];
    const updated={id:item.id,name:item.name,testExtension:String(item.test_extension),
      strategy:item.strategy,ringSeconds:String(item.ring_seconds),
      maxWaitSeconds:String(item.max_wait_seconds),enabled:!item.enabled,extensionIds};
    if(!window.confirm((item.enabled?"Desativar":"Ativar")+" a fila "+item.name+
      "? A mudança será aplicada pela VPS, sem redirecionar o número principal."))return;
    await save(updated);
  }

  return <div className="min-w-0 space-y-5">
    <PageHeader title="Filas do PABX Union"
      subtitle="Distribua chamadas entre ramais e teste as filas antes de configurar a linha externa."/>
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex max-w-2xl items-start gap-3">
        <ShieldCheck size={20} className="mt-0.5 shrink-0 text-primary"/>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Ativação controlada</p>
          <p className="text-xs leading-5 text-muted-foreground">
            A fila será cadastrada e sincronizada com o Asterisk. Os testes usam números internos de 850 a 899.
            O número (11) 4290-1575 continua direcionado ao atendimento existente até uma ativação separada.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={()=>setReload(n=>n+1)} disabled={saving}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-foreground">
          <RefreshCw size={16}/> Atualizar
        </button>
        {canManage && <button type="button" onClick={beginNew} disabled={saving}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0057e7] px-4 text-sm font-semibold text-white disabled:opacity-50">
          <Plus size={16}/> Nova fila
        </button>}
      </div>
    </section>

    {error && <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
    {live.error && <p role="status" className="text-xs text-muted-foreground">{live.error}</p>}
    {notice && <p role="status" className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}

    {formOpen && canManage && <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">{form.id?"Editar fila":"Nova fila"}</h2>
        <button type="button" onClick={()=>setFormOpen(false)} disabled={saving} aria-label="Fechar"
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><X size={17}/></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs font-semibold text-foreground">Nome da fila *
          <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
            maxLength={80} placeholder="Atendimento geral" className={fieldClass}/>
        </label>
        <label className="space-y-1 text-xs font-semibold text-foreground">Número interno de teste *
          <input value={form.testExtension} type="number" min={850} max={899}
            onChange={e=>setForm(f=>({...f,testExtension:e.target.value}))}
            className={fieldClass}/>
        </label>
        <label className="space-y-1 text-xs font-semibold text-foreground">Distribuição *
          <select value={form.strategy} onChange={e=>setForm(f=>({...f,strategy:e.target.value as PbxQueue["strategy"]}))}
            className={fieldClass}>
            {Object.entries(strategyLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold text-foreground">Toque por tentativa (10–40 s)
          <input type="number" min={10} max={40} value={form.ringSeconds}
            onChange={e=>setForm(f=>({...f,ringSeconds:e.target.value}))}
            className={fieldClass}/>
        </label>
        <label className="space-y-1 text-xs font-semibold text-foreground">Espera máxima (30–300 s)
          <input type="number" min={30} max={300} value={form.maxWaitSeconds}
            onChange={e=>setForm(f=>({...f,maxWaitSeconds:e.target.value}))}
            className={fieldClass}/>
        </label>
        <label className="flex items-center gap-2 self-end py-2 text-sm font-medium text-foreground">
          <input type="checkbox" checked={form.enabled}
            onChange={e=>setForm(f=>({...f,enabled:e.target.checked}))}
            className="h-4 w-4 accent-primary"/> Fila ativa
        </label>
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-foreground">Ramais participantes</h3>
        <p className="text-xs text-muted-foreground">
          Selecione os ramais na ordem desejada. Para a estratégia sequencial, o primeiro selecionado toca primeiro.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {eligibleExtensions.map(extension=><label key={extension.id}
            className="flex min-w-0 items-center gap-2 rounded-lg border border-border p-3 text-sm text-foreground">
            <input type="checkbox" checked={form.extensionIds.includes(extension.id)}
              onChange={()=>toggleMember(extension.id)} className="h-4 w-4 shrink-0 accent-primary"/>
            <span className="min-w-0 flex-1 truncate">{extension.number} · {extension.display_name}</span>
            {form.extensionIds.includes(extension.id) && <span className="text-xs text-muted-foreground">
              {form.extensionIds.indexOf(extension.id)+1}º</span>}
          </label>)}
          {!eligibleExtensions.length && <p className="text-xs text-muted-foreground">
            Nenhum ramal ativo disponível. Provisione os ramais na página de gerenciamento primeiro.
          </p>}
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={()=>setFormOpen(false)} disabled={saving}
          className="h-10 rounded-lg border border-border px-4 text-sm font-semibold text-foreground">Cancelar</button>
        <button type="button" onClick={()=>void save(form)} disabled={saving}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0057e7] px-4 text-sm font-semibold text-white disabled:opacity-50">
          {saving?<LoaderCircle size={16} className="animate-spin"/>:<Save size={16}/>} Salvar fila
        </button>
      </div>
    </section>}

    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Filas cadastradas</h2>
        <p className="mt-1 text-xs text-muted-foreground">{queues.length} filas · Atualização manual, sem consultas contínuas</p>
      </div>
      {loading?<div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <LoaderCircle size={18} className="animate-spin"/> Carregando filas
      </div>:queues.length===0?<p className="p-8 text-center text-sm text-muted-foreground">Nenhuma fila cadastrada ainda.</p>:
        <div className="divide-y divide-border">
          {queues.map(queue=>{
            const assigned=memberByQueue.get(queue.id)||[];
            return <div key={queue.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0057e7]/10 text-[#0057e7]">
                <Headphones size={18}/>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-semibold text-foreground">{queue.test_extension} · {queue.name}</p>
                <p className="text-xs text-muted-foreground">{strategyLabels[queue.strategy]} · Espera máxima {queue.max_wait_seconds}s</p>
                <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <Users size={13}/> {assigned.map(id=>extensionById.get(id)?.number||"Ramal").join(", ")||"Nenhum participante"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {queue.enabled?statusLabels[queue.provisioning_status]:"Desativada" +
                    (queue.provisioning_status==="pending"?" · Aguardando sincronização":"")}
                </p>
                {queue.provisioning_status==="failed" && <p className="text-xs text-red-600 dark:text-red-400">
                  {queue.last_error||"Não foi possível aplicar na VPS."}</p>}
                {queue.enabled && queue.provisioning_status==="applied" && <QueueLiveDetails status={live.items[queue.id]} now={live.now}/>}
              </div>
              {canManage && <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={()=>beginEdit(queue)} disabled={saving}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground">
                  <Pencil size={14}/> Editar
                </button>
                <button type="button" onClick={()=>void changeEnabled(queue)} disabled={saving}
                  className="h-9 rounded-lg border border-border px-3 text-xs font-semibold text-foreground">
                  {queue.enabled?"Desativar":"Ativar"}
                </button>
                {queue.provisioning_status==="failed" && <button type="button"
                  onClick={()=>void retry(queue)} disabled={saving}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground">
                  <RefreshCw size={14}/> Repetir
                </button>}
              </div>}
            </div>;
          })}
        </div>}
    </section>
    <button type="button" onClick={onBack} className="text-sm font-semibold text-primary hover:underline">
      Voltar para o telefone
    </button>
  </div>;
}
