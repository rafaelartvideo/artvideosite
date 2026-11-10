import { FInput, AdminSelect } from "@/shared/ui/admin/AdminFormControls";
import { pbxRequest, pbxOperationError } from "../application/pbx-request";
import { useEffect, useRef, useMemo, useState } from "react";
import { Headphones, LoaderCircle, Pencil, Plus, RefreshCw, Save, ShieldCheck, Users, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { PageHeader, AdminButton, AdminSectionEmpty } from "@/shared/ui/admin/AdminLayout";
import { AdminWorkspaceSkeleton } from "@/shared/ui/admin/AdminWorkspaceSkeleton";
import { QueueLiveDetails, usePbxQueueLive } from "./UnionPbxQueueLiveStatus";
import { UnionPbxMemberAvailability } from './UnionPbxMemberAvailability';

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
  const requestScope = useRef(new AbortController());
  useEffect(() => {
    const scope = new AbortController(); requestScope.current = scope;
    return () => scope.abort();
  }, []);
  const { activeOrganizationId, hasPermission }=useAuth();
  const canManage=hasPermission("pbx.manage");
  const [queues,setQueues]=useState<PbxQueue[]>([]);
  const [members,setMembers]=useState<PbxMember[]>([]);
  const [extensions,setExtensions]=useState<PbxExtension[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [reload,setReload]=useState(0);
  const live=usePbxQueueLive(canManage ? activeOrganizationId : null,reload);
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
        pbxRequest(signal => supabase.from("pbx_queues")
          .select("id,organization_id,name,test_extension,strategy,ring_seconds,max_wait_seconds,enabled,provisioning_status,last_error")
          .eq("organization_id",activeOrganizationId).order("test_extension").limit(50).abortSignal(signal), "Consulta PABX", { signal: requestScope.current.signal }).catch(pbxOperationError),
        pbxRequest(signal => supabase.from("pbx_extensions")
          .select("id,number,display_name,desired_enabled,provisioning_status")
          .eq("organization_id",activeOrganizationId).order("number").limit(300).abortSignal(signal), "Consulta PABX", { signal: requestScope.current.signal }).catch(pbxOperationError),
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
        const memberResult=await pbxRequest(signal => supabase.from("pbx_queue_members")
          .select("queue_id,extension_id,position")
          .in("queue_id",list.map(item=>item.id))
          .order("position").abortSignal(signal), "Consulta PABX", { signal: requestScope.current.signal }).catch(pbxOperationError);
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
    const {error:saveError}=await pbxRequest(signal => supabase.rpc("pbx_save_queue",{
      p_organization_id:activeOrganizationId,
      p_queue_id:next.id,
      p_name:next.name.trim(),
      p_test_extension:testExtension,
      p_strategy:next.strategy,
      p_ring_seconds:ringSeconds,
      p_max_wait_seconds:maxWaitSeconds,
      p_enabled:next.enabled,
      p_extension_ids:next.extensionIds,
    }).abortSignal(signal), "Alteração PABX", { signal: requestScope.current.signal }).catch(pbxOperationError);
    setSaving(false);
    if(saveError){setError(saveError.message);return;}
    setFormOpen(false);
    setNotice("Fila salva. Aguardando a sincronização do agente na VPS.");
    setReload(key=>key+1);
  }

  async function retry(item:PbxQueue){
    if(!activeOrganizationId||!canManage||saving||item.provisioning_status!=="failed")return;
    setSaving(true);setError("");
    const {error:retryError}=await pbxRequest(signal => supabase.rpc("pbx_retry_queue",{
      p_organization_id:activeOrganizationId,p_queue_id:item.id,
    }).abortSignal(signal), "Alteração PABX", { signal: requestScope.current.signal }).catch(pbxOperationError);
    setSaving(false);
    if(retryError)setError(retryError.message);
    else {setNotice("Nova tentativa solicitada.");setReload(key=>key+1);}
  }

  async function setMemberPaused(queueId:string,extensionId:string,paused:boolean){
    if(!activeOrganizationId || !canManage || saving || !live.ready)return;
    setSaving(true);setError('');setNotice('');
    const result=await pbxRequest(signal=>supabase.rpc("pbx_set_queue_member_paused",{
      p_organization_id:activeOrganizationId,p_queue_id:queueId,p_extension_id:extensionId,p_paused:paused,
    }).abortSignal(signal),'Solicitação de disponibilidade',{signal:requestScope.current.signal}).catch(pbxOperationError);
    setSaving(false);
    if(result.error){setError(result.error.message);return;}
    setNotice(paused?'Pausa solicitada. Aguarde a confirmação da central.':'Retomada solicitada. Aguarde a confirmação da central.');
    live.refreshControls();
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
        <AdminButton variant="secondary" type="button" onClick={()=>setReload(n=>n+1)} disabled={saving}
          >
          <RefreshCw size={16}/> Atualizar
        </AdminButton>
        {canManage && <AdminButton variant="primary" type="button" onClick={beginNew} disabled={saving}
          >
          <Plus size={16}/> Nova fila
        </AdminButton>}
      </div>
    </section>

    {error && <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
    {live.error && <p role="status" className="text-xs text-muted-foreground">{live.error}</p>}
    {live.controlError && <p role="status" className="text-xs text-muted-foreground">{live.controlError}</p>}
    {notice && <p role="status" className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}

    {formOpen && canManage && <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">{form.id?"Editar fila":"Nova fila"}</h2>
        <AdminButton variant="ghost" type="button" onClick={()=>setFormOpen(false)} disabled={saving} aria-label="Fechar"
          ><X size={17}/></AdminButton>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs font-semibold text-foreground">Nome da fila *
          <FInput value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
            maxLength={80} placeholder="Atendimento geral" />
        </label>
        <label className="space-y-1 text-xs font-semibold text-foreground">Número interno de teste *
          <FInput value={form.testExtension} type="number" min={850} max={899}
            onChange={e=>setForm(f=>({...f,testExtension:e.target.value}))}
            />
        </label>
        <label className="space-y-1 text-xs font-semibold text-foreground">Distribuição *
          <AdminSelect value={form.strategy} onValueChange={strategy=>setForm(f=>({...f,strategy:strategy as PbxQueue['strategy']}))}
            ariaLabel="Distribuição da fila" options={Object.entries(strategyLabels).map(([value,label])=>({value,label}))} />
        </label>
        <label className="space-y-1 text-xs font-semibold text-foreground">Toque por tentativa (10–40 s)
          <FInput type="number" min={10} max={40} value={form.ringSeconds}
            onChange={e=>setForm(f=>({...f,ringSeconds:e.target.value}))}
            />
        </label>
        <label className="space-y-1 text-xs font-semibold text-foreground">Espera máxima (30–300 s)
          <FInput type="number" min={30} max={300} value={form.maxWaitSeconds}
            onChange={e=>setForm(f=>({...f,maxWaitSeconds:e.target.value}))}
            />
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
        <AdminButton variant="secondary" type="button" onClick={()=>setFormOpen(false)} disabled={saving}
          >Cancelar</AdminButton>
        <AdminButton variant="primary" type="button" onClick={()=>void save(form)} disabled={saving}
          >
          {saving?<LoaderCircle size={16} className="animate-spin"/>:<Save size={16}/>} Salvar fila
        </AdminButton>
      </div>
    </section>}

    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Filas cadastradas</h2>
        <p className="mt-1 text-xs text-muted-foreground">{queues.length} filas · Atualização manual, sem consultas contínuas</p>
      </div>
      {loading?<AdminWorkspaceSkeleton variant="cards" rows={3} />:queues.length===0?<AdminSectionEmpty>Nenhuma fila cadastrada ainda.</AdminSectionEmpty>:
        <div className="divide-y divide-border">
          {queues.map(queue=>{
            const assigned=memberByQueue.get(queue.id)||[];
            return <div key={queue.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
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
                {canManage && queue.enabled && queue.provisioning_status==='applied' && <UnionPbxMemberAvailability queueId={queue.id}
                  members={assigned.map(id=>extensionById.get(id)).filter((item):item is PbxExtension=>Boolean(item)).map(item=>({id:item.id,number:item.number,name:item.display_name}))}
                  controls={live.controls} status={live.items[queue.id]} now={live.now} ready={live.ready} busy={saving}
                  onChange={(extensionId,paused)=>setMemberPaused(queue.id,extensionId,paused)} />}
              </div>
              {canManage && <div className="flex flex-wrap items-center gap-2">
                <AdminButton variant="secondary" size="sm" type="button" onClick={()=>beginEdit(queue)} disabled={saving}
                  >
                  <Pencil size={14}/> Editar
                </AdminButton>
                <AdminButton variant="secondary" size="sm" type="button" onClick={()=>void changeEnabled(queue)} disabled={saving}
                  >
                  {queue.enabled?"Desativar":"Ativar"}
                </AdminButton>
                {queue.provisioning_status==="failed" && <AdminButton variant="secondary" size="sm" type="button"
                  onClick={()=>void retry(queue)} disabled={saving}
                  >
                  <RefreshCw size={14}/> Repetir
                </AdminButton>}
              </div>}
            </div>;
          })}
        </div>}
    </section>
    <AdminButton variant="ghost" type="button" onClick={onBack} >
      Voltar para o telefone
    </AdminButton>
  </div>;
}
