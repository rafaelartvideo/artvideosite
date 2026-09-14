import { useEffect, useMemo, useState } from "react";
import { Edit2, Plus, Search, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { normalizeSharedMapUrl } from "@/lib/address";
import { AdminCard, AdminIconButton, AdminPage, BtnPrimary, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { EmptyState, LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { AdminSelect, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { formatCnpj, formatCpf, formatPhone, isValidEmail, normalizeDigits } from "@/shared/domain/formatters";
import {
  emptyEmployeeAccessForm,
  type EmployeeAccessFormState,
} from "@/features/access/presentation/UserAccessSection";
import { UserPermissionOverridesPage } from "@/features/access/presentation/UserPermissionOverridesPage";
import { getEmployeeAccess, saveEmployeeAccess } from "@/features/access/infrastructure/user-access.repository";
import { useRegistrationLookups } from "../application/useRegistrationLookups";
import {
  activeRegistrationRoles,
  emptyRegistrationAddress,
  emptyRegistrationForm,
  registrationAddressPayload,
  registrationAddressesFromRecord,
  registrationEntityPayload,
  registrationFormFromRecord,
  validateRegistrationForm,
  type RegistrationAddressForm,
  type RegistrationFormState,
} from "../domain/registration-form";
import {
  getRegistration,
  getRegistrationSupplierItems,
  listRegistrations,
  saveRegistration,
  syncRegistrationAddresses,
  syncRegistrationSupplierItems,
  type Registration,
  type RegistrationRole,
  type SupplierInventoryItem,
} from "../infrastructure/registrations.repository";
import { RegistrationDetails } from "./RegistrationDetails";
import { RegistrationEditor } from "./RegistrationEditor";

type Props = {
  routeResourceId?: string | null;
  routeSubpage?: string | null;
  onRouteChange?: (resourceId?: string | null, subpage?: string | null) => void;
  onOpenCustomerHistory?: (customerId: string) => void;
};

const roleLabels: Record<RegistrationRole, string> = {
  customer: "Cliente",
  employee: "Funcionário",
  supplier: "Fornecedor",
};

function accessFormFromResponse(access: any): EmployeeAccessFormState {
  return {
    enabled: access?.enabled === true,
    email: String(access?.email || ""),
    password: "",
    role_id: String(access?.role_id || ""),
    uniq_subscriber_id: String(access?.uniq_subscriber_id || ""),
  };
}

function hasAddressContent(address: RegistrationAddressForm) {
  return Boolean([
    address.zip_code,
    address.street,
    address.number,
    address.complement,
    address.neighborhood,
    address.city,
    address.state,
    address.reference,
    address.shared_map_url,
  ].some(value => String(value || "").trim()));
}

export function TabRegistrations({ routeResourceId, routeSubpage, onRouteChange, onOpenCustomerHistory }: Props) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canView = hasPermission("customers.view");
  const canCreate = hasPermission("customers.create");
  const canEdit = hasPermission("customers.edit") || hasPermission("customers.update");
  const canViewAccess = hasPermission("employees.view") || hasPermission("roles.view");
  const canCreateAccess = hasPermission("employees.create");
  const canEditAccess = hasPermission("employees.edit");
  const canToggleAccess = hasPermission("employees.toggle_active");
  const canViewPermissionOverrides = hasPermission("roles.view");

  const [items, setItems] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordLoading, setRecordLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Registration | null>(null);
  const [form, setForm] = useState<RegistrationFormState>(emptyRegistrationForm());
  const [addresses, setAddresses] = useState<RegistrationAddressForm[]>([emptyRegistrationAddress(true)]);
  const [supplierItems, setSupplierItems] = useState<SupplierInventoryItem[]>([]);
  const [accessForm, setAccessForm] = useState<EmployeeAccessFormState>(emptyEmployeeAccessForm());
  const [accessExisting, setAccessExisting] = useState(false);
  const [accessDirty, setAccessDirty] = useState(false);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessUserId, setAccessUserId] = useState<string | null>(null);
  const [nameSearch, setNameSearch] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | RegistrationRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const lookups = useRegistrationLookups({
    organizationId: activeOrganizationId,
    registrationId: selected?.id,
    form,
    addresses,
    setForm,
    setAddresses,
  });

  const load = async () => {
    if (!activeOrganizationId || !canView) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await listRegistrations(activeOrganizationId);
    setLoading(false);
    if (error) {
      setToast({ msg: `Erro ao carregar cadastros: ${error.message}`, type: "error" });
      return;
    }
    setItems((data || []) as unknown as Registration[]);
  };

  const loadAccess = async (registration: Registration | null) => {
    const employeeId = registration?.legacy_employee_id;
    setAccessDirty(false);
    if (!activeOrganizationId || !employeeId || !canViewAccess) {
      setAccessExisting(false);
      setAccessUserId(registration?.employee_details?.[0]?.profile_id || null);
      setAccessForm(emptyEmployeeAccessForm());
      return;
    }
    setAccessLoading(true);
    const { data, error } = await getEmployeeAccess(activeOrganizationId, employeeId);
    setAccessLoading(false);
    if (error || !data?.access) {
      setAccessExisting(Boolean(registration.employee_details?.[0]?.profile_id));
      setAccessUserId(registration.employee_details?.[0]?.profile_id || null);
      if (error) setToast({ msg: `Erro ao carregar acesso do funcionário: ${error.message}`, type: "error" });
      return;
    }
    setAccessExisting(Boolean(data.access.profile_id));
    setAccessUserId(data.access.user_id || data.access.profile_id || null);
    setAccessForm(accessFormFromResponse(data.access));
  };

  const loadSupplierItems = async (registration: Registration | null) => {
    if (!activeOrganizationId || !registration || !activeRegistrationRoles(registration).includes("supplier")) {
      setSupplierItems([]);
      return;
    }
    const { data, error } = await getRegistrationSupplierItems(activeOrganizationId, registration.id);
    if (error) {
      setToast({ msg: `Erro ao carregar itens do fornecedor: ${error.message}`, type: "error" });
      return;
    }
    setSupplierItems(data || []);
  };

  const hydrateRegistration = async (registration: Registration) => {
    setSelected(registration);
    setForm(registrationFormFromRecord(registration));
    setAddresses(registrationAddressesFromRecord(registration));
    await Promise.all([loadAccess(registration), loadSupplierItems(registration)]);
  };

  useEffect(() => { void load(); }, [activeOrganizationId, canView]);

  const editorOpen = routeResourceId === "new" || Boolean(routeResourceId && routeSubpage === "edit");
  const permissionsOpen = Boolean(routeResourceId && routeSubpage === "permissions");

  useEffect(() => {
    let cancelled = false;
    const hydrateRoute = async () => {
      if (!activeOrganizationId || !routeResourceId || routeSubpage === "customer") return;
      if (routeResourceId === "new") {
        setSelected(null);
        setForm(emptyRegistrationForm());
        setAddresses([emptyRegistrationAddress(true)]);
        setSupplierItems([]);
        setAccessForm(emptyEmployeeAccessForm());
        setAccessExisting(false);
        setAccessUserId(null);
        setAccessDirty(false);
        return;
      }

      const fromList = items.find(item => item.id === routeResourceId);
      if (fromList) {
        if (!cancelled) await hydrateRegistration(fromList);
        return;
      }

      setRecordLoading(true);
      const { data, error } = await getRegistration(activeOrganizationId, routeResourceId);
      setRecordLoading(false);
      if (cancelled) return;
      if (error || !data) {
        setToast({ msg: `Cadastro não encontrado${error ? `: ${error.message}` : "."}`, type: "error" });
        return;
      }
      await hydrateRegistration(data as unknown as Registration);
    };
    void hydrateRoute();
    return () => { cancelled = true; };
  }, [activeOrganizationId, routeResourceId, routeSubpage, items, canViewAccess]);

  const filtered = useMemo(() => {
    const nameQuery = nameSearch.trim().toLocaleLowerCase("pt-BR");
    const documentQuery = documentSearch.trim().toLocaleLowerCase("pt-BR");
    const documentDigits = normalizeDigits(documentSearch);
    return items.filter(item => {
      const roles = activeRegistrationRoles(item);
      if (roleFilter !== "all" && !roles.includes(roleFilter)) return false;
      if (statusFilter === "active" && item.is_active === false) return false;
      if (statusFilter === "inactive" && item.is_active !== false) return false;

      if (nameQuery) {
        const names = [item.name, item.legal_name, item.trade_name]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("pt-BR");
        if (!names.includes(nameQuery)) return false;
      }

      if (documentQuery) {
        const rawDocument = String(item.document || "");
        const formattedDocument = item.person_type === "PJ" ? formatCnpj(rawDocument) : formatCpf(rawDocument);
        const textMatch = formattedDocument.toLocaleLowerCase("pt-BR").includes(documentQuery) || rawDocument.toLocaleLowerCase("pt-BR").includes(documentQuery);
        const digitsMatch = Boolean(documentDigits && normalizeDigits(rawDocument).includes(documentDigits));
        if (!textMatch && !digitsMatch) return false;
      }

      return true;
    });
  }, [items, nameSearch, documentSearch, roleFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { setPage(1); }, [nameSearch, documentSearch, roleFilter, statusFilter, pageSize]);

  const toggleRole = (role: RegistrationRole) => {
    const allowed = selected ? canEdit : canCreate;
    if (!allowed) return;
    const removingSupplier = role === "supplier" && form.roles.includes("supplier");
    if (removingSupplier) setSupplierItems([]);
    setForm(current => {
      const exists = current.roles.includes(role);
      return {
        ...current,
        roles: exists ? current.roles.filter(item => item !== role) : [...current.roles, role],
        person_type: role === "employee" && !exists ? "PF" : current.person_type,
      };
    });
  };

  const updateAccess = (next: EmployeeAccessFormState) => {
    setAccessDirty(true);
    setAccessForm(next);
  };

  const validateAccess = () => {
    if (!form.roles.includes("employee") || !accessDirty) return null;
    if (accessExisting && !canEditAccess) return "Você não possui permissão para editar o acesso deste funcionário.";
    if (!accessExisting && accessForm.enabled && !canCreateAccess) return "Você não possui permissão para criar acesso ao sistema.";
    if (accessExisting && accessForm.enabled !== true && !canToggleAccess) return "Você não possui permissão para desativar este acesso.";
    if (!accessForm.enabled) return null;
    if (!accessForm.email.trim() || !isValidEmail(accessForm.email)) return "Informe um e-mail de acesso válido.";
    if (!accessForm.role_id) return "Selecione a função do acesso ao sistema.";
    if (!accessExisting && accessForm.password.length < 8) return "A senha do novo acesso deve ter pelo menos 8 caracteres.";
    if (accessExisting && accessForm.password && accessForm.password.length < 8) return "A nova senha deve ter pelo menos 8 caracteres.";
    return null;
  };

  const save = async () => {
    if (!activeOrganizationId || saving) return;
    const validation = validateRegistrationForm(form) || validateAccess();
    if (validation) {
      setToast({ msg: validation, type: "error" });
      return;
    }

    const removingEmployeeWithAccess = Boolean(selected && activeRegistrationRoles(selected).includes("employee") && !form.roles.includes("employee") && accessExisting && accessForm.enabled);
    if (removingEmployeeWithAccess && (!canEditAccess || !canToggleAccess)) {
      setToast({ msg: "Desative o acesso ao sistema antes de remover o vínculo Funcionário.", type: "error" });
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await saveRegistration({
        id: selected?.id || null,
        organizationId: activeOrganizationId,
        entity: registrationEntityPayload(form),
        roles: form.roles,
        employee: form.roles.includes("employee") ? { job_title: form.job_title, team_name: form.team_name, admission_date: form.admission_date } : {},
      });
      if (error || !data) throw error || new Error("Cadastro não retornado após salvar.");

      const savedId = String(data);
      const addressPayloads = addresses.filter(hasAddressContent).map(address => registrationAddressPayload({
        ...address,
        shared_map_url: normalizeSharedMapUrl(address.shared_map_url),
      }));
      const addressResult = await syncRegistrationAddresses(activeOrganizationId, savedId, addressPayloads);
      if (addressResult.error) throw addressResult.error;

      const supplierResult = await syncRegistrationSupplierItems(activeOrganizationId, savedId, form.roles.includes("supplier") ? supplierItems.map(item => item.id) : []);
      if (supplierResult.error) throw supplierResult.error;

      let { data: refreshedData, error: refreshedError } = await getRegistration(activeOrganizationId, savedId);
      if (refreshedError || !refreshedData) throw refreshedError || new Error("Não foi possível recarregar o cadastro salvo.");
      let refreshed = refreshedData as unknown as Registration;

      if (form.roles.includes("employee") && refreshed.legacy_employee_id && accessDirty) {
        const result = await saveEmployeeAccess({
          organizationId: activeOrganizationId,
          employeeId: refreshed.legacy_employee_id,
          enabled: accessForm.enabled,
          email: accessForm.email,
          password: accessForm.password,
          roleId: accessForm.role_id,
          uniqSubscriberId: accessForm.uniq_subscriber_id,
        });
        if (result.error) throw result.error;
      } else if (!form.roles.includes("employee") && refreshed.legacy_employee_id && removingEmployeeWithAccess) {
        const result = await saveEmployeeAccess({
          organizationId: activeOrganizationId,
          employeeId: refreshed.legacy_employee_id,
          enabled: false,
          email: accessForm.email,
          roleId: accessForm.role_id,
          uniqSubscriberId: accessForm.uniq_subscriber_id,
        });
        if (result.error) throw result.error;
      }

      if (accessDirty || removingEmployeeWithAccess) {
        const refreshedAgain = await getRegistration(activeOrganizationId, savedId);
        if (!refreshedAgain.error && refreshedAgain.data) refreshed = refreshedAgain.data as unknown as Registration;
      }

      setToast({ msg: selected ? "Cadastro atualizado." : "Cadastro criado.", type: "success" });
      await load();
      await hydrateRegistration(refreshed);
      onRouteChange?.(savedId, null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLocaleLowerCase("pt-BR").includes("cadastro já existente")) {
        if (form.person_type === "PF") lookups.setCpfError(message);
        else lookups.setCnpjError(message);
      } else {
        setToast({ msg: `Erro ao salvar cadastro: ${message}`, type: "error" });
      }
    } finally {
      setSaving(false);
    }
  };

  const openNew = () => {
    setSelected(null);
    setForm(emptyRegistrationForm());
    setAddresses([emptyRegistrationAddress(true)]);
    setSupplierItems([]);
    setAccessForm(emptyEmployeeAccessForm());
    setAccessExisting(false);
    setAccessDirty(false);
    setAccessUserId(null);
    onRouteChange?.("new", "edit");
  };

  const openItem = (item: Registration) => { void hydrateRegistration(item); onRouteChange?.(item.id, null); };
  const closeEditor = () => selected ? onRouteChange?.(selected.id, null) : onRouteChange?.(null, null);
  const closeDetail = () => { setSelected(null); onRouteChange?.(null, null); };

  if (!canView) return null;

  if (permissionsOpen) {
    if (recordLoading || !selected) return <AdminPage open onClose={() => onRouteChange?.(routeResourceId, null)} breadcrumb="Cadastros" title="Carregando acessos"><LoadingState /></AdminPage>;
    const userId = accessUserId || selected.employee_details?.[0]?.profile_id || null;
    if (!userId || !activeOrganizationId || !canViewPermissionOverrides) {
      return <AdminPage open onClose={() => onRouteChange?.(selected.id, null)} breadcrumb="Cadastros > Acessos e Permissões" title={selected.name} subtitle="Este funcionário ainda não possui um acesso ao sistema vinculado." />;
    }
    return <UserPermissionOverridesPage organizationId={activeOrganizationId} userId={userId} registrationName={selected.name} onClose={() => onRouteChange?.(selected.id, null)} />;
  }

  if (editorOpen) {
    const creating = routeResourceId === "new";
    if (!creating && (recordLoading || !selected)) return <AdminPage open onClose={closeEditor} breadcrumb="Cadastros" title="Carregando cadastro"><LoadingState /></AdminPage>;
    return <>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <RegistrationEditor
        creating={creating}
        form={form}
        setForm={setForm}
        addresses={addresses}
        setAddresses={setAddresses}
        supplierItems={supplierItems}
        setSupplierItems={setSupplierItems}
        organizationId={activeOrganizationId}
        canModify={creating ? canCreate : canEdit}
        accessForm={accessForm}
        onAccessChange={updateAccess}
        accessExisting={accessExisting}
        accessLoading={accessLoading}
        canModifyAccess={accessExisting ? canEditAccess : canCreateAccess}
        lookups={lookups}
        saving={saving}
        onSave={() => void save()}
        onClose={closeEditor}
        onToggleRole={toggleRole}
      />
    </>;
  }

  if (selected && routeResourceId) {
    const permissionUserId = accessUserId || selected.employee_details?.[0]?.profile_id || null;
    return <>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <RegistrationDetails
        selected={selected}
        supplierItems={supplierItems}
        accessForm={accessForm}
        accessExisting={accessExisting}
        accessLoading={accessLoading}
        permissionUserId={permissionUserId}
        canViewAccess={canViewAccess}
        canViewPermissionOverrides={canViewPermissionOverrides}
        canEdit={canEdit}
        onClose={closeDetail}
        onEdit={() => onRouteChange?.(selected.id, "edit")}
        onOpenCustomerHistory={onOpenCustomerHistory}
        onOpenPermissions={() => onRouteChange?.(selected.id, "permissions")}
      />
    </>;
  }

  if (routeResourceId && recordLoading) return <LoadingState text="Carregando cadastro..." />;

  return <div className="space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader title="Cadastros" subtitle="Gerencie clientes, funcionários e fornecedores em um único cadastro." actions={canCreate ? <BtnPrimary onClick={openNew}><Plus size={16} /> Novo cadastro</BtnPrimary> : undefined} />
    <AdminCard className="p-4">
      <div className="mb-3">
        <h3 className="text-sm font-black text-[#0d1b2e]">Buscar cadastro</h3>
        <p className="mt-0.5 text-xs text-[#5a6a82]">Use os campos separadamente para localizar o cadastro.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="min-w-0">
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Nome</label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a98aa]" />
            <input value={nameSearch} onChange={event => setNameSearch(event.target.value)} placeholder="Nome / Razão social" className={`${INPUT} pl-9`} />
          </div>
        </div>
        <div className="min-w-0">
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">CPF/CNPJ</label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a98aa]" />
            <input value={documentSearch} onChange={event => setDocumentSearch(event.target.value)} placeholder="CPF ou CNPJ" inputMode="numeric" className={`${INPUT} pl-9`} />
          </div>
        </div>
        <div className="min-w-0">
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Vínculo</label>
          <AdminSelect value={roleFilter} onValueChange={value => setRoleFilter(value as "all" | RegistrationRole)} ariaLabel="Vínculo" options={[{ value: "all", label: "Todos os vínculos" }, { value: "customer", label: "Clientes" }, { value: "employee", label: "Funcionários" }, { value: "supplier", label: "Fornecedores" }]} />
        </div>
        <div className="min-w-0">
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Status</label>
          <AdminSelect value={statusFilter} onValueChange={value => setStatusFilter(value as "all" | "active" | "inactive")} ariaLabel="Status" options={[{ value: "all", label: "Todos os status" }, { value: "active", label: "Ativos" }, { value: "inactive", label: "Inativos" }]} />
        </div>
      </div>
    </AdminCard>
    <AdminCard>{loading ? <LoadingState /> : filtered.length === 0 ? <EmptyState icon={Users} title="Nenhum cadastro encontrado" message="Crie um cadastro ou ajuste os filtros." onAdd={canCreate ? openNew : undefined} addLabel="Novo cadastro" /> : <><div className="overflow-x-auto"><table className="min-w-[820px]"><thead><tr><th className="text-left">Nome / Razão social</th><th className="text-left">Tipo</th><th className="text-left">Vínculos</th><th className="text-left">CPF/CNPJ</th><th className="text-left">Telefone</th><th className="text-left">Status</th><th className="text-right">Ações</th></tr></thead><tbody>{paged.map(item => <tr key={item.id} className="cursor-default" onClick={() => openItem(item)}><td className="font-bold text-[#0d1b2e]">{item.name}</td><td className="text-xs text-[#5a6a82]">{item.person_type === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}</td><td><div className="flex flex-wrap gap-1">{activeRegistrationRoles(item).map(role => <span key={role} className="rounded-full bg-[#eaf2ff] px-2 py-1 text-[10px] font-black text-[#0057e7]">{roleLabels[role]}</span>)}</div></td><td className="font-mono text-xs text-[#5a6a82]">{item.document ? item.person_type === "PJ" ? formatCnpj(item.document) : formatCpf(item.document) : "—"}</td><td className="text-xs text-[#5a6a82]">{formatPhone(item.phone || item.whatsapp) || "—"}</td><td><StatusBadge status={item.is_active ? "Ativo" : "Inativo"} /></td><td><div className="flex justify-end" onClick={event => event.stopPropagation()}><AdminIconButton ariaLabel="Abrir cadastro" title="Abrir cadastro" onClick={() => openItem(item)}><Edit2 size={15} /></AdminIconButton></div></td></tr>)}</tbody></table></div><PaginationBar page={safePage} pageSize={pageSize} totalItems={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} /></>}</AdminCard>
  </div>;
}
