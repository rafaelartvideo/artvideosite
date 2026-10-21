import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminCard, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { operateUnionWhatsAppInbox } from "../infrastructure/union-whatsapp-inbox.repository";

type Role = "manager" | "operator";
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

  const content = <div className="space-y-3">
    {loading ? <LoadingState text="Carregando permissões dos perfis..."/> :
      rows.length ? <AdminCard square>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] table-fixed text-sm">
            <colgroup>
              <col className="w-[46%]"/>
              <col className="w-[17%]"/>
              <col className="w-[17%]"/>
              <col className="w-[20%]"/>
            </colgroup>
            <thead className="sticky top-0 z-10 bg-muted/70">
              <tr>
                <th scope="col" className="!text-left !text-xs !normal-case">Permissão</th>
                <th scope="col" className="!text-center !text-xs !normal-case">Gestor</th>
                <th scope="col" className="!text-center !text-xs !normal-case">Operador</th>
                <th scope="col" className="!text-center !text-xs !normal-case">Gestor + Operador</th>
              </tr>
            </thead>
            {categories.map(category => <tbody key={category}>
              <tr className="bg-muted/35 hover:!bg-muted/35">
                <th scope="rowgroup" colSpan={4} className="!px-4 !py-3 !text-left !text-xs !font-black !normal-case text-foreground">
                  {category}
                </th>
              </tr>
              {rows.filter(item => item.category === category).map(item =>
                <tr key={item.key}>
                  <th scope="row" className="!px-4 !py-3 !text-left !text-sm !font-medium !normal-case text-foreground">
                    {item.label}
                  </th>
                  {roles.map(role => <td key={role} className="!px-3 !py-2 text-center">
                    <label className="flex min-h-9 cursor-pointer items-center justify-center">
                      <input type="checkbox" checked={Boolean(draft[role][item.key])}
                        disabled={saving}
                        onChange={event => toggle(role, item.key, event.target.checked)}
                        aria-label={`${item.label} — ${role === "manager" ? "Gestor" : "Operador"}`}
                        className="h-[18px] w-[18px] cursor-pointer accent-primary disabled:cursor-not-allowed"/>
                    </label>
                  </td>)}
                  <td className="!px-3 !py-2 text-center">
                    <div className="flex min-h-9 items-center justify-center">
                      <input type="checkbox"
                        checked={Boolean(draft.manager[item.key] || draft.operator[item.key])}
                        disabled
                        aria-label={`${item.label} — Gestor + Operador, combinação automática`}
                        title="Combinação automática de Gestor e Operador"
                        className="h-[18px] w-[18px] cursor-default accent-primary disabled:opacity-100"/>
                    </div>
                  </td>
                </tr>)}
            </tbody>)}
          </table>
        </div>
      </AdminCard> : <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma permissão cadastrada.</p>}
  </div>;

  const footer = <div className="flex flex-wrap items-center justify-between gap-3">
    <p className="text-xs text-muted-foreground">
      {loading ? "Carregando..." :
        pendingCount ? `${pendingCount} alteração(ões) não salva(s).` : "Nenhuma alteração pendente."}
    </p>
    <div className="flex flex-wrap justify-end gap-2">
      {onClose && <AdminButton variant="secondary" disabled={saving} onClick={onClose}>Fechar</AdminButton>}
      <AdminButton variant="secondary" disabled={!pendingCount || saving || loading} onClick={discard}>
        Descartar
      </AdminButton>
      <AdminButton disabled={!pendingCount || saving || loading} loading={saving} onClick={() => void save()}>
        Salvar permissões
      </AdminButton>
    </div>
  </div>;

  if (onClose) {
    return <AdminDialog open={true} onClose={() => { if (!saving) onClose(); }}
      title="Perfis e Permissões"
      className="w-full max-w-5xl"
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
