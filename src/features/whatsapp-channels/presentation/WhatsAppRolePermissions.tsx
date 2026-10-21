import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminCard } from "@/shared/ui/admin/AdminLayout";
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

export function WhatsAppRolePermissions({ onSaved }: { onSaved?: () => void }) {
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
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await operateUnionWhatsAppInbox(
        activeOrganizationId, crypto.randomUUID(), "role_permissions_save", {
          staff_role: profile,
          permissions: rows.map(item => ({ capability: item.key, enabled: draft[profile][item.key] })),
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
      setDraft({ manager: { ...next.manager }, operator: { ...next.operator } });
      setNotice("Permissões do perfil atualizadas com sucesso.");
      onSaved?.();
    } catch (reason) {
      setError(systemErrorMessage(reason, "Não foi possível salvar as permissões."));
    } finally {
      setSaving(false);
    }
  };

  return <div className="space-y-4">
    <div className="space-y-1">
      <p className="text-sm font-semibold text-foreground">Permissões do atendimento</p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Personalize as ações de cada perfil sem alterar os cargos gerais do CRM. O acesso ao módulo
        e outras permissões gerais continuam sendo respeitados.
      </p>
    </div>
    <nav aria-label="Perfil de atendimento" className="flex flex-wrap items-center gap-2">
      {tabs.map(tab => <button key={tab.id} type="button" onClick={() => { setProfile(tab.id); setNotice(""); }}
        aria-current={profile === tab.id ? "page" : undefined}
        className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${profile === tab.id ? "border-primary/35 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted"}`}>
        {tab.label}
        {tab.id !== "both" && changes[tab.id] > 0 &&
          <span className="rounded-full bg-amber-500/15 px-1.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
            {changes[tab.id]}
          </span>}
      </button>)}
    </nav>
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
    {profile !== "both" && !loading && <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        {changes[profile] ? `${changes[profile]} alteração(ões) não salva(s).` : "Nenhuma alteração pendente."}
      </p>
      <div className="flex items-center gap-2">
        <AdminButton variant="secondary" disabled={!changes[profile] || saving}
          onClick={() => setDraft(current => ({ ...current, [profile]: { ...baseline[profile] } }))}>
          Descartar alterações
        </AdminButton>
        <AdminButton disabled={!changes[profile] || saving} loading={saving} onClick={() => void save()}>
          Salvar permissões
        </AdminButton>
      </div>
    </div>}
  </div>;
}
