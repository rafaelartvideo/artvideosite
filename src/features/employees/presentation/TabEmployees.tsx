import { useEffect, useState } from "react";
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
import { supabaseErrorMessage } from "@/shared/infrastructure/media.repository";

function PasswordField({ label, value, onChange, required = false, placeholder, resetKey }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; placeholder?: string; resetKey?: string | number }) {
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => { setShowPassword(false); }, [resetKey]);
  const visibilityLabel = showPassword ? "Ocultar senha" : "Mostrar senha";
  return <div>
    <label className="flex items-baseline gap-1 text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">{label}{required && <span className="text-red-400">*</span>}</label>
    <div className="relative">
      <input type={showPassword ? "text" : "password"} value={value} onChange={event => onChange(event.target.value)} required={required} placeholder={placeholder} className={cn(INPUT, "pr-11")} />
      <button type="button" onClick={() => setShowPassword(current => !current)} aria-label={visibilityLabel} title={visibilityLabel} className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-[#5a6a82] hover:text-[#0057e7] focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40 rounded" tabIndex={0}>
        {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
      </button>
    </div>
  </div>;
}

function RolePermissionsPanel({ onBack }: { onBack: () => void }) {
  const { hasPermission } = useAuth();
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<any>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", is_active: true, selected: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    const [{ data: roleData, error: roleError }, { data: permissionData, error: permissionError }, { data: employees }] = await Promise.all([
      listRoles(),
      listPermissions(),
      listEmployeeRoleIds(),
    ]);
    if (roleError || permissionError) { setToast({ msg: `Erro ao carregar permissões: ${(roleError || permissionError)?.message}`, type: "error" }); return; }
    const counts: Record<string, number> = {};
    (employees || []).forEach((employee: any) => { if (employee.role_id) counts[employee.role_id] = (counts[employee.role_id] || 0) + 1; });
    setRoles(roleData || []); setPermissions(permissionData || []); setRoleCounts(counts);
  };
  useEffect(() => { load(); }, []);

  const grouped = permissions.reduce<Record<string, any[]>>((groups, permission) => {
    const moduleName = permission.key?.startsWith("orders.") ? "Ordens de Serviço" : permission.key?.startsWith("inventory.") ? "Estoque" : permission.module_name || "Outros";
    (groups[moduleName] ||= []).push(permission);
    return groups;
  }, {});
  const openNew = () => { setEditing(null); setForm({ name: "", description: "", is_active: true, selected: [] }); setFormOpen(true); };
  const reloadRolePermissions = async (roleId: string) => {
    const { data, error } = await getRolePermissionIds(roleId);
    if (error) return error;
    setForm(current => ({ ...current, selected: (data || []).map((item: any) => item.permission_id) }));
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
    const result = editing
      ? await updateRole(roleId, payload)
      : await createRole({ ...payload, id: roleId, is_system: false, sort_order: roles.length });
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
        await load();
        return;
      }
      (currentPermissions || []).forEach((item: any) => previousPermissionIds.add(item.permission_id));
    }

    const selectedPermissionIds = new Set(form.selected);
    const permissionByKey = new Map(permissions.map(permission => [permission.key, permission.id]));
    const viewPermissionId = permissionByKey.get("orders.view");
    const viewAllPermissionId = permissionByKey.get("orders.view_all");
    const requestPartsPermissionId = permissionByKey.get("orders.request_parts");
    const managePartRequestsPermissionId = permissionByKey.get("orders.manage_part_requests");
    if (viewPermissionId && (selectedPermissionIds.has(viewAllPermissionId) || selectedPermissionIds.has(requestPartsPermissionId) || selectedPermissionIds.has(managePartRequestsPermissionId))) selectedPermissionIds.add(viewPermissionId);
    if (viewAllPermissionId && selectedPermissionIds.has(managePartRequestsPermissionId)) selectedPermissionIds.add(viewAllPermissionId);
    if (viewPermissionId && !selectedPermissionIds.has(viewPermissionId)) {
      if (viewAllPermissionId) selectedPermissionIds.delete(viewAllPermissionId);
      if (requestPartsPermissionId) selectedPermissionIds.delete(requestPartsPermissionId);
      if (managePartRequestsPermissionId) selectedPermissionIds.delete(managePartRequestsPermissionId);
    }
    if (viewAllPermissionId && !selectedPermissionIds.has(viewAllPermissionId) && managePartRequestsPermissionId) selectedPermissionIds.delete(managePartRequestsPermissionId);
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
      await load();
      return;
    }

    setSaving(false); setFormOpen(false); setToast({ msg: editing ? "Função atualizada." : "Função criada.", type: "success" }); await load();
  };
  const togglePermission = (permissionId: string) => setForm(current => {
    const permission = permissions.find(item => item.id === permissionId);
    const nextSelected = new Set(current.selected);
    const wasSelected = nextSelected.has(permissionId);
    if (wasSelected) nextSelected.delete(permissionId);
    else nextSelected.add(permissionId);
    if (permission?.key === "orders.view") {
      if (!nextSelected.has(permissionId)) {
        permissions.filter(item => item.key === "orders.view_all" || item.key === "orders.request_parts" || item.key === "orders.manage_part_requests").forEach(item => nextSelected.delete(item.id));
      }
    } else if (permission?.key === "orders.view_all" || permission?.key === "orders.request_parts") {
      const viewPermission = permissions.find(item => item.key === "orders.view");
      if (viewPermission) nextSelected.add(viewPermission.id);
      if (permission?.key === "orders.view_all" && wasSelected) {
        const managePermission = permissions.find(item => item.key === "orders.manage_part_requests");
        if (managePermission) nextSelected.delete(managePermission.id);
      }
    } else if (permission?.key === "orders.manage_part_requests") {
      const viewPermission = permissions.find(item => item.key === "orders.view");
      const viewAllPermission = permissions.find(item => item.key === "orders.view_all");
      if (viewPermission) nextSelected.add(viewPermission.id);
      if (viewAllPermission) nextSelected.add(viewAllPermission.id);
    }
    return { ...current, selected: Array.from(nextSelected) };
  });
  const toggleGroup = (items: any[]) => { const ids = items.map(item => item.id); const allSelected = ids.every(id => form.selected.includes(id)); setForm(current => ({ ...current, selected: allSelected ? current.selected.filter(id => !ids.includes(id)) : Array.from(new Set([...current.selected, ...ids])) })); };
  const allSelected = permissions.length > 0 && permissions.every(permission => form.selected.includes(permission.id));

  return <div className="space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader title="Funções e Permissões" subtitle="Defina os acessos disponíveis para cada perfil" actions={<div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />{hasPermission("roles.create") && <BtnPrimary onClick={openNew}><Plus size={15} /> Nova função</BtnPrimary>}</div>} />
    <div className="bg-white rounded-xl border border-[#0d1b2e]/8 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm min-w-[720px]"><thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold"><tr><th className="px-4 py-3 text-left">Função</th><th className="px-4 py-3 text-left">Descrição</th><th className="px-4 py-3 text-left">Permissões</th><th className="px-4 py-3 text-left">Tipo</th><th className="px-4 py-3 text-left">Usuários</th><th className="px-4 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y divide-[#0d1b2e]/5">{roles.map(role => <RoleRow key={role.id} role={role} permissionCount={role.permission_count} userCount={roleCounts[role.id] || 0} onEdit={() => openEdit(role)} />)}</tbody></table></div></div>
    {formOpen && <AdminPage open={true} onClose={() => setFormOpen(false)} breadcrumb="Equipes" title={editing ? "Editar função" : "Nova função"} subtitle="Configure os acessos do perfil" maxW="max-w-3xl"><div className="p-5 space-y-5"><Section title="Dados da função"><div className="grid sm:grid-cols-2 gap-4"><FInput label="Nome" required value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} /><FInput label="Descrição" value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} /><div className="sm:col-span-2"><FToggle label="Função ativa" checked={form.is_active} onChange={is_active => setForm({ ...form, is_active })} /></div></div></Section><Section title="Permissões"><div className="flex items-center justify-between mb-4"><label className="flex items-center gap-2 text-sm font-bold text-[#0d1b2e]"><input type="checkbox" checked={allSelected} onChange={() => toggleGroup(permissions)} /> Selecionar todas as permissões</label><span className="text-xs font-bold text-[#5a6a82]">{form.selected.length}/{permissions.length}</span></div><div className="space-y-3">{Object.entries(grouped).map(([moduleName, items]) => { const moduleItems = items as any[]; const selectedCount = moduleItems.filter(item => form.selected.includes(item.id)).length; return <div key={moduleName} className="border border-[#0d1b2e]/10 rounded-lg p-4"><div className="flex items-center justify-between mb-3"><label className="flex items-center gap-2 text-sm font-black text-[#0d1b2e]"><input type="checkbox" checked={selectedCount === moduleItems.length} onChange={() => toggleGroup(moduleItems)} /> {moduleName}</label><span className="text-[11px] text-[#5a6a82]">{selectedCount}/{moduleItems.length}</span></div><div className="grid sm:grid-cols-2 gap-2">{moduleItems.map(permission => <label key={permission.id} className="flex items-start gap-2 text-xs text-[#5a6a82]"><input type="checkbox" checked={form.selected.includes(permission.id)} onChange={() => togglePermission(permission.id)} /><span>{permission.label || permission.description || permission.key}</span></label>)}</div></div>; })}</div></Section></div><div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3"><BtnSecondary onClick={() => setFormOpen(false)}>Cancelar</BtnSecondary>{hasPermission(editing ? "roles.edit" : "roles.create") && <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar Permissões"}</BtnPrimary>}</div></AdminPage>}
  </div>;
}

function RoleRow({ role, permissionCount, userCount, onEdit }: { role: any; permissionCount?: number; userCount: number; onEdit: () => void }) {
  const [count, setCount] = useState(permissionCount);
  const { hasPermission } = useAuth();
  useEffect(() => { if (count != null) return; countRolePermissions(role.id).then(result => setCount(result.count || 0)); }, [role.id, count]);
  return <tr className="hover:bg-[#f8fafc]/80"><td className="px-4 py-3.5 font-bold text-[#0d1b2e]">{role.name}</td><td className="px-4 py-3.5 text-xs text-[#5a6a82]">{role.description || "—"}</td><td className="px-4 py-3.5 text-xs text-[#5a6a82]">{count ?? "—"}</td><td className="px-4 py-3.5"><StatusBadge status={role.is_system ? "Padrão" : "Personalizado"} /></td><td className="px-4 py-3.5 text-xs text-[#5a6a82]">{userCount}</td><td className="px-4 py-3.5 text-right">{hasPermission("roles.edit") && <button type="button" onClick={onEdit} className="text-xs font-bold text-[#0057e7] hover:underline">Editar</button>}</td></tr>;
}

export function TabEmployees({ onBack }: { onBack: () => void }) {
  const [activeArea, setActiveArea] = useState<"users" | "roles">("users");
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const employeesQuery = useQuery({
    queryKey: queryKeys.employees.lists(),
    queryFn: async () => {
      const [{ data, error }, rolesResult] = await Promise.all([
        getEmployees(),
        listActiveRoles(),
      ]);
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
  const getEmployeeErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
    return "Não foi possível atualizar o funcionário.";
  };

  useEffect(() => {
    if (!employeesQuery.error) return;
    setToast({
      msg: `Erro ao carregar equipes: ${employeesQuery.error instanceof Error ? employeesQuery.error.message : String(employeesQuery.error)}`,
      type: "error",
    });
  }, [employeesQuery.error]);
  const refreshEmployees = () => queryClient.invalidateQueries({
    queryKey: queryKeys.employees.all,
  });

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
        const updatePayload: Record<string, unknown> = {
          action: "update_employee_user",
          employee_id: editItem.id,
          full_name: form.full_name.trim(),
          cpf,
          phone: form.phone.replace(/\D/g, "") || null,
          function_name: form.function_name.trim() || null,
          role_id: form.role_id,
          is_active: form.is_active,
          password: form.password || undefined,
        };
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
        const { data, error: invokeError } = await invokeEmployeeCommand({
            action: "create_employee_user",
            email: normalizedEmail,
            password: form.password,
            full_name: form.full_name.trim(),
            cpf,
            phone: form.phone ? form.phone.replace(/\D/g, "") : null,
            function_name: form.function_name.trim() || "Funcionário",
            role_id: form.role_id,
        });
        if (invokeError) {
          let responseMessage = "";
          const context = (invokeError as { context?: unknown }).context;
          if (context instanceof Response) {
            try {
              const responseBody = await context.clone().json() as { error?: unknown };
              responseMessage = typeof responseBody.error === "string" ? responseBody.error : "";
            } catch {
              responseMessage = "";
            }
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
    } finally {
      setSaving(false);
    }
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
    if (error) {
      setToast({ msg: `Não foi possível excluir o funcionário: ${error.message}`, type: "error" });
      setDeleteId(null);
      return;
    }
    setToast({ msg: "Funcionário excluído.", type: "success" });
    setDeleteId(null);
    await refreshEmployees();
  };

  if (activeArea === "roles" && hasPermission("roles.view")) return <RolePermissionsPanel onBack={() => setActiveArea("users")} />;

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {deleteId && <ConfirmDialog message="Excluir este funcionário? Isso remove o registro do funcionário, sem afetar o fluxo de ativação/desativação do status." onConfirm={() => { void deleteEmployee(deleteId); }} onCancel={() => setDeleteId(null)} />}

      <PageHeader title="Equipes" subtitle="Cadastro e gestão dos funcionários da empresa" actions={<div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />{hasPermission("employees.create") && <BtnPrimary onClick={openNew}><Plus size={16} /> Novo funcionário</BtnPrimary>}</div>} />
      <div className="flex gap-1 border-b border-[#0d1b2e]/10"><button type="button" onClick={() => setActiveArea("users")} className={cn("px-4 py-2.5 text-xs font-bold border-b-2", activeArea === "users" ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82]")}>Usuários</button>{hasPermission("roles.view") && <button type="button" onClick={() => setActiveArea("roles")} className="px-4 py-2.5 text-xs font-bold border-b-2 border-transparent text-[#5a6a82]">Funções e Permissões</button>}</div>

      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        {employeesQuery.isPending ? <LoadingState /> : employees.length === 0 ? (
          <EmptyState icon={Users} title="Nenhum funcionário cadastrado" message="Cadastre o primeiro funcionário da equipe." onAdd={openNew} addLabel="Novo funcionário" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
                <tr>
                  <th className="px-4 py-3 text-left">Nome</th>
                  <th className="px-4 py-3 text-left">CPF</th>
                  <th className="px-4 py-3 text-left">Telefone</th>
                  <th className="px-4 py-3 text-left">Função</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0d1b2e]/5">
                {employees.map(emp => {
                  const active = emp.is_active !== false;
                  const role = Array.isArray(emp.role) ? emp.role[0] : emp.role;
                  return (
                    <tr key={emp.id} onClick={() => openEdit(emp)} className="hover:bg-[#f8fafc]/80 cursor-pointer">
                      <td className="px-4 py-3.5 font-bold text-[#0d1b2e]">{emp.full_name}</td>
                      <td className="px-4 py-3.5 text-xs font-mono text-[#5a6a82]">{formatCpf(emp.cpf)}</td>
                      <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{formatPhone(emp.phone) || "—"}</td>
                      <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{role?.name?.trim() || "Função não informada"}</td>
                      <td className="px-4 py-3.5"><StatusBadge status={active ? "Ativo" : "Inativo"} /></td>
                      <td className="px-4 py-3.5"><div className="flex justify-end gap-1">{hasPermission("employees.edit") && <button onClick={(event) => { event.stopPropagation(); openEdit(emp); }} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] rounded-lg" title="Editar"><Edit2 size={15} /></button>}{hasPermission("employees.edit") && <button onClick={(event) => { event.stopPropagation(); toggleActive(emp); }} className="p-1.5 text-[#5a6a82] hover:text-amber-600 rounded-lg" title={active ? "Desativar" : "Ativar"}>{active ? <CheckCircle size={15} /> : <AlertCircle size={15} />}</button>}{hasPermission("employees.delete") && <button onClick={(event) => { event.stopPropagation(); setDeleteId(emp.id); }} className="p-1.5 text-[#5a6a82] hover:text-red-600 rounded-lg" title="Excluir funcionário"><Trash2 size={15} /></button>}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <AdminPage open={formOpen} onClose={() => setFormOpen(false)} breadcrumb="Equipes" title={editItem ? editItem.full_name : "Novo funcionário"} subtitle={editItem ? "Atualize os dados do funcionário" : "Cadastre um funcionário da empresa"}>
        <div className="p-5 space-y-5"><Section title="Dados do funcionário"><div className="grid sm:grid-cols-2 gap-4"><FInput label="Nome completo" required value={form.full_name} onChange={(e: any) => setForm({ ...form, full_name: e.target.value })} /><FInput label="CPF" required value={formatCpf(form.cpf)} onChange={(e: any) => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" /><FInput label="Número / telefone" value={form.phone} onChange={(e: any) => setForm({ ...form, phone: e.target.value })} />{editItem ? <FInput label="Gmail" type="email" value={form.email} onChange={(e: any) => setForm({ ...form, email: e.target.value })} placeholder="usuario@gmail.com" /> : <FInput label="E-mail" type="email" required value={form.email} onChange={(e: any) => setForm({ ...form, email: e.target.value })} />} {editItem && <PasswordField key={`edit-${editItem.id}-${formOpen}`} label="Nova senha" value={form.password} onChange={value => setForm({ ...form, password: value })} placeholder="Deixe em branco para manter" resetKey={String(formOpen)} />}{!editItem && <PasswordField key={`create-${formOpen}`} label="Senha" required value={form.password} onChange={value => setForm({ ...form, password: value })} resetKey={String(formOpen)} />}<FSelect label="Função" required value={form.role_id} onChange={(e: any) => setForm({ ...form, role_id: e.target.value })} options={[{ value: "", label: "Selecionar função..." }, ...roles.map(role => ({ value: role.id, label: role.name }))]} /><div className="sm:col-span-2"><FToggle label="Funcionário ativo" checked={form.is_active} onChange={value => setForm({ ...form, is_active: value })} /></div></div></Section></div><div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3"><BtnSecondary onClick={() => setFormOpen(false)}>Cancelar</BtnSecondary>{(editItem ? hasPermission("employees.edit") : hasPermission("employees.create")) && <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : editItem ? "Salvar alterações" : "Salvar funcionário"}</BtnPrimary>}</div>
      </AdminPage>
    </div>
  );
}
