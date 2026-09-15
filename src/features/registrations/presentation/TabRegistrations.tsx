import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpNarrowWide,
  Check,
  ChevronDown,
  Edit2,
  Pause,
  Play,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { normalizeSharedMapUrl } from "@/lib/address";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { AdminCard, AdminIconButton, AdminPage, BtnPrimary, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { EmptyState, LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { AdminSelect, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { cn, formatCnpj, formatCpf, formatPhone, isValidEmail, normalizeDigits } from "@/shared/domain/formatters";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/primitives/dropdown-menu";
import {
  emptyEmployeeAccessForm,
  type EmployeeAccessFormState,
} from "@/features/access/presentation/UserAccessSection";
import { UserPermissionOverridesPage } from "@/features/access/presentation/UserPermissionOverridesPage";
import { getEmployeeAccess, saveEmployeeAccess, setEmployeeAccessActive } from "@/features/access/infrastructure/user-access.repository";
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
import { RegistrationContactsPage } from "./RegistrationContactsPage";
import { RegistrationDetails } from "./RegistrationDetails";
import { RegistrationEditor } from "./RegistrationEditor";
import { RegistrationRecordsPage } from "./RegistrationRecordsPage";

type Props = {
  routeResourceId?: string | null;
  routeSubpage?: string | null;
  onRouteChange?: (resourceId?: string | null, subpage?: string | null) => void;
  onOpenCustomerHistory?: (customerId: string) => void;
};

type MobileRegistrationFilter = "name" | "document" | "role" | "status";
type RegistrationSort = "" | "name_asc" | "name_desc" | "newest" | "oldest";

const roleLabels: Record<RegistrationRole, string> = {
  customer: "Cliente",
  employee: "Funcionário",
  supplier: "Fornecedor",
};

const mobileFilterOptions: Array<{ value: MobileRegistrationFilter; label: string }> = [
  { value: "name", label: "Nome / Razão social" },
  { value: "document", label: "CPF ou CNPJ" },
  { value: "role", label: "Vínculo" },
  { value: "status", label: "Status" },
];

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

function MobileCardField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0">
    <div className="mb-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#8a98aa]">{label}</div>
    <div className="min-w-0 text-xs font-semibold text-[#0d1b2e]">{children}</div>
  </div>;
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
  const canManageContacts = hasPermission("registrations.contacts.manage");
  const canViewContacts = hasPermission("registrations.contacts.view") || canManageContacts;
  const canCreateRecords = hasPermission("registrations.records.create");
  const canViewRecords = hasPermission("registrations.records.view") || canCreateRecords;
  const queryClient = useQueryClient();
  const organizationKey = activeOrganizationId || "";
  const listKey = queryKeys.registrations.list(organizationKey);

  const registrationsQuery = useQuery({
    queryKey: listKey,
    queryFn: async () => {
      const result = await listRegistrations(activeOrganizationId!);
      if (result.error) throw result.error;
      return (result.data || []) as unknown as Registration[];
    },
    enabled: Boolean(activeOrganizationId && canView && !routeResourceId),
  });
  const items = registrationsQuery.data ?? [];
  const loading = registrationsQuery.isPending && !registrationsQuery.data;

  const routeRegistrationId = routeResourceId && routeResourceId !== "new" && routeSubpage !== "customer"
    ? routeResourceId
    : null;
  const registrationFromList = routeRegistrationId
    ? items.find(item => item.id === routeRegistrationId)
    : undefined;
  const detailKey = queryKeys.registrations.detail(organizationKey, routeRegistrationId || "");
  const detailQuery = useQuery({
    queryKey: detailKey,
    queryFn: async () => {
      const result = await getRegistration(activeOrganizationId!, routeRegistrationId!);
      if (result.error) throw result.error;
      if (!result.data) throw new Error("Cadastro não encontrado.");
      return result.data as unknown as Registration;
    },
    enabled: Boolean(activeOrganizationId && routeRegistrationId && canView),
    initialData: registrationFromList,
    initialDataUpdatedAt: registrationFromList ? registrationsQuery.dataUpdatedAt : undefined,
  });
  const routeRegistration = detailQuery.data ?? registrationFromList ?? null;
  const recordLoading = Boolean(routeRegistrationId && detailQuery.isPending && !routeRegistration);
  const detailExtrasEnabled = Boolean(routeRegistration && (!routeSubpage || routeSubpage === "edit"));
  const routeRoles = routeRegistration ? activeRegistrationRoles(routeRegistration) : [];
  const routeEmployeeId = routeRegistration?.legacy_employee_id || null;

  const supplierItemsQuery = useQuery({
    queryKey: queryKeys.registrations.supplierItems(organizationKey, routeRegistration?.id || ""),
    queryFn: async () => {
      const result = await getRegistrationSupplierItems(activeOrganizationId!, routeRegistration!.id);
      if (result.error) throw result.error;
      return result.data || [];
    },
    enabled: Boolean(activeOrganizationId && detailExtrasEnabled && routeRegistration && routeRoles.includes("supplier")),
  });

  const employeeAccessQuery = useQuery({
    queryKey: queryKeys.registrations.access(organizationKey, routeEmployeeId || ""),
    queryFn: async () => {
      const result = await getEmployeeAccess(activeOrganizationId!, routeEmployeeId!);
      if (result.error) throw result.error;
      return result.data?.access ?? null;
    },
    enabled: Boolean(activeOrganizationId && detailExtrasEnabled && routeEmployeeId && canViewAccess),
  });

  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Registration | null>(null);
  const [form, setForm] = useState<RegistrationFormState>(emptyRegistrationForm());
  const [addresses, setAddresses] = useState<RegistrationAddressForm[]>([emptyRegistrationAddress(true)]);
  const [supplierItems, setSupplierItems] = useState<SupplierInventoryItem[]>([]);
  const [accessForm, setAccessForm] = useState<EmployeeAccessFormState>(emptyEmployeeAccessForm());
  const [accessExisting, setAccessExisting] = useState(false);
  const [accessDirty, setAccessDirty] = useState(false);
  const [accessUserId, setAccessUserId] = useState<string | null>(null);
  const [nameSearch, setNameSearch] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | RegistrationRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [mobileFilter, setMobileFilter] = useState<MobileRegistrationFilter>("name");
  const [sortOrder, setSortOrder] = useState<RegistrationSort>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [togglingEmployeeId, setTogglingEmployeeId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const editorBaseHydratedRef = useRef<string | null>(null);
  const editorSupplierHydratedRef = useRef<string | null>(null);
  const editorAccessHydratedRef = useRef<string | null>(null);

  const lookups = useRegistrationLookups({
    organizationId: activeOrganizationId,
    registrationId: selected?.id,
    form,
    addresses,
    setForm,
    setAddresses,
  });

  useEffect(() => {
    if (!registrationsQuery.error) return;
    setToast({ msg: `Erro ao carregar cadastros: ${registrationsQuery.error instanceof Error ? registrationsQuery.error.message : String(registrationsQuery.error)}`, type: "error" });
  }, [registrationsQuery.error]);

  useEffect(() => {
    if (!detailQuery.error) return;
    setToast({ msg: `Cadastro não encontrado: ${detailQuery.error instanceof Error ? detailQuery.error.message : String(detailQuery.error)}`, type: "error" });
  }, [detailQuery.error]);

  useEffect(() => {
    if (!supplierItemsQuery.error) return;
    setToast({ msg: `Erro ao carregar itens do fornecedor: ${supplierItemsQuery.error instanceof Error ? supplierItemsQuery.error.message : String(supplierItemsQuery.error)}`, type: "error" });
  }, [supplierItemsQuery.error]);

  useEffect(() => {
    if (!employeeAccessQuery.error) return;
    setToast({ msg: `Erro ao carregar acesso do funcionário: ${employeeAccessQuery.error instanceof Error ? employeeAccessQuery.error.message : String(employeeAccessQuery.error)}`, type: "error" });
  }, [employeeAccessQuery.error]);

  const editorOpen = routeResourceId === "new" || Boolean(routeResourceId && routeSubpage === "edit");
  const contactsOpen = Boolean(routeResourceId && routeSubpage === "contacts");
  const recordsOpen = Boolean(routeResourceId && routeSubpage === "records");
  const permissionsOpen = Boolean(routeResourceId && routeSubpage === "permissions");
  const creating = routeResourceId === "new";

  useEffect(() => {
    if (!editorOpen) {
      editorBaseHydratedRef.current = null;
      editorSupplierHydratedRef.current = null;
      editorAccessHydratedRef.current = null;
      return;
    }

    if (creating) {
      if (editorBaseHydratedRef.current === "new") return;
      setSelected(null);
      setForm(emptyRegistrationForm());
      setAddresses([emptyRegistrationAddress(true)]);
      setSupplierItems([]);
      setAccessForm(emptyEmployeeAccessForm());
      setAccessExisting(false);
      setAccessUserId(null);
      setAccessDirty(false);
      editorBaseHydratedRef.current = "new";
      editorSupplierHydratedRef.current = "new";
      editorAccessHydratedRef.current = "new";
      return;
    }

    if (!routeRegistration || editorBaseHydratedRef.current === routeRegistration.id) return;
    const profileId = routeRegistration.employee_details?.[0]?.profile_id || routeRegistration.legacy_employee?.profile_id || null;
    setSelected(routeRegistration);
    setForm(registrationFormFromRecord(routeRegistration));
    setAddresses(registrationAddressesFromRecord(routeRegistration));
    setSupplierItems([]);
    setAccessForm(emptyEmployeeAccessForm());
    setAccessExisting(Boolean(profileId));
    setAccessUserId(profileId);
    setAccessDirty(false);
    editorBaseHydratedRef.current = routeRegistration.id;
    editorSupplierHydratedRef.current = null;
    editorAccessHydratedRef.current = null;
  }, [editorOpen, creating, routeRegistration]);

  useEffect(() => {
    if (!editorOpen || creating || !routeRegistration || !routeRoles.includes("supplier")) return;
    if (!supplierItemsQuery.isSuccess || editorSupplierHydratedRef.current === routeRegistration.id) return;
    setSupplierItems(supplierItemsQuery.data || []);
    editorSupplierHydratedRef.current = routeRegistration.id;
  }, [editorOpen, creating, routeRegistration, routeRoles, supplierItemsQuery.isSuccess, supplierItemsQuery.data]);

  useEffect(() => {
    if (!editorOpen || creating || !routeRegistration || !routeRoles.includes("employee")) return;
    if (!canViewAccess || !routeEmployeeId) return;
    if (!employeeAccessQuery.isSuccess || editorAccessHydratedRef.current === routeRegistration.id) return;
    const access = employeeAccessQuery.data;
    const fallbackProfileId = routeRegistration.employee_details?.[0]?.profile_id || routeRegistration.legacy_employee?.profile_id || null;
    setAccessExisting(Boolean(access?.profile_id || fallbackProfileId));
    setAccessUserId(access?.user_id || access?.profile_id || fallbackProfileId);
    setAccessForm(access ? accessFormFromResponse(access) : emptyEmployeeAccessForm());
    editorAccessHydratedRef.current = routeRegistration.id;
  }, [editorOpen, creating, routeRegistration, routeRoles, routeEmployeeId, canViewAccess, employeeAccessQuery.isSuccess, employeeAccessQuery.data]);

  const filtered = useMemo(() => {
    const nameQuery = nameSearch.trim().toLocaleLowerCase("pt-BR");
    const documentQuery = documentSearch.trim().toLocaleLowerCase("pt-BR");
    const documentDigits = normalizeDigits(documentSearch);
    const result = items.filter(item => {
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

    if (!sortOrder) return result;
    return [...result].sort((a, b) => {
      if (sortOrder === "name_asc") return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" });
      if (sortOrder === "name_desc") return String(b.name || "").localeCompare(String(a.name || "").localeCompare ? String(a.name || "") : "", "pt-BR", { sensitivity: "base" });
      const aDate = new Date(a.created_at || 0).getTime();
      const bDate = new Date(b.created_at || 0).getTime();
      return sortOrder === "newest" ? bDate - aDate : aDate - bDate;
    });
  }, [items, nameSearch, documentSearch, roleFilter, statusFilter, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const hasActiveFilters = Boolean(nameSearch || documentSearch || roleFilter !== "all" || statusFilter !== "all" || sortOrder);
  const clearFilters = () => {
    setNameSearch("");
    setDocumentSearch("");
    setRoleFilter("all");
    setStatusFilter("all");
    setSortOrder("");
  };
  useEffect(() => { setPage(1); }, [nameSearch, documentSearch, roleFilter, statusFilter, sortOrder, pageSize]);

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

      const savedSupplierItems = form.roles.includes("supplier") ? supplierItems : [];
      const supplierResult = await syncRegistrationSupplierItems(activeOrganizationId, savedId, savedSupplierItems.map(item => item.id));
      if (supplierResult.error) throw supplierResult.error;
      queryClient.setQueryData(queryKeys.registrations.supplierItems(activeOrganizationId, savedId), savedSupplierItems);

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
        await queryClient.invalidateQueries({ queryKey: queryKeys.registrations.access(activeOrganizationId, refreshed.legacy_employee_id) });
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
        await queryClient.invalidateQueries({ queryKey: queryKeys.registrations.access(activeOrganizationId, refreshed.legacy_employee_id) });
      }

      if (accessDirty || removingEmployeeWithAccess) {
        const refreshedAgain = await getRegistration(activeOrganizationId, savedId);
        if (!refreshedAgain.error && refreshedAgain.data) refreshed = refreshedAgain.data as unknown as Registration;
      }

      queryClient.setQueryData(queryKeys.registrations.detail(activeOrganizationId, savedId), refreshed);
      await queryClient.invalidateQueries({ queryKey: queryKeys.registrations.list(activeOrganizationId), refetchType: "none" });
      setSelected(refreshed);
      setToast({ msg: selected ? "Cadastro atualizado." : "Cadastro criado.", type: "success" });
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
    editorBaseHydratedRef.current = null;
    onRouteChange?.("new", "edit");
  };

  const toggleEmployeeUser = async (item: Registration) => {
    if (!activeOrganizationId || !canToggleAccess || !item.legacy_employee_id) return;
    const profileId = item.legacy_employee?.profile_id || item.employee_details?.[0]?.profile_id || null;
    if (!profileId) {
      setToast({ msg: "Este funcionário ainda não possui usuário de acesso ao sistema.", type: "error" });
      return;
    }
    const next = item.legacy_employee?.is_active === false;
    setTogglingEmployeeId(item.legacy_employee_id);
    try {
      const { error } = await setEmployeeAccessActive(activeOrganizationId, item.legacy_employee_id, next);
      if (error) throw error;
      const patchRegistration = (registration: Registration) => registration.id === item.id ? {
        ...registration,
        legacy_employee: registration.legacy_employee
          ? { ...registration.legacy_employee, is_active: next }
          : { id: item.legacy_employee_id!, profile_id: profileId, is_active: next },
      } : registration;
      queryClient.setQueryData<Registration[]>(queryKeys.registrations.list(activeOrganizationId), current => (current || []).map(patchRegistration));
      queryClient.setQueryData<Registration>(queryKeys.registrations.detail(activeOrganizationId, item.id), current => current ? patchRegistration(current) : current);
      await queryClient.invalidateQueries({ queryKey: queryKeys.registrations.access(activeOrganizationId, item.legacy_employee_id) });
      setToast({ msg: next ? "Usuário ativado." : "Usuário inativado. O acesso ao sistema foi bloqueado.", type: "success" });
    } catch (error) {
      const message = error && typeof error === "object" && "message" in error ? String((error as any).message || "Erro desconhecido") : String(error || "Erro desconhecido");
      setToast({ msg: `Erro ao alterar usuário: ${message}`, type: "error" });
    } finally {
      setTogglingEmployeeId(null);
    }
  };

  const openItem = (item: Registration) => {
    if (activeOrganizationId) queryClient.setQueryData(queryKeys.registrations.detail(activeOrganizationId, item.id), item);
    onRouteChange?.(item.id, null);
  };
  const closeEditor = () => selected ? onRouteChange?.(selected.id, null) : onRouteChange?.(null, null);
  const closeDetail = () => onRouteChange?.(null, null);

  if (!canView) return null;

  if (contactsOpen) {
    if (recordLoading || !routeRegistration) return <AdminPage open onClose={() => onRouteChange?.(routeResourceId, null)} breadcrumb="Cadastros" title="Carregando contatos"><LoadingState /></AdminPage>;
    if (!activeOrganizationId || !canViewContacts) return <AdminPage open onClose={() => onRouteChange?.(routeRegistration.id, null)} breadcrumb={`Cadastros > ${routeRegistration.name}`} title="Contatos" subtitle="Você não possui permissão para visualizar os contatos deste cadastro." />;
    return <RegistrationContactsPage registration={routeRegistration} organizationId={activeOrganizationId} canManage={canManageContacts} onClose={() => onRouteChange?.(routeRegistration.id, null)} />;
  }

  if (recordsOpen) {
    if (recordLoading || !routeRegistration) return <AdminPage open onClose={() => onRouteChange?.(routeResourceId, null)} breadcrumb="Cadastros" title="Carregando registros"><LoadingState /></AdminPage>;
    if (!activeOrganizationId || !canViewRecords) return <AdminPage open onClose={() => onRouteChange?.(routeRegistration.id, null)} breadcrumb={`Cadastros > ${routeRegistration.name}`} title="Registros" subtitle="Você não possui permissão para visualizar os registros deste cadastro." />;
    return <RegistrationRecordsPage registration={routeRegistration} organizationId={activeOrganizationId} canCreate={canCreateRecords} onClose={() => onRouteChange?.(routeRegistration.id, null)} />;
  }

  if (permissionsOpen) {
    if (recordLoading || !routeRegistration) return <AdminPage open onClose={() => onRouteChange?.(routeResourceId, null)} breadcrumb="Cadastros" title="Carregando acessos"><LoadingState /></AdminPage>;
    const userId = routeRegistration.employee_details?.[0]?.profile_id || routeRegistration.legacy_employee?.profile_id || null;
    if (!userId || !activeOrganizationId || !canViewPermissionOverrides) {
      return <AdminPage open onClose={() => onRouteChange?.(routeRegistration.id, null)} breadcrumb={`Cadastros > ${routeRegistration.name} > Acessos e Permissões`} title="Acessos e Permissões" subtitle="Este funcionário ainda não possui um acesso ao sistema vinculado." />;
    }
    return <UserPermissionOverridesPage organizationId={activeOrganizationId} userId={userId} registrationName={routeRegistration.name} onClose={() => onRouteChange?.(routeRegistration.id, null)} />;
  }

  if (editorOpen) {
    if (!creating && (recordLoading || !routeRegistration || !selected)) return <AdminPage open onClose={closeEditor} breadcrumb="Cadastros" title="Carregando cadastro"><LoadingState /></AdminPage>;
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
        accessLoading={!creating && employeeAccessQuery.isPending}
        canModifyAccess={accessExisting ? canEditAccess : canCreateAccess}
        lookups={lookups}
        saving={saving}
        onSave={() => void save()}
        onClose={closeEditor}
        onToggleRole={toggleRole}
      />
    </>;
  }

  if (routeRegistration && routeResourceId) {
    const access = employeeAccessQuery.data;
    const permissionUserId = access?.user_id || access?.profile_id || routeRegistration.employee_details?.[0]?.profile_id || routeRegistration.legacy_employee?.profile_id || null;
    const detailAccessForm = access ? accessFormFromResponse(access) : emptyEmployeeAccessForm();
    const detailAccessExisting = Boolean(access?.profile_id || permissionUserId);
    return <>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <RegistrationDetails
        selected={routeRegistration}
        supplierItems={supplierItemsQuery.data || []}
        accessForm={detailAccessForm}
        accessExisting={detailAccessExisting}
        accessLoading={employeeAccessQuery.isPending}
        permissionUserId={permissionUserId}
        canViewAccess={canViewAccess}
        canViewPermissionOverrides={canViewPermissionOverrides}
        canEdit={canEdit}
        onClose={closeDetail}
        onEdit={() => onRouteChange?.(routeRegistration.id, "edit")}
        onOpenContacts={() => onRouteChange?.(routeRegistration.id, "contacts")}
        onOpenRecords={() => onRouteChange?.(routeRegistration.id, "records")}
        onOpenCustomerHistory={onOpenCustomerHistory}
        onOpenPermissions={() => onRouteChange?.(routeRegistration.id, "permissions")}
      />
    </>;
  }

  if (routeResourceId && recordLoading) return <LoadingState text="Carregando cadastro..." />;

  const mobileFilterLabel = mobileFilterOptions.find(option => option.value === mobileFilter)?.label || "Nome / Razão social";
  const sortLabel = sortOrder === "name_asc" ? "Nome A–Z" : sortOrder === "name_desc" ? "Nome Z–A" : sortOrder === "newest" ? "Mais recentes" : sortOrder === "oldest" ? "Mais antigos" : "Ordenação padrão";
  const SortIcon = sortOrder === "name_asc" || sortOrder === "oldest" ? ArrowUpNarrowWide : sortOrder === "name_desc" || sortOrder === "newest" ? ArrowDownWideNarrow : ArrowUpDown;
  const renderMobileFilter = () => {
    if (mobileFilter === "name") return <div className="relative min-w-0"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input aria-label="Buscar por nome ou razão social" value={nameSearch} onChange={event => setNameSearch(event.target.value)} placeholder="Nome / Razão social" className={cn(INPUT, "h-[42px] w-full min-w-0 pl-9 text-sm")} /></div>;
    if (mobileFilter === "document") return <div className="relative min-w-0"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input aria-label="Buscar por CPF ou CNPJ" value={documentSearch} onChange={event => setDocumentSearch(event.target.value)} placeholder="CPF ou CNPJ" inputMode="numeric" className={cn(INPUT, "h-[42px] w-full min-w-0 pl-9 text-sm")} /></div>;
    if (mobileFilter === "role") return <AdminSelect value={roleFilter} onValueChange={value => setRoleFilter(value as "all" | RegistrationRole)} ariaLabel="Filtrar por vínculo" className="h-[42px] text-xs" options={[{ value: "all", label: "Todos os vínculos" }, { value: "customer", label: "Clientes" }, { value: "employee", label: "Funcionários" }, { value: "supplier", label: "Fornecedores" }]} />;
    return <AdminSelect value={statusFilter} onValueChange={value => setStatusFilter(value as "all" | "active" | "inactive")} ariaLabel="Filtrar por status" className="h-[42px] text-xs" options={[{ value: "all", label: "Todos os status" }, { value: "active", label: "Ativos" }, { value: "inactive", label: "Inativos" }]} />;
  };
  const sortMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Ordenação atual: ${sortLabel}`} title={`Ordenação: ${sortLabel}`} className={cn(
          "inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border bg-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40",
          sortOrder ? "border-[#0057e7] bg-[#eef5ff] text-[#0057e7]" : "border-[#0d1b2e]/15 text-[#5a6a82] hover:border-[#0057e7]/40 hover:bg-[#eef5ff]",
        )}><SortIcon size={20} className="text-[#0057e7]" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        {([
          ["", "Ordenação padrão", ArrowUpDown],
          ["name_asc", "Nome A–Z", ArrowUpNarrowWide],
          ["name_desc", "Nome Z–A", ArrowDownWideNarrow],
          ["newest", "Mais recentes", ArrowDownWideNarrow],
          ["oldest", "Mais antigos", ArrowUpNarrowWide],
        ] as const).map(([value, label, Icon]) => <DropdownMenuItem key={value || "default"} onSelect={() => setSortOrder(value)} className={cn("cursor-pointer", sortOrder === value && "bg-[#eef5ff] font-bold text-[#0057e7] focus:bg-[#eef5ff] focus:text-[#0057e7]")}><Icon size={15} className={sortOrder === value ? "text-[#0057e7]" : "text-[#5a6a82]"} /><span>{label}</span>{sortOrder === value && <Check size={15} className="ml-auto text-[#0057e7]" />}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return <div className="space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader title="Cadastros" subtitle="Gerencie clientes, funcionários e fornecedores em um único cadastro." actions={canCreate ? <BtnPrimary onClick={openNew}><Plus size={16} /> Novo cadastro</BtnPrimary> : undefined} />
    <AdminCard className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0057e7] px-4 py-3 text-white">
        <div className="flex items-center gap-2"><Search size={16} className="shrink-0" /><span className="text-xs font-black uppercase tracking-[0.14em]">Buscar cadastro</span></div>
        <div className="ml-auto flex max-w-full items-center justify-end">
          {hasActiveFilters && <button type="button" onClick={clearFilters} aria-label="Limpar filtros" title="Limpar filtros" className="text-xs font-semibold text-white underline decoration-white/70 underline-offset-4 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">Limpar filtros</button>}
        </div>
      </div>
      <div className="p-4">
        <div className="space-y-3 md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" aria-label={`Buscar por: ${mobileFilterLabel}`} className="flex h-[42px] w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 text-left text-xs font-bold text-[#0d1b2e] shadow-sm transition-colors hover:border-[#0057e7]/40 focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40"><span className="min-w-0 truncate"><span className="font-medium text-[#5a6a82]">Buscar por:</span> {mobileFilterLabel}</span><ChevronDown size={15} className="shrink-0 text-[#5a6a82]" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[240px]">{mobileFilterOptions.map(option => <DropdownMenuItem key={option.value} onSelect={() => setMobileFilter(option.value)} className={cn("cursor-pointer", mobileFilter === option.value && "bg-[#eef5ff] font-bold text-[#0057e7] focus:bg-[#eef5ff] focus:text-[#0057e7]")}><Search size={14} className={mobileFilter === option.value ? "text-[#0057e7]" : "text-[#5a6a82]"} /><span>{option.label}</span>{mobileFilter === option.value && <Check size={14} className="ml-auto text-[#0057e7]" />}</DropdownMenuItem>)}</DropdownMenuContent>
          </DropdownMenu>
          <div className="flex min-w-0 items-start gap-2"><div className="min-w-0 flex-1">{renderMobileFilter()}</div>{sortMenu}</div>
        </div>

        <div className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-4">
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
      </div>
    </AdminCard>

    <AdminCard>{loading ? <LoadingState /> : filtered.length === 0 ? <EmptyState icon={Users} title="Nenhum cadastro encontrado" message="Crie um cadastro ou ajuste os filtros." onAdd={canCreate ? openNew : undefined} addLabel="Novo cadastro" /> : <>
      <div className="divide-y divide-[#0d1b2e]/8 md:hidden">{paged.map(item => {
        const employeeAccessProfileId = item.legacy_employee?.profile_id || item.employee_details?.[0]?.profile_id || null;
        const employeeUserActive = item.legacy_employee?.is_active !== false;
        const canToggleEmployee = canToggleAccess && activeRegistrationRoles(item).includes("employee") && Boolean(item.legacy_employee_id && employeeAccessProfileId);
        const roles = activeRegistrationRoles(item);
        const document = item.document ? item.person_type === "PJ" ? formatCnpj(item.document) : formatCpf(item.document) : "—";
        return <article key={item.id} className="cursor-default p-4" onClick={() => openItem(item)}>
          <div className="flex items-start justify-between gap-3">
            <MobileCardField label="Nome / Razão social"><span className="break-words text-sm font-black">{item.name}</span></MobileCardField>
            <div className="shrink-0 text-right"><div className="mb-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#8a98aa]">Status</div><StatusBadge status={item.is_active ? "Ativo" : "Inativo"} /></div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
            <MobileCardField label="Tipo">{item.person_type === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}</MobileCardField>
            <MobileCardField label="CPF/CNPJ"><span className="break-all font-mono">{document}</span></MobileCardField>
            <MobileCardField label="Telefone">{formatPhone(item.phone || item.whatsapp) || "—"}</MobileCardField>
            <MobileCardField label="Vínculos"><div className="flex flex-wrap gap-1">{roles.length ? roles.map(role => <span key={role} className="rounded-full bg-[#eaf2ff] px-2 py-1 text-[9px] font-black text-[#0057e7]">{roleLabels[role]}</span>) : <span>—</span>}</div></MobileCardField>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#0d1b2e]/8 pt-3" onClick={event => event.stopPropagation()}>
            <span className="text-[9px] font-black uppercase tracking-[0.12em] text-[#8a98aa]">Ações</span>
            <div className="flex items-center gap-1">{canToggleEmployee && <AdminIconButton ariaLabel={employeeUserActive ? "Inativar usuário" : "Ativar usuário"} title={employeeUserActive ? "Inativar usuário" : "Ativar usuário"} disabled={togglingEmployeeId === item.legacy_employee_id} className={employeeUserActive ? "border-red-500 text-red-600 hover:border-red-600 hover:bg-red-50 hover:text-red-700" : "border-emerald-500 text-emerald-600 hover:border-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"} onClick={() => void toggleEmployeeUser(item)}>{employeeUserActive ? <Pause size={15} /> : <Play size={15} />}</AdminIconButton>}<AdminIconButton ariaLabel="Abrir cadastro" title="Abrir cadastro" onClick={() => openItem(item)}><Edit2 size={15} /></AdminIconButton></div>
          </div>
        </article>;
      })}</div>

      <div className="hidden overflow-x-auto md:block"><table className="min-w-[820px]"><thead><tr><th className="text-left">Nome / Razão social</th><th className="text-left">Tipo</th><th className="text-left">Vínculos</th><th className="text-left">CPF/CNPJ</th><th className="text-left">Telefone</th><th className="text-left">Status</th><th className="text-right">Ações</th></tr></thead><tbody>{paged.map(item => {
        const employeeAccessProfileId = item.legacy_employee?.profile_id || item.employee_details?.[0]?.profile_id || null;
        const employeeUserActive = item.legacy_employee?.is_active !== false;
        const canToggleEmployee = canToggleAccess && activeRegistrationRoles(item).includes("employee") && Boolean(item.legacy_employee_id && employeeAccessProfileId);
        return <tr key={item.id} className="cursor-default" onClick={() => openItem(item)}><td className="font-bold text-[#0d1b2e]">{item.name}</td><td className="text-xs text-[#5a6a82]">{item.person_type === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}</td><td><div className="flex flex-wrap gap-1">{activeRegistrationRoles(item).map(role => <span key={role} className="rounded-full bg-[#eaf2ff] px-2 py-1 text-[10px] font-black text-[#0057e7]">{roleLabels[role]}</span>)}</div></td><td className="font-mono text-xs text-[#5a6a82]">{item.document ? item.person_type === "PJ" ? formatCnpj(item.document) : formatCpf(item.document) : "—"}</td><td className="text-xs text-[#5a6a82]">{formatPhone(item.phone || item.whatsapp) || "—"}</td><td><StatusBadge status={item.is_active ? "Ativo" : "Inativo"} /></td><td><div className="flex justify-end gap-1" onClick={event => event.stopPropagation()}>{canToggleEmployee && <AdminIconButton ariaLabel={employeeUserActive ? "Inativar usuário" : "Ativar usuário"} title={employeeUserActive ? "Inativar usuário" : "Ativar usuário"} disabled={togglingEmployeeId === item.legacy_employee_id} className={employeeUserActive ? "border-red-500 text-red-600 hover:border-red-600 hover:bg-red-50 hover:text-red-700" : "border-emerald-500 text-emerald-600 hover:border-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"} onClick={() => void toggleEmployeeUser(item)}>{employeeUserActive ? <Pause size={15} /> : <Play size={15} />}</AdminIconButton>}<AdminIconButton ariaLabel="Abrir cadastro" title="Abrir cadastro" onClick={() => openItem(item)}><Edit2 size={15} /></AdminIconButton></div></td></tr>;
      })}</tbody></table></div>
      <PaginationBar page={safePage} pageSize={pageSize} totalItems={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
    </>}</AdminCard>
  </div>;
}
