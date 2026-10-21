import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminCard, AdminDialog, AdminSegmentedControl } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { operateUnionWhatsAppInbox } from "../infrastructure/union-whatsapp-inbox.repository";

type Role = "manager" | "operator";
type Profile = Role | "both";
type Permission = {
  key: string; label: string; category: "Conversas" | "Administração";
  sort_order: number; manager: boolean; operator: boolean;
};
type Values = Record<Role, Record<string, boolean>>;
const emptyValues = (): Values => ({ manager: {}, operator: {} });
const tabs: { id: Profile; label: string }[] = [
  { id: "manager", label: "Gestor" },
  { id: "operator", label: "Operador" },
  { id: "both", label: "Gestor + Operador" },
];

export function WhatsAppRolePermissions({ onSaved, onClose }: { onSaved?: () => void; onClose?: () => void }) {
  const { activeOrganizationId } = useAuth();
  const [profile, setProfile] = useState<Profile>("operator");
  const [rows, setRows] = useState<Permission[]>([]);
  const [baseline, setBaseline] = useState<Values>(emptyValues);
  const [draft, setDraft] = useState<Values>(emptyValues);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const fetchPermissions = useCallback(async () => {
    if (!activeOrganizationId) return;
    setLoading(true);
    setError("");
    try {
      const result = await operateUnionWhatsAppInbox(
        activeOrganizationId, crypto.randomUUID(), "role_permissions_list",
      );
      const definitions = result.capability_definitions || [];
      const initial = emptyValues();
      for (const item of definitions) {
        initial.manager[item.key] = item.manager;
        initial.operator[item.key] = item.operator;
      }
      setRows(definitions);
      setBaseline(initial);
      setDraft({ manager: { ...initial.manager }, operator: { ...initial.operator } });
    } catch (reason) {
      setError(systemErrorMessage(reason, "Não foi possível carregar as permissões dos perfis."));
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId]);

  useEffect(() => { void fetchPermissions(); }, [fetchPermissions]);

  const changes = useMemo(() => ({
    manager: rows.filter(item => draft.manager[item.key] !== baseline.manager[item.key]).length,
    operator: rows.filter(item => draft.operator[item.key] !== baseline.operator[item.key]).length,
  }), [rows, draft, baseline]);

  const checked = (key: string) =>
    profile === "both"
      ? Boolean(draft.manager[key] || draft.operator[key])
      : Boolean(draft[profile][key]);

  const save = async () => {
    if (!activeOrganizationId || profile === "both" || saving || !changes[profile]) return;
    const role: Role = profile;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await operateUnionWhatsAppInbox(
        activeOrganizationId, crypto.randomUUID(), "role_permissions_save", {
          staff_role: role,
          permissions: rows.map(item => ({ capability: item.key, enabled: draft[role][item.key] })),
        },
      );
      const updated = result.capability_definitions || [];
      const next = emptyValues();
      for (const item of updated) {
        next.manager[item.key] = item.manager;
        next.operator[item.key] = item.operator;
      }
      setRows(updated);
      setBaseline(next);
      setDraft(current => ({
        manager: role === "manager" ? { ...next.manager } : { ...current.manager },
        operator: role === "operator" ? { ...next.operator } : { ...current.operator },
      }));
      setNotice("Permissões do perfil atualizadas com sucesso.");
      onSaved?.();
    } catch (reason) {
      setError(systemErrorMessage(reason, "Não foi possível salvar as permissões."));
    } finally {
      setSaving(false);
    }
  };

  const content = <div className="space-y-4">
    <div className="space-y-1">
      <p className="text-sm font-semibold text-foreground">Permissões do atendimento</p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Personalize as ações de cada perfil sem alterar os cargos gerais do CRM. O acesso ao módulo
        e outras permissões gerais continuam sendo respeitados.
      </p>
    </div>
    <AdminSegmentedControl<Profile>
      className="w-full sm:max-w-2xl"
      value={profile}
      options={tabs.map(tab => ({ value: tab.id, label: tab.label }))}
      onChange={next => { setProfile(next); setNotice(""); }}
      disabled={saving || loading}
    />
    {profile === "both" && <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/25 p-3 text-xs leading-relaxed text-muted-foreground">
      <ShieldCheck size={17} className="mt-0.5 shrink-0"/>
      Este perfil reúne automaticamente todas as permissões habilitadas para Gestor e Operador.
      Para alterar uma delas, selecione o perfil de origem.
    </div>}
    {error && <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-600">
      <CircleAlert size={16} className="mt-0.5 shrink-0"/>{error}
    </p>}
    {notice && <p role="status" className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
      <CheckCircle2 size={16}/>{notice}
    </p>}
    {loading ? <LoadingState text="Carregando permissões dos perfis..."/> :
      rows.length ? <AdminCard square>
        {(["Conversas","Administração"] as const).map(category => <div key={category}>
          <div className="border-b border-border bg-muted/25 px-4 py-3 text-sm font-bold text-foreground">{category}</div>
          {rows.filter(item => item.category === category).map(item =>
            <label key={item.key} className={`flex min-h-12 items-center justify-between gap-4 border-b border-border/70 px-4 py-3 last:border-b-0 ${profile === "both" ? "cursor-default" : "cursor-pointer hover:bg-muted/20"}`}>
              <span className="min-w-0 text-sm font-medium text-foreground">{item.label}</span>
              <input type="checkbox" checked={checked(item.key)} disabled={profile === "both" || saving}
                onChange={event => {
                  if (profile === "both") return;
                  const role = profile;
                  setDraft(current => ({
                    ...current,
                    [role]: { ...current[role], [item.key]: event.target.checked },
                  }));
                  setNotice("");
                }}
                aria-label={`${item.label} — ${tabs.find(tab=>tab.id===profile)?.label}`}
                className="h-4 w-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-60"/>
            </label>)}
        </div>)}
      </AdminCard> : !error && <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma permissão cadastrada.</p>}
  </div>;

  const footer =
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        {loading ? "Carregando permissões..." : profile === "both" ? "Permissões combinadas, somente leitura." :
          changes[profile] ? `${changes[profile]} alteração(ões) não salva(s).` : "Nenhuma alteração pendente."}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        {onClose && <AdminButton variant="secondary" disabled={saving} onClick={onClose}>Fechar</AdminButton>}
        {profile !== "both" && !loading && <>
          <AdminButton variant="secondary" disabled={!changes[profile] || saving}
            onClick={() => setDraft(current => ({ ...current, [profile]: { ...baseline[profile] } }))}>
            Descartar
          </AdminButton>
          <AdminButton disabled={!changes[profile] || saving} loading={saving} onClick={() => void save()}>
            Salvar permissões
          </AdminButton>
        </>}
      </div>
    </div>;

  if (onClose) {
    return <AdminDialog open={true} onClose={() => { if (!saving) onClose(); }}
      title="Perfis e Permissões"
      description="Controle as ações autorizadas para Gestor, Operador e Gestor + Operador."
      className="w-full max-w-4xl"
      bodyClassName="min-h-0"
      footer={footer}>
      {content}
    </AdminDialog>;
  }

  return <div className="space-y-4">
    {content}
    <div className="border-t border-border bg-card px-4 py-4">{footer}</div>
  </div>;
}
