import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  getUserPermissionAccess,
  setUserPermissionOverrides,
  type PermissionAccess,
} from "../infrastructure/user-access.repository";
import {
  buildPermissionGroups,
  permissionDependencies,
  permissionLabel,
  type PermissionRecord,
} from "@/features/employees/domain/permission-taxonomy";
import { AdminPage, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { Checkbox } from "@/shared/ui/primitives/checkbox";

export function UserPermissionOverridesPage({
  organizationId,
  userId,
  registrationName,
  onClose,
}: {
  organizationId: string;
  userId: string;
  registrationName: string;
  onClose: () => void;
}) {
  const { hasPermission } = useAuth();
  const canView = hasPermission("roles.view");
  const canManage = hasPermission("roles.permissions.manage");
  const [access, setAccess] = useState<PermissionAccess | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const result = await getUserPermissionAccess(organizationId, userId);
      setAccess(result);
      setSelected(result.individualPermissionIds.filter(id => !result.inheritedPermissionIds.includes(id)));
    } catch (error) {
      setToast({ msg: `Erro ao carregar acessos: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [organizationId, userId, canView]);

  const permissions = (access?.permissions || []) as PermissionRecord[];
  const groups = useMemo(() => buildPermissionGroups(permissions), [permissions]);
  const byKey = useMemo(() => new Map(permissions.map(permission => [permission.key, permission])), [permissions]);
  const inherited = useMemo(() => new Set(access?.inheritedPermissionIds || []), [access?.inheritedPermissionIds]);

  const isEffective = (permissionId: string) => inherited.has(permissionId) || selected.includes(permissionId);

  const addDependencies = (next: Set<string>, permissionKey: string, visited = new Set<string>()) => {
    if (visited.has(permissionKey)) return;
    visited.add(permissionKey);
    permissionDependencies(permissionKey).forEach(requiredKey => {
      const required = byKey.get(requiredKey);
      if (!required || inherited.has(required.id)) return;
      next.add(required.id);
      addDependencies(next, required.key, visited);
    });
  };

  const dependsOn = (candidateKey: string, targetKey: string, visited = new Set<string>()): boolean => {
    if (candidateKey === targetKey) return true;
    if (visited.has(candidateKey)) return false;
    visited.add(candidateKey);
    return permissionDependencies(candidateKey).some(required => required === targetKey || dependsOn(required, targetKey, visited));
  };

  const toggle = (permission: PermissionRecord) => {
    if (!canManage || inherited.has(permission.id)) return;
    setSelected(current => {
      const next = new Set(current);
      if (next.has(permission.id)) {
        next.delete(permission.id);
        permissions.forEach(candidate => {
          if (!inherited.has(candidate.id) && next.has(candidate.id) && dependsOn(candidate.key, permission.key)) {
            next.delete(candidate.id);
          }
        });
      } else {
        next.add(permission.id);
        addDependencies(next, permission.key);
      }
      return Array.from(next);
    });
  };

  const save = async () => {
    if (!canManage || saving) return;
    setSaving(true);
    const { error } = await setUserPermissionOverrides(organizationId, userId, selected);
    setSaving(false);
    if (error) {
      setToast({ msg: `Erro ao salvar permissões individuais: ${error.message}`, type: "error" });
      return;
    }
    setToast({ msg: "Permissões individuais atualizadas.", type: "success" });
    await load();
  };

  if (!canView) return null;

  return <AdminPage
    open
    onClose={onClose}
    breadcrumb="Cadastros > Acessos e Permissões"
    title={registrationName}
    subtitle="Permissões herdadas da função e acessos adicionais deste usuário."
    maxW="max-w-6xl"
  >
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    {loading || !access ? <LoadingState /> : <div className="space-y-5 p-4 sm:p-5">
      <Section title="Função base">
        <div className="flex items-center gap-3 rounded-xl border border-[#0d1b2e]/10 bg-[#f8fafc] p-4">
          <ShieldCheck size={20} className="shrink-0 text-[#0057e7]" />
          <div><div className="text-sm font-black text-[#0d1b2e]">{access.roleName || "Sem função vinculada"}</div><p className="mt-1 text-xs text-[#5a6a82]">A função define os acessos herdados. Para mudar a função, edite o cadastro do funcionário.</p></div>
        </div>
      </Section>

      <Section title="Permissões efetivas">
        <div className="space-y-4">
          {groups.map(group => <div key={group.name} className="overflow-hidden rounded-xl border border-[#0d1b2e]/10">
            <div className="bg-[#f8fafc] px-4 py-3"><span className="text-sm font-black text-[#0d1b2e]">{group.name}</span></div>
            <div className="space-y-4 p-4">
              {group.sections.map(section => <div key={section.name}>
                <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-[#8a98aa]">{section.name}</div>
                <div className="grid gap-2 md:grid-cols-2">
                  {section.permissions.map(permission => {
                    const inheritedPermission = inherited.has(permission.id);
                    const checked = isEffective(permission.id);
                    return <button
                      key={permission.id}
                      type="button"
                      disabled={!canManage || inheritedPermission}
                      onClick={() => toggle(permission)}
                      className={`flex min-w-0 items-start gap-3 rounded-lg border p-3 text-left disabled:cursor-default ${checked ? "border-[#0057e7]/40 bg-[#0057e7]/5" : "border-[#0d1b2e]/10 bg-white"}`}
                    >
                      <Checkbox checked={checked} tabIndex={-1} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#0d1b2e]">{permissionLabel(permission)}{inheritedPermission && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-600">Herdada da função</span>}{!inheritedPermission && selected.includes(permission.id) && <span className="rounded-full bg-[#0057e7]/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#0057e7]">Individual</span>}</span>
                        {permission.description && <span className="mt-1 block text-[11px] leading-relaxed text-[#5a6a82]">{permission.description}</span>}
                      </span>
                    </button>;
                  })}
                </div>
              </div>)}
            </div>
          </div>)}
        </div>
      </Section>
    </div>}
    <div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5">
      <BtnSecondary onClick={onClose}>Fechar</BtnSecondary>
      {canManage && <BtnPrimary onClick={save} loading={saving} loadingText="Salvando...">Salvar permissões individuais</BtnPrimary>}
    </div>
  </AdminPage>;
}
