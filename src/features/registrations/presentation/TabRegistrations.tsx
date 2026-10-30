import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Edit2,
  Eraser,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { hasCustomerAddressData, normalizeSharedMapUrl, validateCustomerAddress } from "@/lib/address";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { AdminSearchClearButton, AdminSearchSortMenu } from "@/shared/ui/admin/AdminSearchPanel";
import { AdminMobileSearchSwitch } from "@/shared/ui/admin/AdminMobileSearchSwitch";
import { AdminCard, AdminIconButton, AdminPage, BtnPrimary, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { AdminActiveStateButton } from "@/shared/ui/admin/AdminActiveStateButton";
import { EmptyState, LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { AdminSelect, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { cn, formatCnpj, formatCpf, formatPhone, isValidEmail } from "@/shared/domain/formatters";
import {
  emptyEmployeeAccessForm,
  type EmployeeAccessFormState,
} from "@/features/access/presentation/UserAccessSection";
import { UserPermissionOverridesPage } from "@/features/access/presentation/UserPermissionOverridesPage";
import { getEmployeeAccess, saveEmployeeAccess, setEmployeeAccessActive } from "@/features/access/infrastructure/user-access.repository";
import { invalidAllowedIps, parseAllowedIps } from "@/features/access/domain/ip-access";
import { useRegistrationLookups } from "../application/useRegistrationLookups";
import {
  activeRegistrationRoles,
  emptyRegistrationAddress,
  emptyRegistrationForm,
  registrationAddressPayload,
  registrationAddressesFromRecord,
  registrationEntityPayload,
  registrationFormFromRecord,
  validateRegistrationFormFields,
  type RegistrationAddressForm,
  type RegistrationFieldErrors,
  type RegistrationFormState,
} from "../domain/registration-form";
import {
  getRegistration,
  getRegistrationSupplierItems,
  listRegistrationCreators,
  listRegistrationsPage,
  saveRegistration,
  setEmployeeFieldTrackingPrompt,
  setEmployeeInactivityLogoutDisabled,
  syncRegistrationAddresses,
  syncRegistrationSupplierItems,
  type Registration,
  type RegistrationListPage,
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
  onOpenOrder?: (id: string, customerId?: string) => void;
};

type RegistrationSort = "" | "name_asc" | "name_desc" | "newest" | "oldest";
type RegistrationEditorOrigin = "list" | "detail";

const roleLabels: Record<RegistrationRole, string> = {
  customer: "Cliente",
  employee: "Funcionário",
  supplier: "Fornecedor",
};

function accessFormFromResponse(access: any): EmployeeAccessFormState {
  return {
    enabled: access?.enabled === true,
    profile_id: access?.profile_id ? String(access.profile_id) : null,
    username: String(access?.username || ""),
    email: String(access?.email || ""),
    password: "",
    role_id: String(access?.role_id || ""),
    uniq_subscriber_id: String(access?.uniq_subscriber_id || ""),
    restrict_by_ip: access?.restrict_by_ip === true,
    allowed_ips: Array.isArray(access?.allowed_ips) ? access.allowed_ips.map(String).join("\n") : "",
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
    <div className="mb-1 text-[9px] font-black uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
    <div className="min-w-0 text-xs font-semibold text-foreground">{children}</div>
  </div>;
}

function useDebouncedValue<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}

export function TabRegistrations({ routeResourceId, routeSubpage, onRouteChange, onOpenOrder }: Props) {
  const { activeOrganizationId, activeOrganization, hasPermission, hasModule } = useAuth();
  const platformUsersOnly = activeOrganization?.is_platform_operator === true;
  const canView = platformUsersOnly
    ? hasPermission("customers.view") && hasPermission("employees.view")
    : hasPermission("customers.view");
  const canCreate = platformUsersOnly
    ? hasPermission("customers.create") && hasPermission("employees.create")
    : hasPermission("customers.create");
  const canEdit = platformUsersOnly
    ? (hasPermission("customers.edit") || hasPermission("customers.update")) && hasPermission("employees.edit")
    : hasPermission("customers.edit") || hasPermission("customers.update");
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

  const [nameSearch, setNameSearch] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
  const [mobileSearchField, setMobileSearchField] = useState<"name" | "document">("name");
  const [roleFilter, setRoleFilter] = useState<"all" | RegistrationRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [createdDate, setCreatedDate] = useState("");
  const [sortOrder, setSortOrder] = useState<RegistrationSort>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const debouncedNameSearch = useDebouncedValue(nameSearch);
  const debouncedDocumentSearch = useDebouncedValue(documentSearch);

  const listBaseKey = queryKeys.registrations.list(organizationKey);
  const creatorsQuery = useQuery({
    queryKey: [...listBaseKey, "creators"],
    queryFn: () => listRegistrationCreators(activeOrganizationId!),
    enabled: Boolean(activeOrganizationId && canView && !routeResourceId),
    staleTime: 5 * 60_000,
  });
  const creatorOptions = [
    { value: "all", label: "Todos os responsáveis" },
    { value: "system", label: "Sistema / site / importação" },
    ...(creatorsQuery.data || []).map(creator => ({ value: creator.id, label: creator.name })),
  ];
  const listKey = [
    ...listBaseKey,
    {
      page,
      pageSize,
      nameSearch: debouncedNameSearch,
      documentSearch: debouncedDocumentSearch,
      roleFilter,
      statusFilter,
      creatorFilter,
      createdDate,
      sortOrder,
      employeeOnly: platformUsersOnly,
    },
  ] as const;

  const registrationsQuery = useQuery({
    queryKey: listKey,
    queryFn: () => listRegistrationsPage({
      organizationId: activeOrganizationId!,
      page,
      pageSize,
      nameSearch: debouncedNameSearch,
      documentSearch: debouncedDocumentSearch,
      role: platformUsersOnly ? "all" : roleFilter,
      status: statusFilter,
      creatorFilter,
      createdDate,
      sort: sortOrder,
      employeeOnly: platformUsersOnly,
    }),
    enabled: Boolean(activeOrganizationId && canView && !routeResourceId),
    // Reaproveita a página anterior apenas dentro da mesma empresa.
    // Evita exibir dados de outra organização durante a troca de contexto.
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[2] === activeOrganizationId ? previous : undefined,
  });
  const items = registrationsQuery.data?.items ?? [];
  const totalItems = registrationsQuery.data?.total ?? 0;
  const registrationsCountQuery = useQuery({
    queryKey: [...listBaseKey, "all-registrations-count"],
    queryFn: () => listRegistrationsPage({
      organizationId: activeOrganizationId!, page: 1, pageSize: 1,
      role: "all", status: "all", employeeOnly: false,
    }),
    enabled: Boolean(activeOrganizationId && canView && !platformUsersOnly && !routeResourceId),
    staleTime: 30_000,
  });
  const registrationsTotal = registrationsCountQuery.data?.total ?? totalItems;
  // Não substituir uma página já exibida por spinner durante o refresh.
  // O placeholder paginado permanece na tela até a próxima página chegar.
  const loading = Boolean(activeOrganizationId && canView && !routeResourceId)
    && registrationsQuery.isPending && !registrationsQuery.data;

  const routeRegistrationId = routeResourceId && routeResourceId !== "new" && routeSubpage !== "customer"
    ? routeResourceId
    : null;
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
    // A tabela já traz os dados essenciais do cadastro. Exiba-os imediatamente
    // enquanto o detalhe completo é consultado, sem uma página de loading.
    placeholderData: () => registrationsQuery.data?.items.find(item =>
      item.id === routeRegistrationId && item.organization_id === activeOrganizationId,
    ),
  });
  const routeRegistration = detailQuery.data ?? null;
  const detailPreview = detailQuery.isPlaceholderData;
  const recordLoading = Boolean(routeRegistrationId && (detailQuery.isPending || detailPreview));
  const detailExtrasEnabled = Boolean(routeRegistration && !detailPreview && (!routeSubpage || routeSubpage === "edit"));
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
  const [registrationFieldErrors, setRegistrationFieldErrors] = useState<RegistrationFieldErrors>({});
  const [addressValidationAttempted, setAddressValidationAttempted] = useState(false);
  const [selected, setSelected] = useState<Registration | null>(null);
  const [form, setForm] = useState<RegistrationFormState>(emptyRegistrationForm());
  const [addresses, setAddresses] = useState<RegistrationAddressForm[]>([emptyRegistrationAddress(true)]);
  const [supplierItems, setSupplierItems] = useState<SupplierInventoryItem[]>([]);
  const [accessForm, setAccessForm] = useState<EmployeeAccessFormState>(emptyEmployeeAccessForm());
  const [accessExisting, setAccessExisting] = useState(false);
  const [accessDirty, setAccessDirty] = useState(false);
  const [togglingEmployeeId, setTogglingEmployeeId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const editorBaseHydratedRef = useRef<string | null>(null);
  const editorSupplierHydratedRef = useRef<string | null>(null);
  const editorAccessHydratedRef = useRef<string | null>(null);
  const editorOriginRef = useRef<RegistrationEditorOrigin | null>(null);

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
    setToast({ msg: `Erro ao carregar cadastros: ${systemErrorMessage(registrationsQuery.error)}`, type: "error" });
  }, [registrationsQuery.error]);

  useEffect(() => {
    if (!detailQuery.error) return;
    setToast({ msg: `Cadastro não encontrado: ${systemErrorMessage(detailQuery.error)}`, type: "error" });
  }, [detailQuery.error]);

  useEffect(() => {
    if (!supplierItemsQuery.error) return;
    setToast({ msg: `Erro ao carregar itens do fornecedor: ${systemErrorMessage(supplierItemsQuery.error)}`, type: "error" });
  }, [supplierItemsQuery.error]);

  useEffect(() => {
    if (!employeeAccessQuery.error) return;
    setToast({ msg: `Erro ao carregar acesso do funcionário: ${systemErrorMessage(employeeAccessQuery.error)}`, type: "error" });
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
      editorOriginRef.current = null;
      return;
    }

    if (creating) {
      if (editorBaseHydratedRef.current === "new") return;
      setSelected(null);
      setForm(platformUsersOnly
        ? { ...emptyRegistrationForm(), person_type: "PF", roles: ["employee"] }
        : emptyRegistrationForm());
      setAddresses([emptyRegistrationAddress(true)]);
      setAddressValidationAttempted(false);
      setSupplierItems([]);
      setAccessForm(emptyEmployeeAccessForm());
      setAccessExisting(false);
      setAccessDirty(false);
      editorBaseHydratedRef.current = "new";
      editorSupplierHydratedRef.current = "new";
      editorAccessHydratedRef.current = "new";
      return;
    }

    if (!routeRegistration || detailPreview || editorBaseHydratedRef.current === routeRegistration.id) return;
    const profileId = routeRegistration.employee_details?.[0]?.profile_id || routeRegistration.legacy_employee?.profile_id || null;
    setSelected(routeRegistration);
    setForm(registrationFormFromRecord(routeRegistration));
    setAddresses(registrationAddressesFromRecord(routeRegistration));
    setAddressValidationAttempted(false);
    setSupplierItems([]);
    setAccessForm(emptyEmployeeAccessForm());
    setAccessExisting(Boolean(profileId));
    setAccessDirty(false);
    editorBaseHydratedRef.current = routeRegistration.id;
    editorSupplierHydratedRef.current = null;
    editorAccessHydratedRef.current = null;
  }, [editorOpen, creating, routeRegistration, detailPreview, platformUsersOnly]);

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
    setAccessForm(access ? accessFormFromResponse(access) : emptyEmployeeAccessForm());
    editorAccessHydratedRef.current = routeRegistration.id;
  }, [editorOpen, creating, routeRegistration, routeRoles, routeEmployeeId, canViewAccess, employeeAccessQuery.isSuccess, employeeAccessQuery.data]);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = items;
  const hasActiveFilters = Boolean(
    nameSearch
    || documentSearch
    || (!platformUsersOnly && roleFilter !== "all")
    || statusFilter !== "all"
    || creatorFilter !== "all"
    || createdDate
    || sortOrder
  );
  const clearFilters = () => {
    setNameSearch("");
    setDocumentSearch("");
    setRoleFilter("all");
    setStatusFilter("all");
    setCreatorFilter("all");
    setCreatedDate("");
    setSortOrder("");
    setPage(1);
  };

  useEffect(() => {
    setPage(1);
  }, [nameSearch, documentSearch, roleFilter, statusFilter, creatorFilter, createdDate, sortOrder, pageSize, platformUsersOnly]);

  useEffect(() => {
    if (!loading && page > totalPages) setPage(totalPages);
  }, [loading, page, totalPages]);

  useEffect(() => {
    if (platformUsersOnly && roleFilter !== "all") setRoleFilter("all");
  }, [platformUsersOnly, roleFilter]);

  const toggleRole = (role: RegistrationRole) => {
    const allowed = selected ? canEdit : canCreate;
    if (!allowed) return;
    if (platformUsersOnly) return;
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
    const allowedIps = parseAllowedIps(accessForm.allowed_ips);
    if (accessForm.restrict_by_ip && allowedIps.length === 0) return "Informe pelo menos um IP permitido para restringir o acesso.";
    const invalidIps = invalidAllowedIps(accessForm.allowed_ips);
    if (accessForm.restrict_by_ip && invalidIps.length > 0) return `IP inválido: ${invalidIps[0]}.`;
    if (allowedIps.length > 20) return "Informe no máximo 20 endereços IP permitidos.";
    if (!accessExisting && accessForm.password.length < 8) return "A senha do novo acesso deve ter pelo menos 8 caracteres.";
    if (accessExisting && accessForm.password && accessForm.password.length < 8) return "A nova senha deve ter pelo menos 8 caracteres.";
    return null;
  };

  const save = async () => {
    if (!activeOrganizationId || saving) return;
    const nextFieldErrors = validateRegistrationFormFields(form, { requireCustomerPhone: creating });
    const addressRequired = creating && form.roles.includes("customer");
    const addressCandidates = addressRequired ? addresses : creating ? addresses.filter(hasCustomerAddressData) : [];
    const missingAddress = addressRequired && addresses.length === 0;
    const invalidAddress = addressCandidates.some(address => Object.keys(validateCustomerAddress(address)).length > 0 || (addressRequired && !address.type.trim()));
    setAddressValidationAttempted(true);
    setRegistrationFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length || missingAddress || invalidAddress) {
      if (missingAddress || invalidAddress) setToast({ msg: missingAddress ? "Adicione um endereço completo ao cliente." : "Preencha os campos obrigatórios do endereço.", type: "error" });
      return;
    }
    const accessValidation = validateAccess();
    if (accessValidation) {
      setToast({ msg: accessValidation, type: "error" });
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
      // As rotinas de sincronização são RPCs e podem regravar vários vínculos.
      // Compare com o cadastro já carregado antes de executá-las.
      const previousAddresses = selected
        ? registrationAddressesFromRecord(selected).filter(hasAddressContent).map(address => registrationAddressPayload({
            ...address,
            shared_map_url: normalizeSharedMapUrl(address.shared_map_url),
          }))
        : [];
      if (!selected || JSON.stringify(addressPayloads) !== JSON.stringify(previousAddresses)) {
        const addressResult = await syncRegistrationAddresses(activeOrganizationId, savedId, addressPayloads);
        if (addressResult.error) throw addressResult.error;
      }

      const savedSupplierItems = form.roles.includes("supplier") ? supplierItems : [];
      const previousSupplierIds = selected && supplierItemsQuery.isSuccess
        ? (supplierItemsQuery.data ?? []).map(item => item.id).sort()
        : selected && !activeRegistrationRoles(selected).includes("supplier") ? [] : null;
      const nextSupplierIds = savedSupplierItems.map(item => item.id).sort();
      if (!selected || previousSupplierIds === null || JSON.stringify(previousSupplierIds) !== JSON.stringify(nextSupplierIds)) {
        const supplierResult = await syncRegistrationSupplierItems(activeOrganizationId, savedId, nextSupplierIds);
        if (supplierResult.error) throw supplierResult.error;
      }
      queryClient.setQueryData(queryKeys.registrations.supplierItems(activeOrganizationId, savedId), savedSupplierItems);

      let { data: refreshedData, error: refreshedError } = await getRegistration(activeOrganizationId, savedId);
      if (refreshedError || !refreshedData) throw refreshedError || new Error("Não foi possível recarregar o cadastro salvo.");
      let refreshed = refreshedData as unknown as Registration;

      const desiredTrackingPrompt = form.roles.includes("employee") && hasModule("field_tracking") && form.field_tracking_prompt_on_login;
      const trackingPromptChanged = Boolean(refreshed.legacy_employee_id)
        && (!selected || Boolean(selected.legacy_employee?.field_tracking_prompt_on_login) !== desiredTrackingPrompt);
      if (trackingPromptChanged && refreshed.legacy_employee_id) {
        const trackingRequirement = await setEmployeeFieldTrackingPrompt(
          activeOrganizationId, refreshed.legacy_employee_id, desiredTrackingPrompt,
        );
        if (trackingRequirement.error) throw trackingRequirement.error;
      }

      const desiredInactivityException = form.roles.includes("employee") && form.disable_inactivity_logout;
      const inactivitySettingChanged = Boolean(refreshed.legacy_employee_id)
        && (selected
          ? Boolean(selected.legacy_employee?.disable_inactivity_logout) !== desiredInactivityException
          : desiredInactivityException);
      if (inactivitySettingChanged && refreshed.legacy_employee_id) {
        const inactivityResult = await setEmployeeInactivityLogoutDisabled(
          activeOrganizationId, refreshed.legacy_employee_id, desiredInactivityException,
        );
        if (inactivityResult.error) throw inactivityResult.error;
      }

      if (form.roles.includes("employee") && refreshed.legacy_employee_id && accessDirty) {
        const result = await saveEmployeeAccess({
          organizationId: activeOrganizationId,
          employeeId: refreshed.legacy_employee_id,
          enabled: accessForm.enabled,
          email: accessForm.email,
          password: accessForm.password,
          roleId: accessForm.role_id,
          uniqSubscriberId: accessForm.uniq_subscriber_id,
          restrictByIp: accessForm.restrict_by_ip,
          allowedIps: parseAllowedIps(accessForm.allowed_ips),
        });
        if (result.error) throw result.error;
        void queryClient.invalidateQueries({ queryKey: queryKeys.registrations.access(activeOrganizationId, refreshed.legacy_employee_id) });
      } else if (!form.roles.includes("employee") && refreshed.legacy_employee_id && removingEmployeeWithAccess) {
        const result = await saveEmployeeAccess({
          organizationId: activeOrganizationId,
          employeeId: refreshed.legacy_employee_id,
          enabled: false,
          email: accessForm.email,
          roleId: accessForm.role_id,
          uniqSubscriberId: accessForm.uniq_subscriber_id,
          restrictByIp: accessForm.restrict_by_ip,
          allowedIps: parseAllowedIps(accessForm.allowed_ips),
        });
        if (result.error) throw result.error;
        void queryClient.invalidateQueries({ queryKey: queryKeys.registrations.access(activeOrganizationId, refreshed.legacy_employee_id) });
      }

      if (accessDirty || removingEmployeeWithAccess || trackingPromptChanged || inactivitySettingChanged) {
        const refreshedAgain = await getRegistration(activeOrganizationId, savedId);
        if (!refreshedAgain.error && refreshedAgain.data) refreshed = refreshedAgain.data as unknown as Registration;
      }

      queryClient.setQueryData(queryKeys.registrations.detail(activeOrganizationId, savedId), refreshed);
      void queryClient.invalidateQueries({ queryKey: queryKeys.registrations.list(activeOrganizationId), refetchType: "none" });
      setSelected(refreshed);
      setToast({ msg: selected ? "Cadastro atualizado." : "Cadastro criado.", type: "success" });
      editorOriginRef.current = null;
      onRouteChange?.(savedId, null);
    } catch (error) {
      const message = systemErrorMessage(error);
      if (/whatsapp já cadastrado/i.test(message)) {
        setRegistrationFieldErrors(current => ({ ...current, whatsapp: message }));
        setToast({ msg: message, type: "error" });
      } else if (message.toLocaleLowerCase("pt-BR").includes("cadastro já existente")) {
        setRegistrationFieldErrors(current => ({ ...current, document: message }));
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
    setRegistrationFieldErrors({});
    editorBaseHydratedRef.current = null;
    editorOriginRef.current = "list";
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
          : { id: item.legacy_employee_id!, profile_id: profileId, is_active: next, field_tracking_prompt_on_login: item.legacy_employee?.field_tracking_prompt_on_login === true },
      } : registration;
      queryClient.setQueriesData<RegistrationListPage>(
        { queryKey: queryKeys.registrations.list(activeOrganizationId) },
        current => current
          ? { ...current, items: current.items.map(patchRegistration) }
          : current,
      );
      queryClient.setQueryData<Registration>(queryKeys.registrations.detail(activeOrganizationId, item.id), current => current ? patchRegistration(current) : current);
      await queryClient.invalidateQueries({ queryKey: queryKeys.registrations.access(activeOrganizationId, item.legacy_employee_id) });
      setToast({ msg: next ? "Usuário ativado." : "Usuário inativado. O acesso ao sistema foi bloqueado.", type: "success" });
    } catch (error) {
      setToast({ msg: `Erro ao alterar usuário: ${systemErrorMessage(error)}`, type: "error" });
    } finally {
      setTogglingEmployeeId(null);
    }
  };

  const openItem = (item: Registration) => {
    onRouteChange?.(item.id, null);
  };
  const openEditItem = (item: Registration) => {
    setRegistrationFieldErrors({});
    if (!canEdit) return;
    editorOriginRef.current = "list";
    onRouteChange?.(item.id, "edit");
  };
  const closeEditor = () => {
    if (creating || editorOriginRef.current === "list") {
      onRouteChange?.(null, null);
      return;
    }
    onRouteChange?.(selected?.id || routeRegistration?.id || null, null);
  };
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
    if (!creating && (recordLoading || !routeRegistration || !selected)) return <AdminPage open onClose={closeEditor} smoothMotion={false} breadcrumb="Cadastros" title="Editar cadastro"><LoadingState /></AdminPage>;
    return <>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <RegistrationEditor
        creating={creating}
        form={form}
        setForm={setForm}
        addresses={addresses}
        setAddresses={setAddresses}
        addressValidationAttempted={addressValidationAttempted}
        supplierItems={supplierItems}
        setSupplierItems={setSupplierItems}
        organizationId={activeOrganizationId}
        employeeId={!creating ? selected?.legacy_employee_id : null}
        canModify={creating ? canCreate : canEdit}
        accessForm={accessForm}
        onAccessChange={updateAccess}
        accessExisting={accessExisting}
        accessLoading={!creating && employeeAccessQuery.isPending}
        canModifyAccess={accessExisting ? canEditAccess : canCreateAccess}
        lookups={lookups}
        fieldErrors={registrationFieldErrors}
        onClearFieldError={(field) => setRegistrationFieldErrors(current => {
          if (!current[field]) return current;
          const next = { ...current };
          delete next[field];
          return next;
        })}
        saving={saving}
        onSave={() => void save()}
        onClose={closeEditor}
        onToggleRole={toggleRole}
        employeeOnly={platformUsersOnly}
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
        preview={detailPreview}
        supplierItems={supplierItemsQuery.data || []}
        accessForm={detailAccessForm}
        accessExisting={detailAccessExisting}
        accessLoading={employeeAccessQuery.isPending}
        permissionUserId={permissionUserId}
        canViewAccess={canViewAccess}
        canViewPermissionOverrides={canViewPermissionOverrides}
        canEdit={canEdit}
        onClose={closeDetail}
        onEdit={() => {
          editorOriginRef.current = "detail";
          onRouteChange?.(routeRegistration.id, "edit");
        }}
        onOpenContacts={() => onRouteChange?.(routeRegistration.id, "contacts")}
        onOpenRecords={() => onRouteChange?.(routeRegistration.id, "records")}
        onOpenOrder={onOpenOrder}
        onAddressLinked={() => void queryClient.invalidateQueries({queryKey:detailKey})}
        onOpenPermissions={() => onRouteChange?.(routeRegistration.id, "permissions")}
      />
    </>;
  }

  // O preview da linha evita este loading ao abrir pela tabela. Em URLs diretas,
  // sem qualquer dado em cache, aguardamos a consulta para não exibir ficha falsa.
  if (routeResourceId && !routeRegistration && recordLoading) return <LoadingState text="Carregando cadastro..." />;

  return <div className="space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader
      title={platformUsersOnly ? "Usuários" : "Cadastros"}
      subtitle={platformUsersOnly ? "Gerencie funcionários e acessos da Union World." : `${String(registrationsTotal)} cadastros realizados`}
      actions={canCreate ? <BtnPrimary onClick={openNew}><Plus size={16} /> {platformUsersOnly ? "Novo usuário" : "Novo cadastro"}</BtnPrimary> : undefined}
    />
    <AdminCard square className="overflow-hidden p-0">
      <div className="flex h-12 items-center justify-between gap-3 border-b border-white/10 md:h-11 admin-primary-bar px-4 text-white">
        <div className="flex min-w-0 items-center gap-2.5"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.10]"><Search size={14} className="shrink-0 text-white/90" /></span><span className="text-xs font-black uppercase tracking-[0.14em]">{platformUsersOnly ? "Buscar usuário" : "Buscar cadastro"}</span></div>
        <div className="ml-auto flex items-center gap-2">
          {hasActiveFilters && <AdminSearchClearButton onClick={clearFilters} />}
          <AdminSearchSortMenu value={sortOrder} onChange={setSortOrder}
            options={[{ value: "", label: "Ordenação padrão" }, { value: "name_asc", label: "Nome A–Z" }, { value: "name_desc", label: "Nome Z–A" }, { value: "newest", label: "Mais recentes" }, { value: "oldest", label: "Mais antigos" }]} />
        </div>
      </div>
      <div className="p-3 sm:p-4">

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="col-span-2 min-w-0 md:hidden">
            <AdminMobileSearchSwitch
              value={mobileSearchField}
              options={[{ value: "name", label: "Nome / Razão social" }, { value: "document", label: "CPF / CNPJ" }]}
              onChange={value => {
                if (value === mobileSearchField) return;
                setMobileSearchField(value);
                setNameSearch("");
                setDocumentSearch("");
                setPage(1);
              }}
            >
              <div className="relative min-w-0">
                <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="registrations-mobile-search"
                  type="search"
                  aria-label={mobileSearchField === "name" ? "Buscar cadastro por nome ou razão social" : "Buscar cadastro por CPF ou CNPJ"}
                  value={mobileSearchField === "name" ? nameSearch : documentSearch}
                  onChange={event => {
                    if (mobileSearchField === "name") setNameSearch(event.target.value);
                    else setDocumentSearch(event.target.value);
                    setPage(1);
                  }}
                  inputMode={mobileSearchField === "document" ? "numeric" : "text"}
                  placeholder={mobileSearchField === "name" ? "Nome / Razão social" : "Digite o CPF ou CNPJ"}
                  className={cn(INPUT, "h-[42px] w-full min-w-0 pl-9 text-sm")}
                />
              </div>
            </AdminMobileSearchSwitch>
          </div>
          <div className="hidden min-w-0 md:block">
            <label htmlFor="registrations-name" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Nome</label>
            <div className="relative">
              <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input id="registrations-name" value={nameSearch} onChange={event => setNameSearch(event.target.value)} placeholder="Nome / Razão social" className={cn(INPUT, "h-9 w-full min-w-0 pl-9 text-xs")} />
            </div>
          </div>
          <div className="hidden min-w-0 md:block">
            <label htmlFor="registrations-document" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">CPF/CNPJ</label>
            <div className="relative">
              <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input id="registrations-document" value={documentSearch} onChange={event => setDocumentSearch(event.target.value)} placeholder="CPF ou CNPJ" inputMode="numeric" className={cn(INPUT, "h-9 w-full min-w-0 pl-9 text-xs")} />
            </div>
          </div>
          {!platformUsersOnly && <div className="min-w-0">
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Vínculo</label>
            <AdminSelect value={roleFilter} onValueChange={value => setRoleFilter(value as "all" | RegistrationRole)} ariaLabel="Vínculo" className="h-9 min-w-0 py-1 text-xs" options={[{ value: "all", label: "Todos os vínculos" }, { value: "customer", label: "Clientes" }, { value: "employee", label: "Funcionários" }, { value: "supplier", label: "Fornecedores" }]} />
          </div>}
          <div className="min-w-0">
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</label>
            <AdminSelect value={statusFilter} onValueChange={value => setStatusFilter(value as "all" | "active" | "inactive")} ariaLabel="Status" className="h-9 min-w-0 py-1 text-xs" options={[{ value: "all", label: "Todos os status" }, { value: "active", label: "Ativos" }, { value: "inactive", label: "Inativos" }]} />
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Cadastrado por</label>
            <AdminSelect value={creatorFilter} onValueChange={setCreatorFilter} ariaLabel="Cadastrado por" className="h-9 min-w-0 py-1 text-xs" options={creatorOptions} />
          </div>
          <div className="min-w-0">
            <label htmlFor="registrations-created-date" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Data</label>
            <input id="registrations-created-date" aria-label="Data de cadastro" type="date" value={createdDate} onChange={event => setCreatedDate(event.target.value)} className={cn(INPUT, "h-9 w-full min-w-0 px-2 py-1 text-xs")} />
          </div>
        </div>
      </div>
    </AdminCard>

    <AdminCard className="[&_th]:md:py-2 [&_td]:md:py-2.5">{loading ? <LoadingState /> : items.length === 0 ? <EmptyState
      icon={Users}
      title={platformUsersOnly ? "Nenhum usuário encontrado" : "Nenhum cadastro encontrado"}
      message={platformUsersOnly ? "Crie um usuário para dar acesso à Union World." : "Crie um cadastro ou ajuste os filtros."}
      onAdd={canCreate ? openNew : undefined}
      addLabel={platformUsersOnly ? "Novo usuário" : "Novo cadastro"}
    /> : <>
      <div className="divide-y divide-[#0d1b2e]/8 md:hidden">{paged.map(item => {
        const employeeAccessProfileId = item.legacy_employee?.profile_id || item.employee_details?.[0]?.profile_id || null;
        const employeeUserActive = item.legacy_employee?.is_active !== false;
        const canToggleEmployee = canToggleAccess && activeRegistrationRoles(item).includes("employee") && Boolean(item.legacy_employee_id && employeeAccessProfileId);
        const roles = activeRegistrationRoles(item);
        const document = item.document ? item.person_type === "PJ" ? formatCnpj(item.document) : formatCpf(item.document) : "—";
        return <article key={item.id} className="cursor-default p-4" onClick={() => openItem(item)}>
          <div className="flex items-start justify-between gap-3">
            <MobileCardField label="Nome / Razão social"><span className="break-words text-sm font-black">{item.name}</span>{item.registration_source === "site" && <span className="mt-1 inline-flex rounded-full bg-[#eaf2ff] px-2 py-0.5 text-[9px] font-black text-[#0057e7]">Origem: Site</span>}</MobileCardField>
            <div className="shrink-0 text-right"><div className="mb-1 text-[9px] font-black uppercase tracking-[0.12em] text-muted-foreground">Status</div><StatusBadge status={item.is_active ? "Ativo" : "Inativo"} /></div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
            <MobileCardField label="Tipo">{item.person_type === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}</MobileCardField>
            <MobileCardField label="CPF/CNPJ"><span className="break-all font-mono">{document}</span></MobileCardField>
            <MobileCardField label="Telefone">{formatPhone(item.phone || item.whatsapp) || "—"}</MobileCardField>
            <MobileCardField label="Vínculos"><div className="flex flex-wrap gap-1">{roles.length ? roles.map(role => <span key={role} className="rounded-full bg-[#eaf2ff] px-2 py-1 text-[9px] font-black text-[#0057e7]">{roleLabels[role]}</span>) : <span>—</span>}</div></MobileCardField>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3" onClick={event => event.stopPropagation()}>
            <span className="text-[9px] font-black uppercase tracking-[0.12em] text-muted-foreground">Ações</span>
            <div className="flex items-center gap-1">{canEdit && <AdminIconButton ariaLabel="Editar cadastro" title="Editar cadastro" onClick={() => openEditItem(item)}><Edit2 size={15} /></AdminIconButton>}{canToggleEmployee && <AdminActiveStateButton active={employeeUserActive} entityLabel="usuário" disabled={togglingEmployeeId === item.legacy_employee_id} onClick={() => void toggleEmployeeUser(item)} />}</div>
          </div>
        </article>;
      })}</div>

      <div className="hidden overflow-x-auto md:block"><table className="min-w-[820px]"><thead><tr><th className="text-left">Nome / Razão social</th><th className="text-left">Tipo</th><th className="text-left">Vínculos</th><th className="text-left">CPF/CNPJ</th><th className="text-left">Telefone</th><th className="text-left">Status</th><th className="text-right">Ações</th></tr></thead><tbody>{paged.map(item => {
        const employeeAccessProfileId = item.legacy_employee?.profile_id || item.employee_details?.[0]?.profile_id || null;
        const employeeUserActive = item.legacy_employee?.is_active !== false;
        const canToggleEmployee = canToggleAccess && activeRegistrationRoles(item).includes("employee") && Boolean(item.legacy_employee_id && employeeAccessProfileId);
        return <tr key={item.id} className="cursor-default" onClick={() => openItem(item)}><td className="font-bold text-foreground"><div className="flex flex-wrap items-center gap-2">{item.name}{item.registration_source === "site" && <span className="rounded-full bg-[#eaf2ff] px-2 py-0.5 text-[10px] font-black text-[#0057e7]">Site</span>}</div></td><td className="text-xs text-muted-foreground">{item.person_type === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}</td><td><div className="flex flex-wrap gap-1">{activeRegistrationRoles(item).map(role => <span key={role} className="rounded-full bg-[#eaf2ff] px-2 py-1 text-[10px] font-black text-[#0057e7]">{roleLabels[role]}</span>)}</div></td><td className="font-mono text-xs text-muted-foreground">{item.document ? item.person_type === "PJ" ? formatCnpj(item.document) : formatCpf(item.document) : "—"}</td><td className="text-xs text-muted-foreground">{formatPhone(item.phone || item.whatsapp) || "—"}</td><td><StatusBadge status={item.is_active ? "Ativo" : "Inativo"} /></td><td><div className="flex justify-end gap-1" onClick={event => event.stopPropagation()}>{canEdit && <AdminIconButton ariaLabel="Editar cadastro" title="Editar cadastro" onClick={() => openEditItem(item)}><Edit2 size={15} /></AdminIconButton>}{canToggleEmployee && <AdminActiveStateButton active={employeeUserActive} entityLabel="usuário" disabled={togglingEmployeeId === item.legacy_employee_id} onClick={() => void toggleEmployeeUser(item)} />}</div></td></tr>;
      })}</tbody></table></div>
      <PaginationBar page={safePage} pageSize={pageSize} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} />
    </>}</AdminCard>
  </div>;
}