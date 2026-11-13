import { listExtensionCallModes, setExtensionCallMode, callModeLabel, callModeOptions, type CallMode, type ExtensionCallMode } from "../application/call-modes";
import { FInput, AdminSelect, RequiredFieldLabel } from "@/shared/ui/admin/AdminFormControls";
import { pbxRequest, pbxOperationError } from "../application/pbx-request";
import { useEffect, useRef, useMemo, useState } from "react";
import { Check, LoaderCircle, Pencil, Phone, Plus, RefreshCw, Save, ShieldCheck, X } from "lucide-react";
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
  const [modeDrafts, setModeDrafts] = useState<Record<string, CallMode>>({});
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
      await setExtensionCallMode(supabase, organizationId, item.extension_id, modeDrafts[item.extension_id] ?? item.mode, item.revision, {signal:controller.signal});
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
      : await pbxRequest(signal => supabase.from("pbx_extensions").insert(values).abortSignal(signal), "Alteração PABX", { signal: requestScope.current.signal }).catch(pbxOperationError);
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
    <PageHeader title="Ramais do PABX Union" subtitle="Cadastre e vincule ramais aos funcionários, com isolamento por empresa." />
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-2.5">
        <ShieldCheck className="mt-0.5 shrink-0 text-primary" size={20} />
        <div>
          <p className="text-sm font-semibold text-foreground">Gerenciamento seguro</p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            {isPlatformOperatorOrganization ? "O ramal 301 existente permanece protegido. " : "Os ramais pertencem somente à sua empresa. "}
            O cadastro e o vínculo ao funcionário podem ser feitos antes da ativação. Acompanhe a confirmação da central na lista.
            Nenhuma senha SIP nem credencial da FVX é armazenada nesta tela.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <AdminButton variant="secondary" type="button" onClick={() => setReloadKey(key => key + 1)} aria-label="Atualizar ramais" title="Atualizar" >
          <RefreshCw size={16} /> Atualizar
        </AdminButton>
        {canManage && <AdminButton variant="primary" type="button" onClick={beginNew} disabled={saving} >
          <Plus size={16} /> Novo ramal
        </AdminButton>}
      </div>
    </div>

    {canManage && activeOrganizationId && <UnionPbxAgentPanel organizationId={activeOrganizationId} legacyProfile={isPlatformOperatorOrganization} />}

    {error && <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
    {message && <p role="status" className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">{message}</p>}

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
        <p className="mt-1 text-xs text-muted-foreground">{extensions.length} registros nesta empresa · atualização manual sem consultas repetidas</p>
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
                <p className="text-xs font-semibold">Chamadas internas e externas</p>
                {policy ? <>
                  <p className="text-xs text-muted-foreground">Em uso: {callModeLabel(policy.applied_mode)} · Solicitado: {callModeLabel(policy.mode)} · {policy.status === "pending" ? "Aguardando a central" : policy.status === "failed" ? "Falha na aplicação" : "Aplicado"}</p>
                  {policy.last_error && <p role="status" className="text-xs text-destructive">{policy.last_error}</p>}
                  {canManage && policy.can_manage ? <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-40"><AdminSelect ariaLabel={`Modo do ramal ${item.number}`} value={modeDrafts[item.id] ?? policy.mode}
                      options={callModeOptions} disabled={saving} onValueChange={value => setModeDrafts(current => ({...current,[item.id]:value as CallMode}))} /></div>
                    <AdminButton variant="secondary" size="sm" type="button" disabled={saving || (policy.status !== "failed" && (modeDrafts[item.id] ?? policy.mode) === policy.mode)}
                      onClick={() => void saveCallMode(policy)}><Save size={14}/> {policy.status === "failed" ? "Tentar novamente" : "Salvar modo"}</AdminButton>
                  </div> : <p className="text-xs text-muted-foreground">{policy.can_manage ? "Consulta de permissões do ramal." : "O controle ficará disponível quando o ramal e o agente estiverem preparados."}</p>}
                </> : <p className="text-xs text-muted-foreground">Modo sem confirmação. Atualize a lista para consultar.</p>}
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
    <AdminButton variant="ghost" type="button" onClick={onBack} >Voltar para o telefone</AdminButton>
  </div>;
}
