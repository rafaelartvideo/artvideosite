import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
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
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
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

  const toggleGroup = (name: string) => {
    setExpandedGroups(current => current.includes(name) ? current.filter(item => item !== name) : [...current, name]);
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
        <div className="flex items-start gap-3">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-[#0057e7]" />
          <div><div className="text-sm font-black text-[#0d1b2e]">{access.roleName || "Sem função vinculada"}</div><p className="mt-1 text-xs text-[#5a6a82]">A função define os acessos herdados. Para mudar a função, edite o cadastro do funcionário.</p></div>
        </div>
      </Section>

      <Section title="Permissões efetivas">
        <div className="divide-y divide-[#0d1b2e]/8 border-y border-[#0d1b2e]/8">
          {groups.map(group => {
            const expanded = expandedGroups.includes(group.name);
            const permissionCount = group.sections.reduce((total, section) => total + section.permissions.length, 0);
            return <div key={group.name}>
              <button
                type="button"
                onClick={() => toggleGroup(group.name)}
                className="flex w-full items-center gap-3 py-4 text-left"
                aria-expanded={expanded}
              >
                <ChevronDown size={17} className={`shrink-0 text-[#5a6a82] transition-transform ${expanded ? "rotate-180" : ""}`} />
                <span className="min-w-0 flex-1 text-sm font-black text-[#0d1b2e]">{group.name}</span>
                <span className="text-xs font-semibold text-[#8a98aa]">{permissionCount}</span>
              </button>

              {expanded && <div className="border-t border-[#0d1b2e]/8 pb-2 pl-0 sm:pl-7">
                {group.sections.map(section => <div key={section.name} className="border-b border-[#0d1b2e]/8 py-4 last:border-b-0">
                  <div className="mb-3 text-[10px] font-black uppercase tracking-wider text-[#8a98aa]">{section.name}</div>
                  <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                    {section.permissions.map(permission => {
                      const inheritedPermission = inherited.has(permission.id);
                      const checked = isEffective(permission.id);
                      return <button
                        key={permission.id}
                        type="button"
                        disabled={!canManage || inheritedPermission}
                        onClick={() => toggle(permission)}
                        className="flex min-w-0 items-start gap-3 border-b border-[#0d1b2e]/8 py-3 text-left disabled:cursor-default"
                      >
                        <Checkbox checked={checked} tabIndex={-1} />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#0d1b2e]">
                            {permissionLabel(permission)}
                            {inheritedPermission && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-700">Herdada da função</span>}
                            {!inheritedPermission && selected.includes(permission.id) && <span className="text-[9px] font-black uppercase tracking-wide text-[#0057e7]">Individual</span>}
                          </span>
                          {permission.description && <span className="mt-1 block text-[11px] leading-relaxed text-[#5a6a82]">{permission.description}</span>}
                        </span>
                      </button>;
                    })}
                  </div>
                </div>)}
              </div>}
            </div>;
          })}
        </div>
      </Section>
    </div>}
    <div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5">
      <BtnSecondary onClick={onClose}>Fechar</BtnSecondary>
      {canManage && <BtnPrimary onClick={save} loading={saving} loadingText="Salvando...">Salvar</BtnPrimary>}
    </div>
  </AdminPage>;
}
