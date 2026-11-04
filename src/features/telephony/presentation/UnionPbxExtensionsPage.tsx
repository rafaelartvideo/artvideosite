import { useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, Pencil, Phone, Plus, RefreshCw, Save, ShieldCheck, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/shared/ui/admin/AdminLayout";

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

const inputClass = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60";

export function UnionPbxExtensionsPage({ onBack }: { onBack: () => void }) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canManage = hasPermission("pbx.manage");
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
      const result = await supabase.from("pbx_extensions")
        .select("id,organization_id,number,display_name,employee_id,endpoint_name,desired_enabled,provisioning_status,is_managed,updated_at")
        .eq("organization_id", activeOrganizationId).order("number");
      if (cancelled) return;
      if (result.error) setError("Não foi possível carregar os ramais. " + result.error.message);
      else setExtensions((result.data || []) as Extension[]);
      setLoading(false);
    })();
    if (canManage) {
      void (async () => {
        const result = await supabase.from("employees")
          .select("id,full_name,is_active")
          .eq("organization_id", activeOrganizationId)
          .eq("is_active", true)
          .order("full_name")
          .limit(300);
        if (!cancelled && !result.error) setEmployees((result.data || []) as EmployeeOption[]);
      })();
    }
    return () => { cancelled = true; };
  }, [activeOrganizationId, canManage, reloadKey]);

  const employeeNames = useMemo(() => new Map(employees.map(employee => [employee.id, employee.full_name])), [employees]);
  const linkedEmployees = useMemo(() => new Set(extensions.filter(item => item.employee_id && item.id !== editingId).map(item => item.employee_id)), [extensions, editingId]);

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
    if (!editingId && (!Number.isInteger(number) || number < 100 || number > 9999)) {
      setError("Informe um número de ramal de 100 a 9999.");
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
      ? await supabase.from("pbx_extensions").update(values).eq("id", editingId).eq("organization_id", activeOrganizationId)
      : await supabase.from("pbx_extensions").insert(values);
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

  async function toggle(item: Extension) {
    if (!activeOrganizationId || !canManage || saving || !item.is_managed) return;
    const label = item.desired_enabled ? "desativar" : "ativar";
    if (!window.confirm("Deseja " + label + " o ramal " + item.number + "? A alteração será solicitada à VPS.")) return;
    setSaving(true);
    setError("");
    const result = await supabase.from("pbx_extensions")
      .update({ desired_enabled: !item.desired_enabled })
      .eq("id", item.id)
      .eq("organization_id", activeOrganizationId);
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
            O ramal 301 existente continuará funcionando sem alterações. Os novos ramais são apenas cadastrados;
            a ativação no Asterisk depende da instalação da ponte de provisionamento na VPS.
            Nenhuma senha SIP nem credencial da FVX é armazenada nesta tela.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => setReloadKey(key => key + 1)} aria-label="Atualizar ramais" title="Atualizar" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-foreground">
          <RefreshCw size={16} /> Atualizar
        </button>
        {canManage && <button type="button" onClick={beginNew} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0057e7] px-4 text-sm font-semibold text-white disabled:opacity-50">
          <Plus size={16} /> Novo ramal
        </button>}
      </div>
    </div>

    {error && <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
    {message && <p role="status" className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">{message}</p>}

    {formOpen && canManage && <section className="rounded-xl border border-border bg-card p-4 sm:p-5" aria-label={editingId ? "Editar ramal" : "Cadastrar ramal"}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-foreground">{editingId ? "Editar ramal" : "Novo ramal"}</h2>
        <button type="button" onClick={cancelForm} disabled={saving} aria-label="Fechar formulário" className="rounded-md p-2 text-muted-foreground hover:bg-muted"><X size={17} /></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs font-semibold text-foreground">Número *
          <input className={inputClass} type="number" min={100} max={9999} disabled={Boolean(editingId)} value={form.number} onChange={event => setForm(current => ({...current, number:event.target.value}))} />
        </label>
        <label className="space-y-1 text-xs font-semibold text-foreground">Nome do ramal *
          <input className={inputClass} maxLength={80} value={form.display_name} onChange={event => setForm(current => ({...current, display_name:event.target.value}))} placeholder="Recepção" />
        </label>
        <label className="space-y-1 text-xs font-semibold text-foreground">Funcionário vinculado
          <select className={inputClass} value={form.employee_id} onChange={event => setForm(current => ({...current,employee_id:event.target.value}))}>
            <option value="">Sem vínculo</option>
            {employees.filter(employee => !linkedEmployees.has(employee.id)).map(employee => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
          </select>
        </label>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Para preservar a configuração atual, o número não pode ser alterado depois do cadastro. Desative o ramal e crie outro se precisar mudar a numeração.</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" disabled={saving} onClick={cancelForm} className="h-10 rounded-lg border border-border px-4 text-sm font-semibold text-foreground">Cancelar</button>
        <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0057e7] px-4 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? <LoaderCircle className="animate-spin" size={16}/> : <Save size={16}/>} Salvar
        </button>
      </div>
    </section>}

    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Ramais cadastrados</h2>
        <p className="mt-1 text-xs text-muted-foreground">{extensions.length} registros nesta empresa · atualização manual sem consultas repetidas</p>
      </div>
      {loading ? <div className="flex items-center justify-center gap-2 p-9 text-sm text-muted-foreground"><LoaderCircle className="animate-spin" size={18}/> Carregando ramais</div>
      : extensions.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">Nenhum ramal cadastrado nesta empresa.</p>
      : <div className="divide-y divide-border">
          {extensions.map(item => <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0057e7]/10 text-[#0057e7]"><Phone size={18} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{item.number} · {item.display_name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.employee_id ? employeeNames.get(item.employee_id) || "Funcionário vinculado" : "Sem funcionário vinculado"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{statusText(item)}{item.desired_enabled ? "" : " · desativação solicitada"}</p>
            </div>
            {canManage && <div className="flex items-center gap-2">
              <button type="button" onClick={() => beginEdit(item)} disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground" title="Editar ramal">
                <Pencil size={14} /> Editar
              </button>
              {item.is_managed
                ? <button type="button" onClick={() => void toggle(item)} disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground">
                    {item.desired_enabled ? <X size={14}/> : <Check size={14}/>} {item.desired_enabled ? "Desativar" : "Ativar"}
                  </button>
                : <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">Legado protegido</span>}
            </div>}
          </div>)}
        </div>}
    </section>
    <button type="button" onClick={onBack} className="text-sm font-semibold text-primary hover:underline">Voltar para o telefone</button>
  </div>;
}
