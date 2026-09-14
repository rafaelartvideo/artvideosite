import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Edit2,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getAddressMapUrl, normalizeSharedMapUrl, type Address } from "@/lib/address";
import { AddressFields } from "@/shared/ui/address/AddressFields";
import {
  AdminCard,
  AdminIconButton,
  AdminPage,
  BtnPrimary,
  BtnSecondary,
  PageHeader,
  Section,
} from "@/shared/ui/admin/AdminLayout";
import { EmptyState, LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import {
  FBrazilianDateInput,
  FCnpjInput,
  FCpfInput,
  FEmailInput,
  FInput,
  FPhoneInput,
  INPUT,
} from "@/shared/ui/admin/AdminFormControls";
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import {
  formatCnpj,
  formatCpf,
  formatDateOnly,
  formatPhone,
  isValidEmail,
  normalizeDigits,
} from "@/shared/domain/formatters";
import {
  emptyEmployeeAccessForm,
  UserAccessSection,
  type EmployeeAccessFormState,
} from "@/features/access/presentation/UserAccessSection";
import { UserPermissionOverridesPage } from "@/features/access/presentation/UserPermissionOverridesPage";
import {
  getEmployeeAccess,
  saveEmployeeAccess,
} from "@/features/access/infrastructure/user-access.repository";
import { useRegistrationLookups } from "../application/useRegistrationLookups";
import {
  activeRegistrationRoles,
  emptyRegistrationAddress,
  emptyRegistrationForm,
  primaryRegistrationAddress,
  registrationAddressFromRecord,
  registrationAddressPayload,
  registrationDisplayName,
  registrationEntityPayload,
  registrationFormFromRecord,
  validateRegistrationForm,
  type RegistrationFormState,
} from "../domain/registration-form";
import {
  getRegistration,
  listRegistrations,
  saveRegistration,
  type Registration,
  type RegistrationRole,
} from "../infrastructure/registrations.repository";

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

const roleIcons: Record<RegistrationRole, typeof Users> = {
  customer: UserRound,
  employee: Users,
  supplier: Building2,
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

function detailValue(label: string, value: string) {
  return <div key={label} className="min-w-0">
    <div className="text-[10px] font-black uppercase tracking-wider text-[#8a98aa]">{label}</div>
    <div className="mt-1 break-words text-sm font-bold text-[#0d1b2e]">{value || "—"}</div>
  </div>;
}

export function TabRegistrations({
  routeResourceId,
  routeSubpage,
  onRouteChange,
  onOpenCustomerHistory,
}: Props) {
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
  const [address, setAddress] = useState<Address>(emptyRegistrationAddress());
  const [accessForm, setAccessForm] = useState<EmployeeAccessFormState>(emptyEmployeeAccessForm());
  const [accessExisting, setAccessExisting] = useState(false);
  const [accessDirty, setAccessDirty] = useState(false);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessUserId, setAccessUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | RegistrationRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const lookups = useRegistrationLookups({
    organizationId: activeOrganizationId,
    registrationId: selected?.id,
    form,
    address,
    setForm,
    setAddress,
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

  const hydrateRegistration = async (registration: Registration) => {
    setSelected(registration);
    setForm(registrationFormFromRecord(registration));
    setAddress(registrationAddressFromRecord(registration));
    await loadAccess(registration);
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
        setAddress(emptyRegistrationAddress());
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
    const query = search.trim().toLocaleLowerCase("pt-BR");
    const digits = normalizeDigits(search);
    return items.filter(item => {
      const roles = activeRegistrationRoles(item);
      if (roleFilter !== "all" && !roles.includes(roleFilter)) return false;
      if (statusFilter === "active" && item.is_active === false) return false;
      if (statusFilter === "inactive" && item.is_active !== false) return false;
      if (!query) return true;
      const text = [
        item.name,
        item.legal_name,
        item.trade_name,
        item.email,
        item.phone,
        item.whatsapp,
        item.document,
      ].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
      return text.includes(query) || Boolean(digits && normalizeDigits(item.document).includes(digits));
    });
  }, [items, search, roleFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { setPage(1); }, [search, roleFilter, statusFilter, pageSize]);

  const toggleRole = (role: RegistrationRole) => {
    const allowed = selected ? canEdit : canCreate;
    if (!allowed) return;
    setForm(current => {
      const exists = current.roles.includes(role);
      const roles = exists ? current.roles.filter(item => item !== role) : [...current.roles, role];
      return {
        ...current,
        roles,
        person_type: role === "employee" && !exists ? "PF" : current.person_type,
      };
    });
  };

  const updateAccess = (next: EmployeeAccessFormState) => {
    setAccessDirty(true);
    setAccessForm(next);
  };

  const validateAccess = () => {
    if (!form.roles.includes("employee")) return null;
    if (!accessDirty) return null;
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

    const removingEmployeeWithAccess = Boolean(
      selected
      && activeRegistrationRoles(selected).includes("employee")
      && !form.roles.includes("employee")
      && accessExisting
      && accessForm.enabled,
    );
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
        employee: form.roles.includes("employee")
          ? { job_title: form.job_title, team_name: form.team_name, admission_date: form.admission_date }
          : {},
        address: registrationAddressPayload({
          ...address,
          shared_map_url: normalizeSharedMapUrl(address.shared_map_url),
        }),
      });
      if (error || !data) throw error || new Error("Cadastro não retornado após salvar.");

      const savedId = String(data);
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
      setToast({ msg: `Erro ao salvar cadastro: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const openNew = () => {
    setSelected(null);
    setForm(emptyRegistrationForm());
    setAddress(emptyRegistrationAddress());
    setAccessForm(emptyEmployeeAccessForm());
    setAccessExisting(false);
    setAccessDirty(false);
    setAccessUserId(null);
    onRouteChange?.("new", "edit");
  };
  const openItem = (item: Registration) => {
    void hydrateRegistration(item);
    onRouteChange?.(item.id, null);
  };
  const openEdit = () => selected && onRouteChange?.(selected.id, "edit");
  const closeEditor = () => selected ? onRouteChange?.(selected.id, null) : onRouteChange?.(null, null);
  const closeDetail = () => { setSelected(null); onRouteChange?.(null, null); };
  const openPermissions = () => selected && onRouteChange?.(selected.id, "permissions");

  if (!canView) return null;

  if (permissionsOpen) {
    if (recordLoading || !selected) {
      return <AdminPage open onClose={() => onRouteChange?.(routeResourceId, null)} breadcrumb="Cadastros" title="Carregando acessos"><LoadingState /></AdminPage>;
    }
    const userId = accessUserId || selected.employee_details?.[0]?.profile_id || null;
    if (!userId || !activeOrganizationId || !canViewPermissionOverrides) {
      return <AdminPage open onClose={() => onRouteChange?.(selected.id, null)} breadcrumb="Cadastros > Acessos e Permissões" title={selected.name} subtitle="Este funcionário ainda não possui um acesso ao sistema vinculado.">
        <div className="p-5"><BtnSecondary onClick={() => onRouteChange?.(selected.id, null)}>Voltar ao cadastro</BtnSecondary></div>
      </AdminPage>;
    }
    return <UserPermissionOverridesPage
      organizationId={activeOrganizationId}
      userId={userId}
      registrationName={selected.name}
      onClose={() => onRouteChange?.(selected.id, null)}
    />;
  }

  if (editorOpen) {
    const creating = routeResourceId === "new";
    if (!creating && (recordLoading || !selected)) {
      return <AdminPage open onClose={closeEditor} breadcrumb="Cadastros" title="Carregando cadastro"><LoadingState /></AdminPage>;
    }
    const canModifyAccess = accessExisting ? canEditAccess : canCreateAccess;
    return <AdminPage
      open
      onClose={closeEditor}
      breadcrumb="Cadastros"
      title={creating ? "Novo cadastro" : registrationDisplayName(form) || "Editar cadastro"}
      subtitle={creating ? "Cadastre uma pessoa ou empresa e defina seus vínculos." : "Atualize dados funcionais, endereço e acesso quando permitido."}
      maxW="max-w-6xl"
    >
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <div className="space-y-5 p-4 sm:p-5">
        <Section title="Tipo e vínculos">
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" disabled={!(creating ? canCreate : canEdit)} onClick={() => setForm(current => ({ ...current, person_type: "PF" }))} className={`rounded-xl border p-4 text-left disabled:opacity-50 ${form.person_type === "PF" ? "border-[#0057e7] bg-[#0057e7]/5" : "border-[#d9e1ec] bg-white"}`}>
              <div className="font-black text-[#0d1b2e]">Pessoa Física</div><div className="mt-1 text-xs text-[#5a6a82]">CPF, nascimento e contatos.</div>
            </button>
            <button type="button" disabled={form.roles.includes("employee") || !(creating ? canCreate : canEdit)} onClick={() => setForm(current => ({ ...current, person_type: "PJ" }))} className={`rounded-xl border p-4 text-left disabled:opacity-40 ${form.person_type === "PJ" ? "border-[#0057e7] bg-[#0057e7]/5" : "border-[#d9e1ec] bg-white"}`}>
              <div className="font-black text-[#0d1b2e]">Pessoa Jurídica</div><div className="mt-1 text-xs text-[#5a6a82]">CNPJ e dados empresariais.</div>
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">{(["customer", "employee", "supplier"] as RegistrationRole[]).map(role => {
            const Icon = roleIcons[role];
            const checked = form.roles.includes(role);
            return <button key={role} type="button" disabled={!(creating ? canCreate : canEdit)} onClick={() => toggleRole(role)} className={`flex items-center gap-3 rounded-xl border p-3 text-left disabled:opacity-40 ${checked ? "border-[#0057e7] bg-[#0057e7]/5" : "border-[#d9e1ec] bg-white"}`}>
              <Checkbox checked={checked} tabIndex={-1} /><Icon size={17} className="text-[#0057e7]" /><span className="text-sm font-bold text-[#0d1b2e]">{roleLabels[role]}</span>
            </button>;
          })}</div>
        </Section>

        <Section title="Informações">
          <div className="grid gap-4 sm:grid-cols-2">
            {form.person_type === "PF" ? <>
              <div><FCpfInput label="CPF" required value={form.document} onChange={(event: any) => { setForm(current => ({ ...current, document: event.target.value })); lookups.setCpfError(""); }} />
                <div className="mt-2 flex items-center gap-2"><BtnSecondary onClick={() => void lookups.lookupCpfName()} disabled={lookups.cpfLoading}>{lookups.cpfLoading ? "Consultando..." : "Consultar CPF"}</BtnSecondary>{lookups.cpfError && <span className="text-xs font-semibold text-red-600">{lookups.cpfError}</span>}</div>
              </div>
              <FInput label="Nome completo" required value={form.name} onChange={(event: any) => setForm(current => ({ ...current, name: event.target.value }))} />
              <FBrazilianDateInput label="Data de nascimento" required value={form.birth_date} onChange={(event: any) => setForm(current => ({ ...current, birth_date: event.target.value }))} />
            </> : <>
              <div><FCnpjInput label="CNPJ" required value={form.document} onChange={(event: any) => { setForm(current => ({ ...current, document: event.target.value })); lookups.setCnpjMessage(""); }} />
                <div className="mt-2 flex items-center gap-2"><BtnSecondary onClick={() => void lookups.lookupCnpj()} disabled={lookups.cnpjLoading}>{lookups.cnpjLoading ? "Consultando..." : "Consultar CNPJ"}</BtnSecondary>{lookups.cnpjMessage && <span className="text-xs font-semibold text-[#5a6a82]">{lookups.cnpjMessage}</span>}</div>
              </div>
              <FInput label="Nome fantasia" required value={form.trade_name} onChange={(event: any) => setForm(current => ({ ...current, trade_name: event.target.value }))} />
              <FInput label="Razão social" value={form.legal_name} onChange={(event: any) => setForm(current => ({ ...current, legal_name: event.target.value }))} />
              <FInput label="Inscrição estadual" value={form.state_registration} onChange={(event: any) => setForm(current => ({ ...current, state_registration: event.target.value }))} />
              <FBrazilianDateInput label="Data de fundação" value={form.foundation_date} onChange={(event: any) => setForm(current => ({ ...current, foundation_date: event.target.value }))} />
            </>}
            <FPhoneInput label="Telefone" value={form.phone} onChange={(event: any) => setForm(current => ({ ...current, phone: event.target.value }))} />
            <FPhoneInput label="WhatsApp" mobile value={form.whatsapp} onChange={(event: any) => setForm(current => ({ ...current, whatsapp: event.target.value }))} />
            <div className="sm:col-span-2"><FEmailInput label="E-mail" value={form.email} onChange={(event: any) => setForm(current => ({ ...current, email: event.target.value }))} /></div>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm font-bold text-[#0d1b2e]"><Checkbox checked={form.is_active} onCheckedChange={checked => setForm(current => ({ ...current, is_active: checked === true }))} /> Cadastro ativo</label>
        </Section>

        {form.roles.includes("employee") && <Section title="Funcionário">
          <div className="grid gap-4 sm:grid-cols-3">
            <FInput label="Cargo" value={form.job_title} onChange={(event: any) => setForm(current => ({ ...current, job_title: event.target.value }))} />
            <FInput label="Setor" value={form.team_name} onChange={(event: any) => setForm(current => ({ ...current, team_name: event.target.value }))} />
            <FInput label="Data de admissão" type="date" value={form.admission_date} onChange={(event: any) => setForm(current => ({ ...current, admission_date: event.target.value }))} />
          </div>
        </Section>}

        <Section title="Endereço principal">
          <AddressFields value={address} onChange={setAddress} inputClassName={INPUT} />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FInput label="Referência" value={address.reference || ""} onChange={(event: any) => setAddress(current => ({ ...current, reference: event.target.value }))} />
            <FInput label="Link de localização" type="url" placeholder="Google Maps, Waze, Apple Maps..." value={address.shared_map_url || ""} onChange={(event: any) => setAddress(current => ({ ...current, shared_map_url: event.target.value }))} />
          </div>
        </Section>

        {form.roles.includes("employee") && (canViewAccess || canCreateAccess || canEditAccess) && <UserAccessSection
          organizationId={activeOrganizationId}
          value={accessForm}
          onChange={updateAccess}
          existingAccess={accessExisting}
          disabled={!canModifyAccess}
          loading={accessLoading}
        />}
      </div>
      <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-[#0d1b2e]/8 bg-white/95 px-4 py-4 backdrop-blur sm:px-5">
        <BtnSecondary onClick={closeEditor}>Cancelar</BtnSecondary>
        <BtnPrimary disabled={creating ? !canCreate : !canEdit} onClick={() => void save()} loading={saving} loadingText="Salvando...">{creating ? "Criar cadastro" : "Salvar alterações"}</BtnPrimary>
      </div>
    </AdminPage>;
  }

  if (selected && routeResourceId) {
    const roles = activeRegistrationRoles(selected);
    const primaryAddress = primaryRegistrationAddress(selected);
    const mapUrl = getAddressMapUrl(primaryAddress ? {
      zip_code: primaryAddress.zip_code || "",
      street: primaryAddress.street || "",
      number: primaryAddress.number || "",
      complement: primaryAddress.complement || "",
      neighborhood: primaryAddress.neighborhood || "",
      city: primaryAddress.city || "",
      state: primaryAddress.state || "",
      shared_map_url: primaryAddress.location_url || "",
    } : null);
    const employee = selected.employee_details?.[0];
    const permissionUserId = accessUserId || employee?.profile_id || null;

    return <AdminPage open onClose={closeDetail} breadcrumb="Cadastros" title={selected.name} subtitle={selected.person_type === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"} maxW="max-w-6xl">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <div className="space-y-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">{roles.map(role => <span key={role} className="rounded-full bg-[#eaf2ff] px-3 py-1 text-xs font-black text-[#0057e7]">{roleLabels[role]}</span>)}<StatusBadge status={selected.is_active ? "Ativo" : "Inativo"} /></div>

        <Section title="Informações"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {detailValue(selected.person_type === "PJ" ? "CNPJ" : "CPF", selected.document ? (selected.person_type === "PJ" ? formatCnpj(selected.document) : formatCpf(selected.document)) : "—")}
          {detailValue("Telefone", formatPhone(selected.phone) || "—")}
          {detailValue("WhatsApp", formatPhone(selected.whatsapp) || "—")}
          {detailValue("E-mail", selected.email || "—")}
          {selected.person_type === "PJ" ? <>{detailValue("Nome fantasia", selected.trade_name || selected.name || "—")}{detailValue("Razão social", selected.legal_name || "—")}{detailValue("Inscrição estadual", selected.state_registration || "—")}{detailValue("Fundação", formatDateOnly(selected.foundation_date, "—"))}</> : detailValue("Nascimento", formatDateOnly(selected.birth_date, "—"))}
        </div></Section>

        {roles.includes("employee") && <Section title="Funcionário"><div className="grid gap-4 sm:grid-cols-3">
          {detailValue("Cargo", employee?.job_title || "—")}
          {detailValue("Setor", employee?.team_name || "—")}
          {detailValue("Admissão", formatDateOnly(employee?.admission_date, "—"))}
        </div></Section>}

        {roles.includes("employee") && canViewAccess && <Section title="Acesso ao sistema">
          {accessLoading ? <LoadingState text="Carregando acesso..." /> : <div className="grid gap-4 sm:grid-cols-3">
            {detailValue("Status", accessExisting ? (accessForm.enabled ? "Habilitado" : "Bloqueado") : "Sem login")}
            {detailValue("E-mail de acesso", accessForm.email || "—")}
            {detailValue("Função vinculada", accessForm.role_id ? "Configurada" : "—")}
          </div>}
        </Section>}

        <Section title="Endereço" actions={mapUrl ? <a href={mapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-[#0057e7]/25 bg-white px-3 py-2 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5"><MapPin size={13} /> Abrir mapa</a> : undefined}>
          {primaryAddress ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {detailValue("CEP", primaryAddress.zip_code || "—")}
            {detailValue("Rua", primaryAddress.street || "—")}
            {detailValue("Número", primaryAddress.number || "—")}
            {detailValue("Complemento", primaryAddress.complement || "—")}
            {detailValue("Bairro", primaryAddress.neighborhood || "—")}
            {detailValue("Cidade / UF", [primaryAddress.city, primaryAddress.state].filter(Boolean).join(" / ") || "—")}
            {detailValue("Referência", primaryAddress.reference || "—")}
          </div> : <p className="text-sm text-[#5a6a82]">Nenhum endereço cadastrado.</p>}
        </Section>
      </div>
      <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-[#0d1b2e]/8 bg-white/95 px-4 py-4 backdrop-blur sm:px-5">
        <BtnSecondary onClick={closeDetail}>Fechar</BtnSecondary>
        {roles.includes("customer") && selected.legacy_customer_id && onOpenCustomerHistory && <BtnSecondary onClick={() => onOpenCustomerHistory(selected.legacy_customer_id!)}>Ficha do cliente</BtnSecondary>}
        {roles.includes("employee") && permissionUserId && canViewPermissionOverrides && <BtnSecondary onClick={openPermissions}><ShieldCheck size={15} /> Acessos e permissões</BtnSecondary>}
        {canEdit && <BtnPrimary onClick={openEdit}><Edit2 size={15} /> Editar cadastro</BtnPrimary>}
      </div>
    </AdminPage>;
  }

  if (routeResourceId && recordLoading) {
    return <LoadingState text="Carregando cadastro..." />;
  }

  return <div className="space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader title="Cadastros" subtitle="Gerencie clientes, funcionários e fornecedores em um único cadastro." actions={canCreate ? <BtnPrimary onClick={openNew}><Plus size={16} /> Novo cadastro</BtnPrimary> : undefined} />
    <AdminCard className="p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px_170px]">
        <label className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a98aa]" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome, CPF/CNPJ, telefone ou e-mail" className={`${INPUT} pl-9`} /></label>
        <select value={roleFilter} onChange={event => setRoleFilter(event.target.value as any)} className={INPUT}><option value="all">Todos os vínculos</option><option value="customer">Clientes</option><option value="employee">Funcionários</option><option value="supplier">Fornecedores</option></select>
        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as any)} className={INPUT}><option value="all">Todos os status</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select>
      </div>
    </AdminCard>
    <AdminCard>{loading ? <LoadingState /> : filtered.length === 0 ? <EmptyState icon={Users} title="Nenhum cadastro encontrado" message="Crie um cadastro ou ajuste os filtros." onAdd={canCreate ? openNew : undefined} addLabel="Novo cadastro" /> : <><div className="overflow-x-auto"><table className="min-w-[820px]"><thead><tr><th className="text-left">Nome / Razão social</th><th className="text-left">Tipo</th><th className="text-left">Vínculos</th><th className="text-left">CPF/CNPJ</th><th className="text-left">Telefone</th><th className="text-left">Status</th><th className="text-right">Ações</th></tr></thead><tbody>{paged.map(item => <tr key={item.id} className="cursor-default" onClick={() => openItem(item)}><td className="font-bold text-[#0d1b2e]">{item.name}</td><td className="text-xs text-[#5a6a82]">{item.person_type === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}</td><td><div className="flex flex-wrap gap-1">{activeRegistrationRoles(item).map(role => <span key={role} className="rounded-full bg-[#eaf2ff] px-2 py-1 text-[10px] font-black text-[#0057e7]">{roleLabels[role]}</span>)}</div></td><td className="font-mono text-xs text-[#5a6a82]">{item.document ? item.person_type === "PJ" ? formatCnpj(item.document) : formatCpf(item.document) : "—"}</td><td className="text-xs text-[#5a6a82]">{formatPhone(item.phone || item.whatsapp) || "—"}</td><td><StatusBadge status={item.is_active ? "Ativo" : "Inativo"} /></td><td><div className="flex justify-end" onClick={event => event.stopPropagation()}><AdminIconButton ariaLabel="Abrir cadastro" title="Abrir cadastro" onClick={() => openItem(item)}><Edit2 size={15} /></AdminIconButton></div></td></tr>)}</tbody></table></div><PaginationBar page={safePage} pageSize={pageSize} totalItems={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} /></>}</AdminCard>
  </div>;
}
