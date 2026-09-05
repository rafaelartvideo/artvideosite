import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle, Edit2, Eye, EyeOff, Plus, Trash2, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import {
  addRolePermission,
  countRolePermissions,
  createRole,
  deleteEmployeeRecord,
  getEmployees,
  getRolePermissionIds,
  invokeEmployeeCommand,
  listActiveRoles,
  listEmployeeRoleIds,
  listPermissions,
  listRoles,
  removeRolePermission,
  setEmployeeActive,
  updateRole,
} from "../infrastructure/employees.repository";
import {
  buildPermissionGroups,
  permissionDependencies,
  permissionLabel,
  type PermissionRecord,
} from "../domain/permission-taxonomy";
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
import { cn, formatCpf, formatPhone } from "@/shared/domain/formatters";
import {
  ConfirmDialog,
  EmptyState,
  LoadingState,
  StatusBadge,
  Toast,
} from "@/shared/ui/admin/AdminFeedback";
import {
  FInput,
  FSelect,
  FToggle,
  INPUT,
} from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { supabaseErrorMessage } from "@/shared/infrastructure/media.repository";
import { Checkbox } from "@/shared/ui/primitives/checkbox";

function PasswordField({ label, value, onChange, required = false, placeholder, resetKey }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; placeholder?: string; resetKey?: string | number }) {
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => { setShowPassword(false); }, [resetKey]);
  const visibilityLabel = showPassword ? "Ocultar senha" : "Mostrar senha";
  return <div className="min-w-0">
    <label className="mb-1.5 flex items-baseline gap-1 text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}{required && <span className="text-red-400">*</span>}</label>
    <div className="relative min-w-0">
      <input type={showPassword ? "text" : "password"} value={value} onChange={event => onChange(event.target.value)} required={required} placeholder={placeholder} className={cn(INPUT, "pr-11")} />
      <button type="button" onClick={() => setShowPassword(current => !current)} aria-label={visibilityLabel} title={visibilityLabel} className="absolute right-3 top-1/2 -translate-y-1/2 cursor-default rounded text-[#5a6a82] hover:text-[#0057e7] focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40" tabIndex={0}>
        {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
      </button>
    </div>
  </div>;
}

function EmployeesAreaHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h2 className="break-words text-lg font-black text-[#0d1b2e]">{title}</h2>
      <p className="mt-1 max-w-3xl break-words text-xs leading-relaxed text-[#5a6a82]">{description}</p>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>;
}

function RolePermissionsPanel() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const rolesQuery = useQuery({
    queryKey: queryKeys.employees.roles(),
    queryFn: async () => {
      const [
        { data: roleData, error: roleError },
        { data: permissionData, error: permissionError },
        { data: employees, error: employeesError },
      ] = await Promise.all([
        listRoles(),
        listPermissions(),
        listEmployeeRoleIds(),
      ]);
      const error = roleError || permissionError || employeesError;
      if (error) throw error;
      const roleCounts: Record<string, number> = {};
      (employees || []).forEach((employee: any) => {
        if (employee.role_id) roleCounts[employee.role_id] = (roleCounts[employee.role_id] || 0) + 1;
      });
      return { roles: roleData || [], permissions: permissionData || [], roleCounts };
    },
  });
  const roles = rolesQuery.data?.roles ?? [];
  const permissions = (rolesQuery.data?.permissions ?? []) as PermissionRecord[];
  const roleCounts = rolesQuery.data?.roleCounts ?? {};
  const [editing, setEditing] = useState<any>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", is_active: true, selected: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [rolePage, setRolePage] = useState(1);
  const [rolePageSize, setRolePageSize] = useState(5);

  useEffect(() => {
    if (!rolesQuery.error) return;
    const message = rolesQuery.error instanceof Error ? rolesQuery.error.message : String(rolesQuery.error);
    setToast({ msg: `Erro ao carregar permissões: ${message}`, type: "error" });
  }, [rolesQuery.error]);

  const roleTotalPages = Math.max(1, Math.ceil(roles.length / rolePageSize));
  const safeRolePage = Math.min(rolePage, roleTotalPages);
  const pagedRoles = roles.slice((safeRolePage - 1) * rolePageSize, safeRolePage * rolePageSize);
  useEffect(() => { if (rolePage > roleTotalPages) setRolePage(roleTotalPages); }, [rolePage, roleTotalPages]);

  const refreshRoles = () => queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
  const permissionGroups = buildPermissionGroups(permissions);
  const permissionByKey = new Map(permissions.map(permission => [permission.key, permission]));
  const addRequiredPermissions = (selected: Set<string>, permissionKey: string, visited = new Set<string>()) => {
    if (visited.has(permissionKey)) return;
    visited.add(permissionKey);
    permissionDependencies(permissionKey).forEach(requiredKey => {
      const requiredPermission = permissionByKey.get(requiredKey);
      if (!requiredPermission) return;
      selected.add(requiredPermission.id);
      addRequiredPermissions(selected, requiredPermission.key, visited);
    });
  };
  const normalizeSelection = (permissionIds: Iterable<string>) => {
    const selected = new Set(permissionIds);
    permissions.filter(permission => selected.has(permission.id)).forEach(permission => addRequiredPermissions(selected, permission.key));
    return selected;
  };

  const openNew = () => { setEditing(null); setForm({ name: "", description: "", is_active: true, selected: [] }); setFormOpen(true); };
  const reloadRolePermissions = async (roleId: string) => {
    const { data, error } = await getRolePermissionIds(roleId);
    if (error) return error;
    setForm(current => ({ ...current, selected: Array.from(normalizeSelection((data || []).map((item: any) => item.permission_id))) }));
    return null;
  };
  const openEdit = async (role: any) => {
    setEditing(role); setForm({ name: role.name || "", description: role.description || "", is_active: role.is_active !== false, selected: [] });
    const error = await reloadRolePermissions(role.id);
    if (error) { setToast({ msg: `Erro ao carregar permissões da função: ${supabaseErrorMessage(error)}`, type: "error" }); return; }
    setFormOpen(true);
  };
  const save = async () => {
    if (!hasPermission(editing ? "roles.edit" : "roles.create")) { setToast({ msg: "Você não possui permissão para salvar funções.", type: "error" }); return; }
    if (!form.name.trim()) { setToast({ msg: "Informe o nome da função.", type: "error" }); return; }
    setSaving(true);
    const payload = { name: form.name.trim(), description: form.description.trim() || null, is_active: form.is_active };
    const roleId = editing?.id || crypto.randomUUID();
    const result = editing ? await updateRole(roleId, payload) : await createRole({ ...payload, id: roleId, is_system: false, sort_order: roles.length });
    if (result.error) {
      console.error("Role save error:", { operation: editing ? "update" : "insert", table: "roles", code: result.error.code, message: result.error.message, details: result.error.details, hint: result.error.hint });
      setSaving(false);
      setToast({ msg: `Erro ao ${editing ? "atualizar" : "criar"} função: ${supabaseErrorMessage(result.error)}`, type: "error" });
      return;
    }

    const previousPermissionIds = new Set<string>();
    if (editing) {
      const { data: currentPermissions, error: currentPermissionsError } = await getRolePermissionIds(roleId);
      if (currentPermissionsError) {
        setSaving(false);
        setToast({ msg: `A função foi salva, mas não foi possível ler suas permissões: ${supabaseErrorMessage(currentPermissionsError)}`, type: "error" });
        await refreshRoles();
        return;
      }
      (currentPermissions || []).forEach((item: any) => previousPermissionIds.add(item.permission_id));
    }

    const selectedPermissionIds = normalizeSelection(form.selected);
    const permissionIdsToRemove = [...previousPermissionIds].filter(permissionId => !selectedPermissionIds.has(permissionId));
    const permissionIdsToAdd = [...selectedPermissionIds].filter(permissionId => !previousPermissionIds.has(permissionId));
    try {
      for (const permissionId of permissionIdsToAdd) {
        const { error } = await addRolePermission(roleId, permissionId);
        if (error) throw error;
      }
      for (const permissionId of permissionIdsToRemove) {
        const { error } = await removeRolePermission(roleId, permissionId);
        if (error) throw error;
      }
    } catch (error) {
      console.error("Role permissions save error:", { operation: "delta-sync", table: "role_permissions", error });
      setSaving(false);
      setToast({ msg: `A função foi salva, mas não foi possível sincronizar as permissões: ${supabaseErrorMessage(error)}`, type: "error" });
      if (editing) {
        const reloadError = await reloadRolePermissions(roleId);
        if (reloadError) console.error("Role permissions reload error:", reloadError);
      }
      await refreshRoles();
      return;
    }

    setSaving(false); setFormOpen(false); setToast({ msg: editing ? "Função atualizada." : "Função criada.", type: "success" }); await refreshRoles();
  };
  const togglePermission = (permissionId: string) => setForm(current => {
    const permission = permissions.find(item => item.id === permissionId);
    const nextSelected = new Set(current.selected);
    const wasSelected = nextSelected.has(permissionId);
    if (wasSelected) nextSelected.delete(permissionId);
    else {
      nextSelected.add(permissionId);
      if (permission) addRequiredPermissions(nextSelected, permission.key);
    }

    if (permission?.key === "orders.view" && wasSelected) {
      permissions.filter(item => item.key.startsWith("orders.") && item.key !== "orders.view").forEach(item => nextSelected.delete(item.id));
    }

    return { ...current, selected: Array.from(nextSelected) };
  });
  const toggleGroup = (items: PermissionRecord[]) => setForm(current => {
    const ids = items.map(item => item.id);
    const allGroupSelected = ids.length > 0 && ids.every(id => current.selected.includes(id));
    const selected = new Set(current.selected);
    if (allGroupSelected) ids.forEach(id => selected.delete(id));
    else items.forEach(item => { selected.add(item.id); addRequiredPermissions(selected, item.key); });
    return { ...current, selected: Array.from(selected) };
  });
  const allSelected = permissions.length > 0 && permissions.every(permission => form.selected.includes(permission.id));

  return <div className="min-w-0 space-y-4">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <EmployeesAreaHeader
      title="Funções e Permissões"
      description="Defina os acessos disponíveis para cada perfil"
      action={hasPermission("roles.create") ? <BtnPrimary onClick={openNew}><Plus size={15} /> Nova função</BtnPrimary> : undefined}
    />
    <AdminCard>
      {rolesQuery.isPending ? <LoadingState /> : roles.length === 0 ? <EmptyState icon={Users} title="Nenhuma função cadastrada" message="Cadastre uma função para configurar permissões." /> : <>
        <div className="overflow-x-auto"><table className="min-w-[720px]"><thead><tr><th className="text-left">Função</th><th className="text-left">Descrição</th><th className="text-left">Permissões</th><th className="text-left">Tipo</th><th className="text-left">Usuários</th><th className="text-right">Ações</th></tr></thead><tbody>{pagedRoles.map(role => <RoleRow key={role.id} role={role} permissionCount={role.permission_count} userCount={roleCounts[role.id] || 0} onEdit={() => openEdit(role)} />)}</tbody></table></div>
        <PaginationBar page={safeRolePage} pageSize={rolePageSize} totalItems={roles.length} onPageChange={setRolePage} onPageSizeChange={(size) => { setRolePageSize(size); setRolePage(1); }} />
      </>}
    </AdminCard>
    {formOpen && <AdminPage open={true} onClose={() => setFormOpen(false)} breadcrumb="Equipes > Funções e Permissões" title={editing ? "Editar função" : "Nova função"} subtitle="Configure os acessos do perfil" maxW="max-w-3xl">
      <div className="space-y-5 p-4 sm:p-5">
        <Section title="Dados da função"><div className="grid gap-4 sm:grid-cols-2"><FInput label="Nome" required value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} /><FInput label="Descrição" value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} /><div className="sm:col-span-2"><FToggle label="Função ativa" checked={form.is_active} onChange={is_active => setForm({ ...form, is_active })} /></div></div></Section>
        <Section title="Permissões">
          <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
            <label className="flex min-w-0 cursor-default items-center gap-2 break-words text-sm font-bold text-[#0d1b2e]"><Checkbox checked={allSelected} onCheckedChange={() => toggleGroup(permissions)} /> Selecionar todas as permissões</label>
            <span className="shrink-0 text-xs font-bold text-[#5a6a82]">{form.selected.length}/{permissions.length}</span>
          </div>
          <div className="space-y-4">
            {permissionGroups.map(module => {
              const moduleSelectedCount = module.permissions.filter(permission => form.selected.includes(permission.id)).length;
              const moduleAllSelected = module.permissions.length > 0 && moduleSelectedCount === module.permissions.length;
              return <AdminCard key={module.name} className="p-3 shadow-none sm:p-4">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <label className="flex min-w-0 cursor-default items-center gap-2 break-words text-sm font-black text-[#0d1b2e]"><Checkbox checked={moduleAllSelected} onCheckedChange={() => toggleGroup(module.permissions)} /> {module.name}</label>
                  <span className="shrink-0 text-[11px] font-bold text-[#5a6a82]">{moduleSelectedCount}/{module.permissions.length}</span>
                </div>
                <div className="mt-3 space-y-3">
                  {module.sections.map(section => {
                    const sectionSelectedCount = section.permissions.filter(permission => form.selected.includes(permission.id)).length;
                    const sectionAllSelected = section.permissions.length > 0 && sectionSelectedCount === section.permissions.length;
                    return <div key={`${module.name}-${section.name}`} className="min-w-0 rounded-lg border border-[#0d1b2e]/8 bg-[#f8fafc] p-3">
                      <div className="mb-2.5 flex min-w-0 items-center justify-between gap-3">
                        <label className="flex min-w-0 cursor-default items-center gap-2 text-[11px] font-black uppercase tracking-[0.1em] text-[#0d1b2e]"><Checkbox checked={sectionAllSelected} onCheckedChange={() => toggleGroup(section.permissions)} /> <span className="min-w-0 break-words">{section.name}</span></label>
                        <span className="shrink-0 text-[10px] font-bold text-[#8a96a8]">{sectionSelectedCount}/{section.permissions.length}</span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {section.permissions.map(permission => <label key={permission.id} className="flex min-w-0 cursor-default items-start gap-2 rounded-md bg-white p-2.5 text-xs text-[#5a6a82]">
                          <Checkbox checked={form.selected.includes(permission.id)} onCheckedChange={() => togglePermission(permission.id)} />
                          <span className="min-w-0">
                            <span className="block break-words font-semibold leading-relaxed text-[#34445b]">{permissionLabel(permission)}</span>
                            <span className="mt-0.5 block break-all font-mono text-[9px] text-[#8a96a8]">{permission.key}</span>
                          </span>
                        </label>)}
                      </div>
                    </div>;
                  })}
                </div>
              </AdminCard>;
            })}
          </div>
        </Section>
      </div>
      <div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5"><BtnSecondary onClick={() => setFormOpen(false)}>Cancelar</BtnSecondary>{hasPermission(editing ? "roles.edit" : "roles.create") && <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar Permissões"}</BtnPrimary>}</div>
    </AdminPage>}
  </div>;
}

function RoleRow({ role, permissionCount, userCount, onEdit }: { role: any; permissionCount?: number; userCount: number; onEdit: () => void }) {
  const [count, setCount] = useState(permissionCount);
  const { hasPermission } = useAuth();
  useEffect(() => { if (count != null) return; countRolePermissions(role.id).then(result => setCount(result.count || 0)); }, [role.id, count]);
  return <tr><td className="font-bold text-[#0d1b2e]">{role.name}</td><td className="max-w-sm break-words text-xs leading-relaxed text-[#5a6a82]">{role.description || "—"}</td><td className="text-xs text-[#5a6a82]">{count ?? "—"}</td><td><StatusBadge status={role.is_system ? "Padrão" : "Personalizado"} /></td><td className="text-xs text-[#5a6a82]">{userCount}</td><td className="text-right">{hasPermission("roles.edit") && <AdminIconButton ariaLabel={`Editar função ${role.name}`} title="Editar" onClick={onEdit}><Edit2 size={14} /></AdminIconButton>}</td></tr>;
}

export function TabEmployees({ onBack }: { onBack: () => void }) {
  const [activeArea, setActiveArea] = useState<"users" | "roles">("users");
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const employeesQuery = useQuery({
    queryKey: queryKeys.employees.lists(),
    queryFn: async () => {
      const [{ data, error }, rolesResult] = await Promise.all([getEmployees(), listActiveRoles()]);
      if (error) throw error;
      if (rolesResult.error) throw rolesResult.error;
      return { employees: data || [], roles: rolesResult.data || [] };
    },
  });
  const employees = employeesQuery.data?.employees ?? [];
  const roles = employeesQuery.data?.roles ?? [];
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: "", cpf: "", phone: "", email: "", password: "", function_name: "Funcionário", role_id: "", is_active: true });
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [employeePage, setEmployeePage] = useState(1);
  const [employeePageSize, setEmployeePageSize] = useState(5);
  const employeeTotalPages = Math.max(1, Math.ceil(employees.length / employeePageSize));
  const safeEmployeePage = Math.min(employeePage, employeeTotalPages);
  const pagedEmployees = employees.slice((safeEmployeePage - 1) * employeePageSize, safeEmployeePage * employeePageSize);
  useEffect(() => { if (employeePage > employeeTotalPages) setEmployeePage(employeeTotalPages); }, [employeePage, employeeTotalPages]);

  const getEmployeeErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
    return "Não foi possível atualizar o funcionário.";
  };

  useEffect(() => {
    if (!employeesQuery.error) return;
    setToast({ msg: `Erro ao carregar equipes: ${employeesQuery.error instanceof Error ? employeesQuery.error.message : String(employeesQuery.error)}`, type: "error" });
  }, [employeesQuery.error]);
  const refreshEmployees = () => queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
  const openNew = () => { setEditItem(null); setForm({ full_name: "", cpf: "", phone: "", email: "", password: "", function_name: "Funcionário", role_id: roles[0]?.id || "", is_active: true }); setFormOpen(true); };
  const openEdit = (employee: any) => {
    setEditItem(employee);
    setForm({ full_name: employee.full_name || "", cpf: employee.cpf || "", phone: formatPhone(employee.phone), email: "", password: "", function_name: employee.function_name || "Funcionário", role_id: employee.role_id || "", is_active: employee.is_active !== false });
    setFormOpen(true);
  };
  const normalizeCpf = (value: string) => value.replace(/\D/g, "");
  const save = async () => {
    if (!hasPermission(editItem ? "employees.edit" : "employees.create")) { setToast({ msg: "Você não possui permissão para salvar usuários.", type: "error" }); return; }
    const cpf = normalizeCpf(form.cpf);
    if (!form.full_name.trim() || cpf.length !== 11) { setToast({ msg: "Informe nome completo e um CPF válido.", type: "error" }); return; }
    const normalizedEmail = String(form.email || "").trim().replace(/\s+/g, "").toLowerCase();
    if (!editItem && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { setToast({ msg: "Informe um e-mail válido.", type: "error" }); return; }
    if (form.password && form.password.length < 8) { setToast({ msg: "A senha deve ter pelo menos 8 caracteres.", type: "error" }); return; }
    if (!form.role_id) { setToast({ msg: "Selecione uma função para o funcionário.", type: "error" }); return; }
    const duplicate = employees.some((e: any) => normalizeCpf(e.cpf) === cpf && e.id !== editItem?.id);
    if (duplicate) { setToast({ msg: "Este CPF já está cadastrado na equipe.", type: "error" }); return; }
    setSaving(true);
    try {
      if (editItem) {
        const updatePayload: Record<string, unknown> = { action: "update_employee_user", employee_id: editItem.id, full_name: form.full_name.trim(), cpf, phone: form.phone.replace(/\D/g, "") || null, function_name: form.function_name.trim() || null, role_id: form.role_id, is_active: form.is_active, password: form.password || undefined };
        if (normalizedEmail) updatePayload.email = normalizedEmail;
        const { data, error: invokeError } = await invokeEmployeeCommand(updatePayload);
        if (invokeError) {
          const context = (invokeError as { context?: unknown }).context;
          if (context instanceof Response) {
            try {
              const responseBody = await context.clone().json() as { error?: unknown };
              if (responseBody.error) throw new Error(typeof responseBody.error === "string" ? responseBody.error : getEmployeeErrorMessage(responseBody.error));
            } catch (error) {
              if (error instanceof Error && error.message !== "Unexpected end of JSON input") throw error;
            }
          }
          throw invokeError;
        }
        if (data?.error) throw new Error(typeof data.error === "string" ? data.error : getEmployeeErrorMessage(data.error));
        if (data?.success !== true) throw new Error("Não foi possível atualizar o funcionário.");
      } else {
        const { data, error: invokeError } = await invokeEmployeeCommand({ action: "create_employee_user", email: normalizedEmail, password: form.password, full_name: form.full_name.trim(), cpf, phone: form.phone ? form.phone.replace(/\D/g, "") : null, function_name: form.function_name.trim() || "Funcionário", role_id: form.role_id });
        if (invokeError) {
          let responseMessage = "";
          const context = (invokeError as { context?: unknown }).context;
          if (context instanceof Response) {
            try { const responseBody = await context.clone().json() as { error?: unknown }; responseMessage = typeof responseBody.error === "string" ? responseBody.error : ""; } catch { responseMessage = ""; }
          }
          throw new Error(responseMessage || invokeError.message || "Não foi possível cadastrar o funcionário.");
        }
        if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "Não foi possível cadastrar o funcionário.");
        if (data?.success !== true) throw new Error("Não foi possível cadastrar o funcionário.");
      }
      setFormOpen(false); setToast({ msg: editItem ? "Funcionário atualizado." : "Funcionário cadastrado.", type: "success" }); await refreshEmployees();
    } catch (e: unknown) {
      console.error("[ADMIN] employee save error:", e);
      setToast({ msg: getEmployeeErrorMessage(e), type: "error" });
    } finally { setSaving(false); }
  };
  const toggleActive = async (emp: any) => {
    if (!hasPermission("employees.edit")) return;
    const currentlyActive = emp.is_active !== false;
    const { error } = await setEmployeeActive(emp.id, !currentlyActive);
    if (error) { console.error("[ADMIN] employee toggle error:", error); setToast({ msg: `Erro ao atualizar funcionário: ${error.message}`, type: "error" }); return; }
    setToast({ msg: `Funcionário ${currentlyActive ? "desativado" : "ativado"}.`, type: "success" });
    await refreshEmployees();
  };
  const deleteEmployee = async (employeeId: string) => {
    if (!hasPermission("employees.delete")) return;
    const { error } = await deleteEmployeeRecord(employeeId);
    if (error) { setToast({ msg: `Não foi possível excluir o funcionário: ${error.message}`, type: "error" }); setDeleteId(null); return; }
    setToast({ msg: "Funcionário excluído.", type: "success" }); setDeleteId(null); await refreshEmployees();
  };

  return (
    <div className="min-w-0 space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {deleteId && <ConfirmDialog message="Excluir este funcionário? Isso remove o registro do funcionário, sem afetar o fluxo de ativação/desativação do status." onConfirm={() => { void deleteEmployee(deleteId); }} onCancel={() => setDeleteId(null)} />}
      <PageHeader title="Equipes" subtitle="Cadastro e gestão dos funcionários e funções da empresa" actions={<InternalBackButton onBack={onBack} />} />
      <div className="flex gap-1 border-b border-[#0d1b2e]/10">
        <button type="button" onClick={() => setActiveArea("users")} className={cn("cursor-default border-b-2 px-4 py-2.5 text-xs font-bold transition-colors", activeArea === "users" ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82] hover:text-[#0d1b2e]")}>Usuários</button>
        {hasPermission("roles.view") && <button type="button" onClick={() => setActiveArea("roles")} className={cn("cursor-default border-b-2 px-4 py-2.5 text-xs font-bold transition-colors", activeArea === "roles" ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82] hover:text-[#0d1b2e]")}>Funções e Permissões</button>}
      </div>

      {activeArea === "roles" && hasPermission("roles.view") ? <RolePermissionsPanel /> : <>
        <EmployeesAreaHeader
          title="Usuários"
          description="Cadastre e gerencie os funcionários da empresa."
          action={hasPermission("employees.create") ? <BtnPrimary onClick={openNew}><Plus size={16} /> Novo funcionário</BtnPrimary> : undefined}
        />
        <AdminCard>
          {employeesQuery.isPending ? <LoadingState /> : employees.length === 0 ? (
            <EmptyState icon={Users} title="Nenhum funcionário cadastrado" message="Cadastre o primeiro funcionário da equipe." onAdd={openNew} addLabel="Novo funcionário" />
          ) : <>
            <div className="overflow-x-auto">
              <table className="min-w-[700px]">
                <thead><tr><th className="text-left">Nome</th><th className="text-left">CPF</th><th className="text-left">Telefone</th><th className="text-left">Função</th><th className="text-left">Status</th><th className="text-right">Ações</th></tr></thead>
                <tbody>
                  {pagedEmployees.map(emp => {
                    const active = emp.is_active !== false;
                    const role = Array.isArray(emp.role) ? emp.role[0] : emp.role;
                    return <tr key={emp.id} onClick={() => openEdit(emp)} className="cursor-default"><td className="font-bold text-[#0d1b2e]">{emp.full_name}</td><td className="font-mono text-xs text-[#5a6a82]">{formatCpf(emp.cpf)}</td><td className="text-xs text-[#5a6a82]">{formatPhone(emp.phone) || "—"}</td><td className="text-xs text-[#5a6a82]">{role?.name?.trim() || "Função não informada"}</td><td><StatusBadge status={active ? "Ativo" : "Inativo"} /></td><td><div className="flex justify-end gap-1" onClick={event => event.stopPropagation()}>{hasPermission("employees.edit") && <AdminIconButton ariaLabel="Editar funcionário" title="Editar" onClick={() => openEdit(emp)}><Edit2 size={15} /></AdminIconButton>}{hasPermission("employees.edit") && <AdminIconButton ariaLabel={active ? "Desativar funcionário" : "Ativar funcionário"} title={active ? "Desativar" : "Ativar"} onClick={() => toggleActive(emp)}>{active ? <CheckCircle size={15} /> : <AlertCircle size={15} />}</AdminIconButton>}{hasPermission("employees.delete") && <AdminIconButton ariaLabel="Excluir funcionário" title="Excluir funcionário" variant="danger" onClick={() => setDeleteId(emp.id)}><Trash2 size={15} /></AdminIconButton>}</div></td></tr>;
                  })}
                </tbody>
              </table>
            </div>
            <PaginationBar page={safeEmployeePage} pageSize={employeePageSize} totalItems={employees.length} onPageChange={setEmployeePage} onPageSizeChange={(size) => { setEmployeePageSize(size); setEmployeePage(1); }} />
          </>}
        </AdminCard>
        <AdminPage open={formOpen} onClose={() => setFormOpen(false)} breadcrumb="Equipes" title={editItem ? editItem.full_name : "Novo funcionário"} subtitle={editItem ? "Atualize os dados do funcionário" : "Cadastre um funcionário da empresa"}>
          <div className="space-y-5 p-4 sm:p-5"><Section title="Dados do funcionário"><div className="grid gap-4 sm:grid-cols-2"><FInput label="Nome completo" required value={form.full_name} onChange={(e: any) => setForm({ ...form, full_name: e.target.value })} /><FInput label="CPF" required value={formatCpf(form.cpf)} onChange={(e: any) => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" /><FInput label="Número / telefone" value={form.phone} onChange={(e: any) => setForm({ ...form, phone: e.target.value })} />{editItem ? <FInput label="Gmail" type="email" value={form.email} onChange={(e: any) => setForm({ ...form, email: e.target.value })} placeholder="usuario@gmail.com" /> : <FInput label="E-mail" type="email" required value={form.email} onChange={(e: any) => setForm({ ...form, email: e.target.value })} />}{editItem && <PasswordField key={`edit-${editItem.id}-${formOpen}`} label="Nova senha" value={form.password} onChange={value => setForm({ ...form, password: value })} placeholder="Deixe em branco para manter" resetKey={String(formOpen)} />}{!editItem && <PasswordField key={`create-${formOpen}`} label="Senha" required value={form.password} onChange={value => setForm({ ...form, password: value })} resetKey={String(formOpen)} />}<FSelect label="Função" required value={form.role_id} onChange={(e: any) => setForm({ ...form, role_id: e.target.value })} options={[{ value: "", label: "Selecionar função..." }, ...roles.map(role => ({ value: role.id, label: role.name }))]} /><div className="sm:col-span-2"><FToggle label="Funcionário ativo" checked={form.is_active} onChange={value => setForm({ ...form, is_active: value })} /></div></div></Section></div><div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5"><BtnSecondary onClick={() => setFormOpen(false)}>Cancelar</BtnSecondary>{(editItem ? hasPermission("employees.edit") : hasPermission("employees.create")) && <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : editItem ? "Salvar alterações" : "Salvar funcionário"}</BtnPrimary>}</div>
        </AdminPage>
      </>}
    </div>
  );
}
