import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import {
  getUserPermissionAccess,
  setUserPermissionOverrides,
  type PermissionAccess,
} from "../infrastructure/user-access.repository";
import {
  permissionDependencies,
  type PermissionRecord,
} from "@/features/employees/domain/permission-taxonomy";
import { AdminPage, AdminStickyToolbar, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { PermissionMatrix } from "@/features/roles/presentation/PermissionMatrix";

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
  const queryClient = useQueryClient();
  const queryKey = queryKeys.registrations.permissions(organizationId, userId);
  const accessIdentity = `${organizationId}:${userId}`;
  const accessQuery = useQuery({
    queryKey,
    queryFn: () => getUserPermissionAccess(organizationId, userId),
    enabled: canView,
  });
  const access = accessQuery.data ?? null;
  const syncedFor = useRef<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!access) return;
    const serverSelected = access.individualPermissionIds.filter(id => !access.inheritedPermissionIds.includes(id));
    if (syncedFor.current !== accessIdentity) {
      syncedFor.current = accessIdentity;
      setDirty(false);
      setSelected(serverSelected);
      return;
    }
    if (!dirty) setSelected(serverSelected);
  }, [access, accessIdentity, dirty]);

  useEffect(() => {
    if (!accessQuery.error) return;
    setToast({ msg: `Erro ao carregar acessos: ${systemErrorMessage(accessQuery.error)}`, type: "error" });
  }, [accessQuery.error]);

  const permissions = (access?.permissions || []) as PermissionRecord[];
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
    setDirty(true);
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
      setToast({ msg: `Erro ao salvar permissões individuais: ${systemErrorMessage(error)}`, type: "error" });
      return;
    }
    setToast({ msg: "Permissões individuais atualizadas.", type: "success" });
    setDirty(false);
    void queryClient.invalidateQueries({ queryKey });
  };

  if (!canView) return null;

  return <AdminPage
    open
    onClose={onClose}
    breadcrumb={`Cadastros > ${registrationName} > Acessos e Permissões`}
    title="Acessos e Permissões"
    subtitle={`Permissões herdadas da função e acessos adicionais de ${registrationName}.`}
    maxW="max-w-6xl"
  >
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    {accessQuery.isPending && !access ? <LoadingState /> : !access ? <div className="p-5 text-sm text-[#5a6a82]">Não foi possível carregar os acessos deste usuário.</div> : <div className="space-y-5 p-4 sm:p-5">
      <Section title="Função base">
        <div className="flex items-start gap-3">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-[#0057e7]" />
          <div><div className="text-sm font-black text-[#0d1b2e]">{access.roleName || "Sem função vinculada"}</div><p className="mt-1 text-xs text-[#5a6a82]">A função define os acessos herdados. Para mudar a função, edite o cadastro do funcionário.</p></div>
        </div>
      </Section>

      <Section title="Permissões efetivas">
        <PermissionMatrix
          permissions={permissions}
          selectedIds={new Set([...access.inheritedPermissionIds, ...selected])}
          inheritedIds={inherited}
          individualIds={new Set(selected)}
          canManage={canManage}
          onToggle={toggle}
        />
      </Section>
    </div>}
    <AdminStickyToolbar className="justify-end">
      <BtnSecondary onClick={onClose}>Voltar</BtnSecondary>
      {canManage && <BtnPrimary onClick={save} loading={saving} loadingText="Salvando...">Salvar</BtnPrimary>}
    </AdminStickyToolbar>
  </AdminPage>;
}
