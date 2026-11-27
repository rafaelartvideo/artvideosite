import { listExtensionCallModes, setExtensionCallMode, callModeLabel, callModeOptions, type CallMode, type CallModePair, type ExtensionCallMode } from "../application/call-modes";
import { FInput, AdminSelect, RequiredFieldLabel } from "@/shared/ui/admin/AdminFormControls";
import { pbxRequest, pbxOperationError } from "../application/pbx-request";
import { useEffect, useRef, useMemo, useState } from "react";
import { Check, LoaderCircle, Pencil, Phone, Plus, RefreshCw, Save, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { PageHeader, AdminButton, AdminSectionEmpty } from "@/shared/ui/admin/AdminLayout";
import { AdminWorkspaceSkeleton } from "@/shared/ui/admin/AdminWorkspaceSkeleton";
import { UnionPbxAgentPanel } from "./UnionPbxAgentPanel";

type Extension = {
  id: string;
  organization_id: string;
  number: number;
  display_name: string;
  employee_id: string | null;
  endpoint_name: string;
  desired_enabled: boolean;
  provisioning_status: "manual" | "pending" | "applied" | "failed";
  is_managed: boolean;
  updated_at: string;
};
type OutboundGroup={id:string;name:string;enabled:boolean;strategy:'priority'|'round_robin'|'failover';extension_ids:string[];members:{connection_id:string;trunk_id:string;priority:number}[]};
type GroupSettings={revision:number;status:string;active:boolean;hot_ready:boolean;default_group_id:string|null;groups:OutboundGroup[];pending_assignments:{extension_id:string;group_id:string}[]};
type EmployeeOption = { id: string; full_name: string; is_active: boolean };
type ExtensionForm = { number: string; display_name: string; employee_id: string; desired_enabled: boolean };
const emptyForm: ExtensionForm = { number: "", display_name: "", employee_id: "", desired_enabled: true };

function statusText(extension: Extension) {
  if (extension.provisioning_status === "manual") return "Configurado manualmente na VPS";
  if (extension.provisioning_status === "failed") return "Falha no provisionamento";
  if (extension.provisioning_status === "pending") return "Aguardando ativação na VPS";
  return extension.desired_enabled ? "Configuração aplicada" : "Desativação aplicada";
}


export function UnionPbxExtensionsPage({ onBack }: { onBack: () => void }) {
  const { activeOrganizationId, hasPermission, organizations } = useAuth();
  const requestScope = useRef(new AbortController());
  useEffect(() => {
    const scope = new AbortController(); requestScope.current = scope;
    return () => scope.abort();
  }, [activeOrganizationId]);
  const isPlatformOperatorOrganization = organizations.find(item => item.organization_id === activeOrganizationId)?.is_platform_operator === true;
  const canManage = hasPermission("pbx.manage");
  const [callModes, setCallModes] = useState<ExtensionCallMode[]>([]);
  const [modeDrafts, setModeDrafts] = useState<Record<string, CallModePair>>({});
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ExtensionForm>(emptyForm);
  const [reloadKey, setReloadKey] = useState(0);
  const [groupSettings,setGroupSettings]=useState<GroupSettings|null>(null);
  const [newGroup,setNewGroup]=useState('');
  const [groupDrafts,setGroupDrafts]=useState<Record<string,string[]>>({});
  const [strategyDrafts,setStrategyDrafts]=useState<Record<string,OutboundGroup>>({});
  const [groupError,setGroupError]=useState('');
  const [queueSettings,setQueueSettings]=useState<{id:string;name:string;status:string;extension_ids:string[]}[]>([]);
  const [queueDrafts,setQueueDrafts]=useState<Record<string,string[]>>({});
  const [queueError,setQueueError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();setQueueSettings([]);setQueueDrafts({});setQueueError('');
    if(canManage&&activeOrganizationId)void pbxRequest(signal=>supabase.rpc('pbx_extension_queue_settings',{p_org:activeOrganizationId}).abortSignal(signal),'Filas do ramal',{signal:controller.signal}).then(result=>{if(controller.signal.aborted)return;if(result.error||!Array.isArray(result.data))throw new Error('Filas indisponíveis.');setQueueSettings(result.data);}).catch(()=>{if(!controller.signal.aborted)setQueueError('Não foi possível consultar as filas. Atualize os dados.');});
    return()=>controller.abort();
  },[activeOrganizationId,canManage,reloadKey]);
  function extensionQueues(id:string){return queueSettings.filter(q=>q.extension_ids.includes(id)).map(q=>q.id);}
  async function saveQueues(item:Extension){
    if(!activeOrganizationId||!canManage||saving||!queueDrafts[item.id])return;
    const signal=requestScope.current.signal;setSaving(true);setError('');setMessage('');
    try{
      const result=await pbxRequest(abort=>supabase.rpc('pbx_set_extension_queues',{p_org:activeOrganizationId,p_extension:item.id,p_expected:extensionQueues(item.id),p_selected:queueDrafts[item.id]}).abortSignal(abort),'Filas do ramal',{signal});
      if(result.error)throw new Error('Não foi possível alterar as filas. Confira os participantes e atualize a lista.');
      if(!signal.aborted)setMessage('Filas atualizadas. A central aplicará a alteração no próximo ciclo seguro.');
    }catch(error){if(!signal.aborted)setError(error instanceof Error?error.message:'Filas indisponíveis.');}
    finally{if(!signal.aborted){setSaving(false);setReloadKey(key=>key+1);}}
  }
  const [defaultDraft,setDefaultDraft]=useState('');
  const editableGroups=groupSettings?.groups.filter(g=>g.enabled)??[];
  const canEditGroups=!!groupSettings&&groupSettings.status==='applied'&&(!groupSettings.active||groupSettings.hot_ready);
  async function loadGroups(org:string,signal:AbortSignal){
    const result=await pbxRequest(abort=>supabase.rpc('pbx_outbound_group_settings',{p_org:org}).abortSignal(abort),'Grupos de saída',{signal});
    if(result.error)throw new Error('Não foi possível consultar os grupos de saída.');
    const value=result.data as unknown as GroupSettings;
    if(!value||!Array.isArray(value.groups)||!Array.isArray(value.pending_assignments))throw new Error('Grupos indisponíveis.');
    return value;
  }
  useEffect(()=>{
    const controller=new AbortController();setGroupSettings(null);setGroupDrafts({});setStrategyDrafts({});setGroupError('');
    if(canManage&&activeOrganizationId)void loadGroups(activeOrganizationId,controller.signal).then(value=>{if(!controller.signal.aborted){setGroupSettings(value);setDefaultDraft(value.default_group_id||'');}}).catch(()=>{if(!controller.signal.aborted)setGroupError('Não foi possível consultar os grupos de saída. Atualize os dados.');});
    return()=>controller.abort();
  },[activeOrganizationId,canManage,reloadKey]);
  function memberGroups(id:string){return groupSettings?.groups.filter(g=>g.extension_ids.includes(id)).map(g=>g.id)??[];}
  async function saveGroups(groups:OutboundGroup[]){
    if(!activeOrganizationId||!canManage||!canEditGroups||!groupSettings||saving)return;
    const signal=requestScope.current.signal;
    setSaving(true);setError('');setMessage('');
    try{
      const result=await pbxRequest(abort=>supabase.rpc('pbx_save_operational_groups',{p_org:activeOrganizationId,p_revision:groupSettings.revision,p_groups:groups}).abortSignal(abort),'Grupos de saída',{signal});
      if(result.error)throw new Error('Grupo não atualizado. Confira a revisão e a disponibilidade da central.');
      if(!signal.aborted)setMessage('Alteração solicitada. Os troncos continuam ativos; aguarde a confirmação da central.');
    }catch(error){if(!signal.aborted)setError(error instanceof Error?error.message:'Não foi possível salvar os grupos.');}
    finally{if(!signal.aborted){setSaving(false);setReloadKey(key=>key+1);}}
  }
  async function saveDefault(){
    if(!activeOrganizationId||!canManage||saving)return;
    const signal=requestScope.current.signal;setSaving(true);setError('');
    try{
      const result=await pbxRequest(abort=>supabase.rpc('pbx_set_default_outbound_group',{p_org:activeOrganizationId,p_group:defaultDraft||null}).abortSignal(abort),'Grupo padrão',{signal});
      if(result.error)throw new Error('Não foi possível salvar o grupo padrão.');
      if(!signal.aborted)setMessage('Grupo padrão atualizado para novos ramais.');
    }catch(error){if(!signal.aborted)setError(error instanceof Error?error.message:'Grupo padrão indisponível.');}
    finally{if(!signal.aborted){setSaving(false);setReloadKey(key=>key+1);}}
  }

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setCallModes([]); setModeDrafts({}); setSaving(false);
    setLoading(true);
    setError("");
    setExtensions([]);
    setEmployees([]);
    setFormOpen(false);
    setEditingId(null);
    if (!activeOrganizationId) {
      setLoading(false);
      return () => { cancelled = true; };
    }
    void (async () => {
      const [extensionResult, employeeResult, modeResult] = await Promise.all([
        pbxRequest(signal => supabase.from("pbx_extensions")
          .select("id,organization_id,number,display_name,employee_id,endpoint_name,desired_enabled,provisioning_status,is_managed,updated_at")
          .eq("organization_id", activeOrganizationId).order("number").abortSignal(signal), "Consulta PABX", { signal: controller.signal }).catch(pbxOperationError),
        canManage ? pbxRequest(signal => supabase.from("employees").select("id,full_name,is_active")
          .eq("organization_id", activeOrganizationId).eq("is_active", true).order("full_name").limit(300).abortSignal(signal),
          "Consulta PABX", {signal:controller.signal}).catch(pbxOperationError) : Promise.resolve({data:[],error:null}),
        listExtensionCallModes(supabase, activeOrganizationId, {signal:controller.signal})
          .then(data => ({data,error:null})).catch(() => ({data:[],error:true})),
      ]);
      if (cancelled) return;
      if (extensionResult.error) setError("Não foi possível carregar os ramais. Atualize os dados.");
      else setExtensions((extensionResult.data || []) as Extension[]);
      if (employeeResult.error) setError('Não foi possível consultar os funcionários. Atualize antes de editar vínculos.');
      else setEmployees((employeeResult.data || []) as EmployeeOption[]);
      if (modeResult.error) setError('Não foi possível consultar os modos de chamada. Atualize antes de alterar permissões.');
      else setCallModes(modeResult.data);
      setLoading(false);
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [activeOrganizationId, canManage, reloadKey]);

  const employeeNames = useMemo(() => new Map(employees.map(employee => [employee.id, employee.full_name])), [employees]);
  const linkedEmployees = useMemo(() => new Set(extensions.filter(item => item.employee_id && item.id !== editingId).map(item => item.employee_id)), [extensions, editingId]);

  async function saveCallMode(item: ExtensionCallMode) {
    if (!activeOrganizationId || !canManage || !item.can_manage || item.organization_id !== activeOrganizationId || saving) return;
    const organizationId = activeOrganizationId;
    const controller = requestScope.current;
    setSaving(true); setError(""); setMessage("");
    try {
      await setExtensionCallMode(supabase, organizationId, item.extension_id, modeDrafts[item.extension_id] ?? {internal_mode:item.internal_mode,external_mode:item.external_mode}, item.revision, {signal:controller.signal});
      if (!controller.signal.aborted) setMessage("Modo solicitado. O modo em uso permanece até a confirmação da central, sem interromper chamadas.");
    } catch {
      if (!controller.signal.aborted) setError("Alteração sem confirmação ou revisão desatualizada. Lista atualizada; confira o estado antes de salvar novamente.");
    } finally {
      if (!controller.signal.aborted) { setSaving(false); setReloadKey(key => key + 1); }
    }
  }

  function beginNew() {
    setEditingId(null);
    setForm(emptyForm);
    setNewGroup(groupSettings?.default_group_id||'');
    setError("");
    setMessage("");
    setFormOpen(true);
  }
  function beginEdit(item: Extension) {
    setEditingId(item.id);
    setForm({
      number: String(item.number),
      display_name: item.display_name,
      employee_id: item.employee_id ?? "",
      desired_enabled: item.desired_enabled,
    });
    setError("");
    setMessage("");
    setFormOpen(true);
  }
  function cancelForm() {
    if (saving) return;
    setEditingId(null);
    setFormOpen(false);
    setError("");
  }

  async function save() {
    if (!activeOrganizationId || !canManage || saving) return;
    const number = Number(form.number);
    if (!editingId && (!Number.isInteger(number) || number < 100 || number > 9999 || (number >= 850 && number <= 899) || number === 900)) {
      setError("Informe um número de 100 a 9999. Os números de 850 a 899 e 900 são reservados para filas e teste de áudio.");
      return;
    }
    if (form.display_name.trim().length < 2 || form.display_name.trim().length > 80) {
      setError("Informe um nome entre 2 e 80 caracteres.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    const values = {
      display_name: form.display_name.trim(),
      employee_id: form.employee_id || null,
      ...(!editingId ? { number, organization_id: activeOrganizationId } : {}),
    };
    const result = editingId
      ? await pbxRequest(signal => supabase.from("pbx_extensions").update(values).eq("id", editingId).eq("organization_id", activeOrganizationId).abortSignal(signal), "Alteração PABX", { signal: requestScope.current.signal }).catch(pbxOperationError)
      : await pbxRequest(signal => supabase.rpc('pbx_create_extension_with_group',{p_org:activeOrganizationId,p_number:number,p_name:values.display_name,p_employee:values.employee_id,p_group:newGroup||null}).abortSignal(signal), "Alteração PABX", { signal: requestScope.current.signal }).catch(pbxOperationError);
    setSaving(false);
    if (result.error) {
      setError(result.error.code === "23505" ? "Esse número ou funcionário já está vinculado a outro ramal." : result.error.message);
      return;
    }
    setFormOpen(false);
    setEditingId(null);
    setMessage(editingId ? "Cadastro atualizado." : "Ramal cadastrado. Aguardando provisionamento na VPS.");
    setReloadKey(key => key + 1);
  }

  async function retry(item: Extension) {
    if (!activeOrganizationId || !canManage || saving || item.provisioning_status !== "failed") return;
    setSaving(true);
    setError("");
    const result = await pbxRequest(signal => supabase.rpc("pbx_retry_extension", {
      p_organization_id: activeOrganizationId,
      p_extension_id: item.id,
    }).abortSignal(signal), "Alteração PABX", { signal: requestScope.current.signal }).catch(pbxOperationError);
    setSaving(false);
    if (result.error) setError(result.error.message);
    else {
      setMessage("Nova tentativa solicitada. A VPS receberá a pendência automaticamente.");
      setReloadKey(key => key + 1);
    }
  }

  async function toggle(item: Extension) {
    if (!activeOrganizationId || !canManage || saving || !item.is_managed) return;
    const label = item.desired_enabled ? "desativar" : "ativar";
    if (!window.confirm("Deseja " + label + " o ramal " + item.number + "? A alteração será solicitada à VPS.")) return;
    setSaving(true);
    setError("");
    const result = await pbxRequest(signal => supabase.from("pbx_extensions")
      .update({ desired_enabled: !item.desired_enabled })
      .eq("id", item.id)
      .eq("organization_id", activeOrganizationId).abortSignal(signal), "Alteração PABX", { signal: requestScope.current.signal }).catch(pbxOperationError);
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setMessage("Alteração registrada. Aguardando aplicação na VPS.");
    setReloadKey(key => key + 1);
  }

  return <div className="min-w-0 space-y-5">
    <PageHeader title="Ramais" subtitle="Cadastre os ramais e escolha os funcionários que vão utilizá-los." />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">{loading ? "Carregando ramais…" : `${extensions.length} ${extensions.length === 1 ? "ramal cadastrado" : "ramais cadastrados"}`}</p>
      <div className="flex gap-2">
        <AdminButton variant="secondary" type="button" onClick={() => setReloadKey(key => key + 1)} aria-label="Atualizar ramais" title="Atualizar" >
          <RefreshCw size={16} /> Atualizar
        </AdminButton>
        {canManage && <AdminButton variant="primary" type="button" onClick={beginNew} disabled={saving} >
          <Plus size={16} /> Novo ramal
        </AdminButton>}
      </div>
    </div>


    {error && <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
    {message && <p role="status" className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">{message}</p>}

    {canManage&&queueError&&<p className="text-sm text-destructive">{queueError}</p>}
    {canManage&&groupError&&<p className="text-sm text-destructive">{groupError}</p>}
    {canManage&&groupSettings&&groupSettings.groups.length>0&&<section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div><h2 className="font-semibold">Grupos de saída</h2><p className="text-xs text-muted-foreground">Gerencie os ramais e a distribuição sem desativar as linhas SIP. Alterações técnicas permanecem em Troncos SIP.</p></div>
      {groupSettings.active&&!groupSettings.hot_ready&&<p className="text-sm text-muted-foreground">A atualização do agente da central é necessária para editar grupos com as rotas ativas.</p>}
      {groupSettings.status!=='applied'&&<p className="text-sm text-muted-foreground">Aguardando confirmação da configuração atual. Atualize para conferir.</p>}
      <div className="flex flex-wrap items-end gap-2"><label className="min-w-52 flex-1 space-y-1 text-sm"><span>Grupo padrão para novos ramais</span><AdminSelect ariaLabel="Grupo padrão" value={defaultDraft} onValueChange={setDefaultDraft} options={[{value:'',label:'Sem grupo padrão'},...editableGroups.map(g=>({value:g.id,label:g.name}))]}/></label><AdminButton type="button" variant="secondary" disabled={saving||defaultDraft===(groupSettings.default_group_id||'')} onClick={()=>void saveDefault()}>Salvar padrão</AdminButton></div>
      {editableGroups.map(group=>{const draft=strategyDrafts[group.id]||group;return <details key={group.id} className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm font-medium">{group.name} · {group.extension_ids.length} ramal(is)</summary><div className="mt-3 space-y-3">
       <label className="block text-sm">Distribuição<AdminSelect ariaLabel="Estratégia de saída" value={draft.strategy} disabled={saving||!canEditGroups} onValueChange={value=>setStrategyDrafts(current=>({...current,[group.id]:{...draft,strategy:value as OutboundGroup['strategy']}}))} options={[{value:'priority',label:'Prioridade'},{value:'round_robin',label:'Rodízio'},{value:'failover',label:'Contingência'}]}/></label>
       {draft.members.map(member=><label key={member.connection_id} className="flex items-center gap-3 text-sm"><span className="flex-1">Linha {group.members.findIndex(m=>m.connection_id===member.connection_id)+1} — prioridade</span><div className="w-24"><FInput type="number" min={1} max={9999} value={member.priority} disabled={saving||!canEditGroups} onChange={event=>setStrategyDrafts(current=>({...current,[group.id]:{...draft,members:draft.members.map(m=>m.connection_id===member.connection_id?{...m,priority:Number(event.target.value)}:m)}}))}/></div></label>)}
       <AdminButton type="button" variant="secondary" disabled={saving||!canEditGroups||!strategyDrafts[group.id]||draft.members.some(m=>!Number.isInteger(m.priority)||m.priority<1||m.priority>9999)} onClick={()=>void saveGroups(groupSettings.groups.map(g=>g.id===group.id?draft:g))}>Salvar distribuição</AdminButton>
      </div></details>;})}
    </section>}
    {formOpen && canManage && <section className="rounded-xl border border-border bg-card p-4 sm:p-5" aria-label={editingId ? "Editar ramal" : "Cadastrar ramal"}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-foreground">{editingId ? "Editar ramal" : "Novo ramal"}</h2>
        <AdminButton variant="ghost" type="button" onClick={cancelForm} disabled={saving} aria-label="Fechar formulário" ><X size={17} /></AdminButton>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs font-semibold text-foreground"><RequiredFieldLabel label="Número" required/>
          <FInput  type="number" min={100} max={9999} disabled={Boolean(editingId)} value={form.number} onChange={event => setForm(current => ({...current, number:event.target.value}))} />
        </label>
        <label className="space-y-1 text-xs font-semibold text-foreground"><RequiredFieldLabel label="Nome do ramal" required/>
          <FInput  maxLength={80} value={form.display_name} onChange={event => setForm(current => ({...current, display_name:event.target.value}))} placeholder="Recepção" />
        </label>
        <label className="space-y-1 text-xs font-semibold text-foreground">Funcionário vinculado
          <AdminSelect value={form.employee_id} onValueChange={employee_id => setForm(current => ({...current,employee_id}))}
            ariaLabel="Funcionário vinculado" options={[{value:'',label:'Sem vínculo'},
              ...employees.filter(employee => !linkedEmployees.has(employee.id)).map(employee => ({value:employee.id,label:employee.full_name}))]} />
        </label>
      </div>
      {!editingId&&groupSettings&&editableGroups.length>0&&<div className="mt-4 space-y-1"><label className="block text-sm font-medium">Grupo de saída</label><AdminSelect ariaLabel="Grupo de saída do novo ramal" value={newGroup} onValueChange={setNewGroup} options={[{value:'',label:'Sem autorização de saída externa'},...editableGroups.map(g=>({value:g.id,label:g.name+(g.id===groupSettings.default_group_id?' (padrão)':'')}))]}/><p className="text-xs text-muted-foreground">O vínculo será aplicado automaticamente após o provisionamento do ramal e a confirmação da central.</p></div>}
      <p className="mt-3 text-xs text-muted-foreground">Para preservar a configuração atual, o número não pode ser alterado depois do cadastro. Desative o ramal e crie outro se precisar mudar a numeração.</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <AdminButton variant="secondary" type="button" disabled={saving} onClick={cancelForm} >Cancelar</AdminButton>
        <AdminButton variant="primary" type="button" disabled={saving} onClick={() => void save()} >
          {saving ? <LoaderCircle className="animate-spin" size={16}/> : <Save size={16}/>} Salvar
        </AdminButton>
      </div>
    </section>}

    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Ramais cadastrados</h2>
        <p className="mt-1 text-xs text-muted-foreground">{extensions.length} {extensions.length === 1 ? "ramal" : "ramais"} nesta empresa</p>
      </div>
      {loading ? <AdminWorkspaceSkeleton variant="cards" rows={3} />
      : extensions.length === 0 ? <AdminSectionEmpty>Nenhum ramal cadastrado nesta empresa.</AdminSectionEmpty>
      : <div className="divide-y divide-border">
          {extensions.map(item => <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Phone size={18} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{item.number} · {item.display_name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.employee_id ? employeeNames.get(item.employee_id) || "Funcionário vinculado" : "Sem funcionário vinculado"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{statusText(item)}{item.desired_enabled ? "" : " · desativação solicitada"}</p>
            </div>
            {(() => {
              const policy = callModes.find(mode => mode.extension_id === item.id && mode.organization_id === activeOrganizationId);
              return <div className="w-full space-y-2 rounded-lg border border-border bg-muted/20 p-3 sm:order-last" aria-label={`Modo de chamada do ramal ${item.number}`}>
                <p className="text-xs font-semibold">Permissões de chamada</p>
                {policy ? <>
                  <p className="text-xs text-muted-foreground">{policy.status === "pending" ? "Aguardando a central" : policy.status === "failed" ? "Falha na aplicação" : "Aplicado"}</p>
                  {policy.last_error && <p role="status" className="text-xs text-destructive">{policy.last_error}</p>}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(["internal", "external"] as const).map(scope => {
                      const field = `${scope}_mode` as const;
                      const label = scope === "internal" ? "Chamadas internas" : "Chamadas externas";
                      return <div key={scope} className="space-y-1">
                        <p className="text-xs font-semibold">{label}</p>
                        <p className="text-xs text-muted-foreground">Em uso: {callModeLabel(policy[`applied_${scope}_mode`])} · Solicitado: {callModeLabel(policy[field])}</p>
                        {canManage && policy.can_manage && <AdminSelect ariaLabel={`${label} do ramal ${item.number}`}
                          value={modeDrafts[item.id]?.[field] ?? policy[field]} options={callModeOptions} disabled={saving}
                          onValueChange={value => setModeDrafts(current => ({...current,[item.id]:{internal_mode:policy.internal_mode,external_mode:policy.external_mode,...current[item.id],[field]:value as CallMode}}))} />}
                      </div>;
                    })}
                  </div>
                  {canManage && policy.can_manage ? <AdminButton variant="secondary" size="sm" type="button"
                    disabled={saving || (policy.status !== "failed" && (modeDrafts[item.id]?.internal_mode ?? policy.internal_mode) === policy.internal_mode && (modeDrafts[item.id]?.external_mode ?? policy.external_mode) === policy.external_mode)}
                    onClick={() => void saveCallMode(policy)}><Save size={14}/> {policy.status === "failed" ? "Tentar novamente" : "Salvar modos"}</AdminButton>
                    : <p className="text-xs text-muted-foreground">{policy.can_manage ? "Consulta de permissões do ramal." : "O controle ficará disponível quando o ramal e o agente estiverem preparados."}</p>}
                </> : <p className="text-xs text-muted-foreground">Modo sem confirmação. Atualize a lista para consultar.</p>}
                {canManage&&groupSettings&&editableGroups.length>0&&<div className="border-t border-border pt-3 space-y-2">
                  <p className="text-xs font-semibold">Grupos de saída autorizados</p>
                  {groupSettings.pending_assignments.some(p=>p.extension_id===item.id)&&<p className="text-xs text-muted-foreground">Vínculo solicitado no cadastro; aguardando provisionamento.</p>}
                  {editableGroups.map(group=>{const chosen=groupDrafts[item.id]||memberGroups(item.id);return <label key={group.id} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={chosen.includes(group.id)} disabled={saving||!canEditGroups||!item.desired_enabled||!['applied','manual'].includes(item.provisioning_status)||groupSettings.pending_assignments.some(p=>p.extension_id===item.id)} onChange={event=>setGroupDrafts(current=>({...current,[item.id]:event.target.checked?[...chosen,group.id]:chosen.filter(id=>id!==group.id)}))}/>{group.name}</label>;})}
                  <AdminButton type="button" variant="secondary" size="sm" disabled={saving||!canEditGroups||!groupDrafts[item.id]||groupSettings.pending_assignments.some(p=>p.extension_id===item.id)} onClick={()=>void saveGroups(groupSettings.groups.map(group=>!group.enabled?group:{...group,extension_ids:[...group.extension_ids.filter(id=>id!==item.id),...(groupDrafts[item.id].includes(group.id)?[item.id]:[])]}))}>Salvar grupos</AdminButton>
                </div>}
                {canManage&&queueSettings.length>0&&<div className="border-t border-border pt-3 space-y-2">
                  <p className="text-xs font-semibold">Filas de atendimento</p>
                  {queueSettings.map(queue=>{const chosen=queueDrafts[item.id]||extensionQueues(item.id);return <label key={queue.id} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={chosen.includes(queue.id)} disabled={saving||!item.desired_enabled||!['applied','manual'].includes(item.provisioning_status)} onChange={event=>setQueueDrafts(current=>({...current,[item.id]:event.target.checked?[...chosen,queue.id]:chosen.filter(id=>id!==queue.id)}))}/>{queue.name}{queue.status==='pending'?' · Aguardando central':''}</label>;})}
                  <AdminButton type="button" variant="secondary" size="sm" disabled={saving||!queueDrafts[item.id]} onClick={()=>void saveQueues(item)}>Salvar filas</AdminButton>
                </div>}
              </div>;
            })()}
            {canManage && <div className="flex items-center gap-2">
              <AdminButton variant="secondary" size="sm" type="button" onClick={() => beginEdit(item)} disabled={saving}  title="Editar ramal">
                <Pencil size={14} /> Editar
              </AdminButton>
              {item.is_managed && item.provisioning_status === "failed" &&
                <AdminButton variant="secondary" size="sm" type="button" onClick={() => void retry(item)} disabled={saving} >
                  <RefreshCw size={14} /> Tentar novamente
                </AdminButton>}
              {item.is_managed
                ? <AdminButton variant="secondary" size="sm" type="button" onClick={() => void toggle(item)} disabled={saving} >
                    {item.desired_enabled ? <X size={14}/> : <Check size={14}/>} {item.desired_enabled ? "Desativar" : "Ativar"}
                  </AdminButton>
                : <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">Legado protegido</span>}
            </div>}
          </div>)}
        </div>}
    </section>
    {canManage && activeOrganizationId && <UnionPbxAgentPanel organizationId={activeOrganizationId} legacyProfile={isPlatformOperatorOrganization} />}
    <p className="text-xs text-muted-foreground">{isPlatformOperatorOrganization ? "O ramal 301 existente permanece protegido." : null}</p>
    <AdminButton variant="ghost" type="button" onClick={onBack} >Voltar para o telefone</AdminButton>
  </div>;
}
