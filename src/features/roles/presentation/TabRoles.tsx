import { useEffect, useMemo, useState } from "react";
import { Edit2, Plus, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  addRolePermission,
  createRole,
  getRolePermissionIds,
  listPermissions,
  listRoleMembers,
  listRoles,
  removeRolePermission,
  updateRole,
} from "../infrastructure/roles.repository";
import {
  buildPermissionGroups,
  permissionDependencies,
  permissionLabel,
  type PermissionRecord,
} from "@/features/employees/domain/permission-taxonomy";
import {
  AdminCard,
  AdminIconButton,
  AdminPage,
  BtnPrimary,
  BtnSecondary,
  InternalBackButton,
  PageHeader,
  Section,
} from "@/shared/ui/admin/AdminLayout";
import { FInput, FTextarea, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { EmptyState, LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import { supabaseErrorMessage } from "@/shared/infrastructure/media.repository";

export type RolesRouteProps = {
  onBack: () => void;
  routeResourceId?: string | null;
  routeSubpage?: string | null;
  onRouteChange?: (resourceId: string | null, subpage?: string | null) => void;
};

type RoleRecord = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
};

type FormState = {
  name: string;
  description: string;
  is_active: boolean;
  selected: string[];
};

const emptyForm = (): FormState => ({
  name: "",
  description: "",
  is_active: true,
  selected: [],
});

export function TabRoles({ onBack, routeResourceId, onRouteChange }: RolesRouteProps) {
  const { hasPermission, activeOrganizationId } = useAuth();
  const canView = hasPermission("roles.view");
  const canViewTable = hasPermission("roles.table.view") || canView;
  const canViewDetails = hasPermission("roles.details.view") || canView;
  const canCreate = hasPermission("roles.create");
  const canEdit = hasPermission("roles.edit");
  const canManagePermissions = hasPermission("roles.permissions.manage");

  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<RoleRecord | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const editorOpen = routeResourceId === "new" || Boolean(routeResourceId);

  const load = async () => {
    if (!activeOrganizationId || !canView) {
      setRoles([]);
      setPermissions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [rolesResult, permissionsResult, membersResult] = await Promise.all([
      listRoles(activeOrganizationId),
      listPermissions(),
      listRoleMembers(activeOrganizationId),
    ]);
    setLoading(false);
    const error = rolesResult.error || permissionsResult.error || membersResult.error;
    if (error) {
      setToast({ msg: `Erro ao carregar funções: ${supabaseErrorMessage(error)}`, type: "error" });
      return;
    }
    const counts: Record<string, number> = {};
    (membersResult.data || []).forEach((member: any) => {
      if (member.role_id) counts[member.role_id] = (counts[member.role_id] || 0) + 1;
    });
    setRoles((rolesResult.data || []) as RoleRecord[]);
    setPermissions((permissionsResult.data || []) as PermissionRecord[]);
    setMemberCounts(counts);
  };

  useEffect(() => { void load(); }, [activeOrganizationId, canView]);

  useEffect(() => {
    let cancelled = false;
    if (!editorOpen) {
      setEditing(null);
      setForm(emptyForm());
      return () => { cancelled = true; };
    }
    if (routeResourceId === "new") {
      setEditing(null);
      setForm(emptyForm());
      return () => { cancelled = true; };
    }
    const role = roles.find(item => item.id === routeResourceId);
    if (!role || !canViewDetails) return () => { cancelled = true; };
    setEditing(role);
    setForm({ name: role.name, description: role.description || "", is_active: role.is_active !== false, selected: [] });
    void getRolePermissionIds(role.id).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setToast({ msg: `Erro ao carregar permissões: ${supabaseErrorMessage(error)}`, type: "error" });
        return;
      }
      setForm(current => ({ ...current, selected: (data || []).map((item: any) => String(item.permission_id)) }));
    });
    return () => { cancelled = true; };
  }, [editorOpen, routeResourceId, roles, canViewDetails]);

  const permissionByKey = useMemo(
    () => new Map(permissions.map(permission => [permission.key, permission])),
    [permissions],
  );
  const permissionGroups = useMemo(() => buildPermissionGroups(permissions), [permissions]);

  const addDependencies = (selected: Set<string>, key: string, visited = new Set<string>()) => {
    if (visited.has(key)) return;
    visited.add(key);
    permissionDependencies(key).forEach(requiredKey => {
      const required = permissionByKey.get(requiredKey);
      if (!required) return;
      selected.add(required.id);
      addDependencies(selected, required.key, visited);
    });
  };

  const dependsOn = (candidateKey: string, targetKey: string, visited = new Set<string>()): boolean => {
    if (candidateKey === targetKey) return true;
    if (visited.has(candidateKey)) return false;
    visited.add(candidateKey);
    return permissionDependencies(candidateKey).some(required => required === targetKey || dependsOn(required, targetKey, visited));
  };

  const removeWithDependents = (selected: Set<string>, permission: PermissionRecord) => {
    selected.delete(permission.id);
    permissions.forEach(candidate => {
      if (candidate.id !== permission.id && selected.has(candidate.id) && dependsOn(candidate.key, permission.key)) {
        selected.delete(candidate.id);
      }
    });
  };

  const togglePermission = (permission: PermissionRecord) => {
    if (!canManagePermissions) return;
    setForm(current => {
      const selected = new Set(current.selected);
      if (selected.has(permission.id)) removeWithDependents(selected, permission);
      else {
        selected.add(permission.id);
        addDependencies(selected, permission.key);
      }
      return { ...current, selected: Array.from(selected) };
    });
  };

  const toggleGroup = (items: PermissionRecord[]) => {
    if (!canManagePermissions) return;
    setForm(current => {
      const selected = new Set(current.selected);
      const allSelected = items.length > 0 && items.every(item => selected.has(item.id));
      if (allSelected) items.forEach(item => removeWithDependents(selected, item));
      else items.forEach(item => {
        selected.add(item.id);
        addDependencies(selected, item.key);
      });
      return { ...current, selected: Array.from(selected) };
    });
  };

  const closeEditor = () => onRouteChange?.(null, null);
  const openNew = () => canCreate && onRouteChange?.("new", "edit");
  const openRole = (role: RoleRecord) => canViewDetails && onRouteChange?.(role.id, "edit");

  const save = async () => {
    if (!activeOrganizationId || saving) return;
    const creating = !editing;
    if (creating && !canCreate) return;
    if (!creating && !canEdit && !canManagePermissions) return;
    if (!form.name.trim()) {
      setToast({ msg: "Informe o nome da função.", type: "error" });
      return;
    }

    setSaving(true);
    try {
      const roleId = editing?.id || crypto.randomUUID();
      if (creating) {
        const { error } = await createRole(activeOrganizationId, {
          id: roleId,
          name: form.name.trim(),
          description: form.description.trim() || null,
          is_active: form.is_active,
          is_system: false,
          sort_order: roles.length,
        });
        if (error) throw error;
      } else if (canEdit) {
        const { error } = await updateRole(roleId, activeOrganizationId, {
          name: editing?.is_system ? editing.name : form.name.trim(),
          description: form.description.trim() || null,
          is_active: form.is_active,
        });
        if (error) throw error;
      }

      if (canManagePermissions) {
        const { data: currentRows, error: currentError } = await getRolePermissionIds(roleId);
        if (currentError) throw currentError;
        const current = new Set((currentRows || []).map((item: any) => String(item.permission_id)));
        const selected = new Set(form.selected);
        for (const permissionId of selected) {
          if (!current.has(permissionId)) {
            const { error } = await addRolePermission(roleId, permissionId);
            if (error) throw error;
          }
        }
        for (const permissionId of current) {
          if (!selected.has(permissionId)) {
            const { error } = await removeRolePermission(roleId, permissionId);
            if (error) throw error;
          }
        }
      }

      setToast({ msg: creating ? "Função criada." : "Função atualizada.", type: "success" });
      await load();
      closeEditor();
    } catch (error) {
      setToast({ msg: `Erro ao salvar função: ${supabaseErrorMessage(error)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(roles.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRoles = roles.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  if (!canView) return null;

  if (editorOpen) {
    if (routeResourceId !== "new" && !editing) {
      return <AdminPage open onClose={closeEditor} breadcrumb="Operação > Funções e Permissões" title="Carregando função"><LoadingState /></AdminPage>;
    }
    const creating = routeResourceId === "new";
    return <AdminPage
      open
      onClose={closeEditor}
      breadcrumb="Operação > Funções e Permissões"
      title={creating ? "Nova função" : form.name || "Editar função"}
      subtitle="Defina o perfil-base e as permissões herdadas pelos usuários vinculados."
      maxW="max-w-6xl"
    >
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <div className="space-y-5 p-4 sm:p-5">
        <Section title="Dados da função">
          <div className="grid gap-4 sm:grid-cols-2">
            <FInput label="Nome" required disabled={Boolean(editing?.is_system) || (!creating && !canEdit)} value={form.name} onChange={(event: any) => setForm(current => ({ ...current, name: event.target.value }))} />
            <div className="sm:col-span-2"><FTextarea label="Descrição" disabled={!creating && !canEdit} value={form.description} onChange={(event: any) => setForm(current => ({ ...current, description: event.target.value }))} /></div>
            <FToggle label="Função ativa" disabled={!creating && !canEdit} checked={form.is_active} onChange={value => setForm(current => ({ ...current, is_active: value }))} />
          </div>
        </Section>

        <Section title="Permissões">
          <div className="space-y-4">
            {permissionGroups.map(group => {
              const allGroup = group.permissions.length > 0 && group.permissions.every(permission => form.selected.includes(permission.id));
              return <div key={group.name} className="overflow-hidden rounded-xl border border-[#0d1b2e]/10">
                <button type="button" disabled={!canManagePermissions} onClick={() => toggleGroup(group.permissions)} className="flex w-full items-center gap-3 bg-[#f8fafc] px-4 py-3 text-left disabled:cursor-default">
                  <Checkbox checked={allGroup} tabIndex={-1} />
                  <span className="text-sm font-black text-[#0d1b2e]">{group.name}</span>
                  <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[#8a98aa]">{group.permissions.filter(permission => form.selected.includes(permission.id)).length}/{group.permissions.length}</span>
                </button>
                <div className="space-y-4 p-4">
                  {group.sections.map(section => <div key={section.name}>
                    <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-[#8a98aa]">{section.name}</div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {section.permissions.map(permission => {
                        const checked = form.selected.includes(permission.id);
                        return <button key={permission.id} type="button" disabled={!canManagePermissions} onClick={() => togglePermission(permission)} className={`flex min-w-0 items-start gap-3 rounded-lg border p-3 text-left disabled:cursor-default ${checked ? "border-[#0057e7]/40 bg-[#0057e7]/5" : "border-[#0d1b2e]/10 bg-white"}`}>
                          <Checkbox checked={checked} tabIndex={-1} />
                          <span className="min-w-0"><span className="block text-xs font-bold text-[#0d1b2e]">{permissionLabel(permission)}</span>{permission.description && <span className="mt-1 block text-[11px] leading-relaxed text-[#5a6a82]">{permission.description}</span>}</span>
                        </button>;
                      })}
                    </div>
                  </div>)}
                </div>
              </div>;
            })}
          </div>
        </Section>
      </div>
      <div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5">
        <BtnSecondary onClick={closeEditor}>Cancelar</BtnSecondary>
        {(creating ? canCreate : canEdit || canManagePermissions) && <BtnPrimary onClick={save} loading={saving} loadingText="Salvando...">Salvar função</BtnPrimary>}
      </div>
    </AdminPage>;
  }

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader
      title="Funções e Permissões"
      subtitle="Configure os perfis-base e os acessos herdados pelos funcionários."
      actions={<div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />{canCreate && <BtnPrimary onClick={openNew}><Plus size={15} /> Nova função</BtnPrimary>}</div>}
    />

    {canViewTable && <AdminCard>
      {loading ? <LoadingState /> : roles.length === 0 ? <EmptyState icon={ShieldCheck} title="Nenhuma função cadastrada" message="Cadastre a primeira função para definir permissões." onAdd={canCreate ? openNew : undefined} addLabel="Nova função" /> : <>
        <div className="overflow-x-auto">
          <table className="min-w-[720px]">
            <thead><tr><th className="text-left">Função</th><th className="text-left">Descrição</th><th className="text-left">Vinculados</th><th className="text-left">Status</th><th className="text-right">Ações</th></tr></thead>
            <tbody>{pagedRoles.map(role => <tr key={role.id} onClick={() => openRole(role)} className={canViewDetails ? "cursor-default" : undefined}>
              <td className="font-bold text-[#0d1b2e]">{role.name}</td>
              <td className="max-w-sm text-xs text-[#5a6a82]">{role.description || "—"}</td>
              <td className="text-xs text-[#5a6a82]">{memberCounts[role.id] || 0}</td>
              <td><StatusBadge status={role.is_active ? "Ativo" : "Inativo"} /></td>
              <td className="text-right" onClick={event => event.stopPropagation()}>{canViewDetails && <AdminIconButton ariaLabel={`Abrir função ${role.name}`} title="Abrir" onClick={() => openRole(role)}><Edit2 size={14} /></AdminIconButton>}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <PaginationBar page={safePage} pageSize={pageSize} totalItems={roles.length} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
      </>}
    </AdminCard>}
  </div>;
}
