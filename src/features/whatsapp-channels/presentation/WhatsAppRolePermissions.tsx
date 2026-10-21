import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminDialog, AdminSegmentedControl } from "@/shared/ui/admin/AdminLayout";
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import { LoadingDots, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { operateUnionWhatsAppInbox } from "../infrastructure/union-whatsapp-inbox.repository";

type Role = "manager" | "operator";
type Profile = Role | "both";
type Permission = {
  key: string;
  label: string;
  category: "Conversas" | "Administração";
  sort_order: number;
  manager: boolean;
  operator: boolean;
};
type Values = Record<Role, Record<string, boolean>>;

const roles: Role[] = ["manager", "operator"];
const categories = ["Conversas", "Administração"] as const;
const emptyValues = (): Values => ({ manager: {}, operator: {} });
const notifyError=(message:string)=>{if(message)notifyAdmin(message,"error");};
const notifySuccess=(message:string)=>{if(message)notifyAdmin(message,"success");};

export function WhatsAppRolePermissions({ onSaved, onClose }: { onSaved?: () => void; onClose?: () => void }) {
  const { activeOrganizationId } = useAuth();
  const [profile, setProfile] = useState<Profile>("operator");
  const [rows, setRows] = useState<Permission[]>([]);
  const [baseline, setBaseline] = useState<Values>(emptyValues);
  const [draft, setDraft] = useState<Values>(emptyValues);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchPermissions = useCallback(async () => {
    if (!activeOrganizationId) return;
    setLoading(true);
    
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
      notifyError(systemErrorMessage(reason, "Não foi possível carregar as permissões dos perfis."));
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId]);

  useEffect(() => { void fetchPermissions(); }, [fetchPermissions]);

  const changes = useMemo(() => ({
    manager: rows.filter(item => draft.manager[item.key] !== baseline.manager[item.key]).length,
    operator: rows.filter(item => draft.operator[item.key] !== baseline.operator[item.key]).length,
  }), [rows, draft, baseline]);
  const pendingCount = changes.manager + changes.operator;

  const toggle = (role: Role, key: string, enabled: boolean) => {
    setDraft(current => ({
      ...current,
      [role]: { ...current[role], [key]: enabled },
    }));
    
  };

  const discard = () => {
    setDraft({
      manager: { ...baseline.manager },
      operator: { ...baseline.operator },
    });
    
    
  };

  const save = async () => {
    if (!activeOrganizationId || saving || !pendingCount) return;
    setSaving(true);
    
    
    const saved: Role[] = [];
    try {
      for (const role of roles) {
        if (!changes[role]) continue;
        const result = await operateUnionWhatsAppInbox(
          activeOrganizationId, crypto.randomUUID(), "role_permissions_save", {
            staff_role: role,
            permissions: rows.map(item => ({ capability: item.key, enabled: draft[role][item.key] })),
          },
        );
        const persisted = Object.fromEntries(
          (result.capability_definitions || []).map(item => [item.key, item[role]]),
        ) as Record<string, boolean>;
        // Cada perfil é salvo separadamente. Se o segundo falhar, o primeiro permanece salvo.
        setBaseline(current => ({ ...current, [role]: { ...persisted } }));
        saved.push(role);
      }
      if (saved.length) {
        notifySuccess("Permissões atualizadas com sucesso.");
        onSaved?.();
      }
    } catch (reason) {
      notifyError(systemErrorMessage(reason, "Não foi possível salvar todas as permissões.") +
        (saved.length ? " As alterações do perfil anterior foram salvas." : ""));
      if (saved.length) onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const selected = (key: string) => profile === "both"
    ? Boolean(draft.manager[key] || draft.operator[key])
    : Boolean(draft[profile][key]);

  const content = <div className="space-y-5">
    <AdminSegmentedControl<Profile>
      value={profile}
      className="grid-cols-3"
      options={[
        {value:"manager",label:"Gestor"},
        {value:"operator",label:"Operador"},
        {value:"both",label:"Gestor + Operador"},
      ]}
      onChange={setProfile}
      disabled={saving || loading}
    />
    {loading ? <div className="flex min-h-36 items-center justify-center" role="status" aria-label="Carregando permissões">
      <LoadingDots/>
    </div> : rows.length ? <div className="divide-y divide-border border-y border-border">
      {categories.map(category => <section key={category} aria-label={category} className="py-4 first:pt-3 last:pb-3">
        <h3 className="mb-3 text-sm font-bold text-foreground">{category}</h3>
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {rows.filter(item => item.category === category).map(item =>
            <button key={item.key} type="button"
              aria-pressed={selected(item.key)}
              disabled={saving || profile === "both"}
              onClick={() => { if(profile !== "both") toggle(profile,item.key,!selected(item.key)); }}
              className="flex min-w-0 items-start gap-2.5 border-b border-border/40 py-3 text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-default disabled:hover:text-inherit">
              <Checkbox checked={selected(item.key)} disabled={saving || profile === "both"}
                tabIndex={-1} aria-hidden="true"
                className="mt-0.5 pointer-events-none"/>
              <span className="min-w-0 flex-1 text-xs font-medium leading-relaxed text-foreground">
                {item.label}
              </span>
            </button>)}
        </div>
      </section>)}
    </div> : <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma permissão cadastrada.</p>}
  </div>;

  const footer = <div className="flex flex-wrap items-center justify-end gap-2">
    {onClose && <AdminButton variant="secondary" disabled={saving} onClick={onClose}>Fechar</AdminButton>}
    <AdminButton variant="secondary" disabled={!pendingCount || saving || loading} onClick={discard}>
      Descartar
    </AdminButton>
    <AdminButton disabled={!pendingCount || saving || loading} loading={saving} onClick={() => void save()}>
      Salvar permissões
    </AdminButton>
  </div>;

  if (onClose) {
    return <AdminDialog open={true} onClose={() => { if (!saving) onClose(); }}
      title="Perfis e Permissões"
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
