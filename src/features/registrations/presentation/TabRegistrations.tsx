import { useEffect, useMemo, useState } from "react";
import { Building2, Edit2, Plus, Search, ShieldCheck, UserRound, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminCard, AdminIconButton, AdminPage, BtnPrimary, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { EmptyState, LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { formatCnpj, formatCpf, formatPhone, isValidCnpj, isValidCpf, isValidEmail, normalizeDigits } from "@/shared/domain/formatters";
import { getRegistration, listRegistrations, saveRegistration, type Registration, type RegistrationRole } from "../infrastructure/registrations.repository";

type Props = {
  routeResourceId?: string | null;
  routeSubpage?: string | null;
  onRouteChange?: (resourceId?: string | null, subpage?: string | null) => void;
  onOpenCustomerHistory?: (customerId: string) => void;
  onOpenAccessManagement?: () => void;
};

type FormState = {
  person_type: "PF" | "PJ";
  name: string;
  legal_name: string;
  trade_name: string;
  document: string;
  state_registration: string;
  birth_date: string;
  foundation_date: string;
  phone: string;
  whatsapp: string;
  email: string;
  is_active: boolean;
  roles: RegistrationRole[];
  job_title: string;
  team_name: string;
  admission_date: string;
  address_type: string;
  zip_code: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
  number: string;
  complement: string;
  reference: string;
  location_url: string;
};

const emptyForm = (): FormState => ({
  person_type: "PF",
  name: "",
  legal_name: "",
  trade_name: "",
  document: "",
  state_registration: "",
  birth_date: "",
  foundation_date: "",
  phone: "",
  whatsapp: "",
  email: "",
  is_active: true,
  roles: ["customer"],
  job_title: "",
  team_name: "",
  admission_date: "",
  address_type: "Principal",
  zip_code: "",
  state: "",
  city: "",
  neighborhood: "",
  street: "",
  number: "",
  complement: "",
  reference: "",
  location_url: "",
});

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

function activeRoles(registration: Registration) {
  return (registration.roles || []).filter(item => item.is_active).map(item => item.role);
}

function primaryAddress(registration: Registration) {
  return (registration.addresses || []).find(address => address.is_primary) || (registration.addresses || [])[0] || null;
}

function toForm(registration: Registration): FormState {
  const employee = registration.employee_details?.[0];
  const address = primaryAddress(registration);
  return {
    person_type: registration.person_type,
    name: registration.name || "",
    legal_name: registration.legal_name || "",
    trade_name: registration.trade_name || "",
    document: registration.document || "",
    state_registration: registration.state_registration || "",
    birth_date: registration.birth_date || "",
    foundation_date: registration.foundation_date || "",
    phone: registration.phone || "",
    whatsapp: registration.whatsapp || "",
    email: registration.email || "",
    is_active: registration.is_active !== false,
    roles: activeRoles(registration),
    job_title: employee?.job_title || "",
    team_name: employee?.team_name || "",
    admission_date: employee?.admission_date || "",
    address_type: address?.type || "Principal",
    zip_code: address?.zip_code || "",
    state: address?.state || "",
    city: address?.city || "",
    neighborhood: address?.neighborhood || "",
    street: address?.street || "",
    number: address?.number || "",
    complement: address?.complement || "",
    reference: address?.reference || "",
    location_url: address?.location_url || "",
  };
}

function Field({ label, value, onChange, required, type = "text", disabled = false, placeholder }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; disabled?: boolean; placeholder?: string }) {
  return <label className="min-w-0 text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}{required && <span className="ml-1 text-red-500">*</span>}<input type={type} disabled={disabled} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className={`${INPUT} mt-1.5`} /></label>;
}

export function TabRegistrations({ routeResourceId, routeSubpage, onRouteChange, onOpenCustomerHistory, onOpenAccessManagement }: Props) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canView = hasPermission("customers.view") || hasPermission("employees.view");
  const canCreateCustomer = hasPermission("customers.create");
  const canEditCustomer = hasPermission("customers.edit") || hasPermission("customers.update");
  const canCreateEmployee = hasPermission("employees.create");
  const canEditEmployee = hasPermission("employees.edit");
  const canCreate = canCreateCustomer || canCreateEmployee;
  const canEdit = canEditCustomer || canEditEmployee;
  const [items, setItems] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Registration | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | RegistrationRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    if (!activeOrganizationId || !canView) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await listRegistrations(activeOrganizationId);
    setLoading(false);
    if (error) { setToast({ msg: `Erro ao carregar cadastros: ${error.message}`, type: "error" }); return; }
    setItems((data || []) as unknown as Registration[]);
  };

  useEffect(() => { void load(); }, [activeOrganizationId, canView]);

  const editorOpen = routeResourceId === "new" || Boolean(routeResourceId && routeSubpage === "edit");

  useEffect(() => {
    let cancelled = false;
    if (!activeOrganizationId || !routeResourceId || routeResourceId === "new" || routeSubpage === "customer") {
      if (routeResourceId === "new") { setSelected(null); setForm(emptyForm()); }
      return () => { cancelled = true; };
    }
    const fromList = items.find(item => item.id === routeResourceId);
    if (fromList) { setSelected(fromList); setForm(toForm(fromList)); return () => { cancelled = true; }; }
    void getRegistration(activeOrganizationId, routeResourceId).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) { setToast({ msg: `Cadastro não encontrado${error ? `: ${error.message}` : "."}`, type: "error" }); return; }
      const registration = data as unknown as Registration;
      setSelected(registration); setForm(toForm(registration));
    });
    return () => { cancelled = true; };
  }, [activeOrganizationId, routeResourceId, routeSubpage, items]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    const digits = normalizeDigits(search);
    return items.filter(item => {
      const roles = activeRoles(item);
      if (roleFilter !== "all" && !roles.includes(roleFilter)) return false;
      if (statusFilter === "active" && item.is_active === false) return false;
      if (statusFilter === "inactive" && item.is_active !== false) return false;
      if (!query) return true;
      const text = [item.name, item.legal_name, item.trade_name, item.email, item.phone, item.whatsapp, item.document].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
      return text.includes(query) || (digits && normalizeDigits(item.document).includes(digits));
    });
  }, [items, search, roleFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { setPage(1); }, [search, roleFilter, statusFilter, pageSize]);

  const toggleRole = (role: RegistrationRole) => {
    const allowed = role === "employee" ? (selected ? canEditEmployee : canCreateEmployee) : (selected ? canEditCustomer : canCreateCustomer);
    if (!allowed) return;
    setForm(current => ({ ...current, roles: current.roles.includes(role) ? current.roles.filter(item => item !== role) : [...current.roles, role] }));
  };

  const validate = () => {
    if (!form.name.trim()) return "Informe o nome do cadastro.";
    if (!form.roles.length) return "Selecione ao menos um vínculo.";
    const digits = normalizeDigits(form.document);
    if (form.person_type === "PF" && digits && !isValidCpf(digits)) return "CPF inválido.";
    if (form.person_type === "PJ" && digits && !isValidCnpj(digits)) return "CNPJ inválido.";
    if (form.roles.includes("employee") && form.person_type !== "PF") return "Funcionário deve ser Pessoa Física.";
    if (form.roles.includes("employee") && !isValidCpf(digits)) return "Informe um CPF válido para o funcionário.";
    if (form.email && !isValidEmail(form.email)) return "E-mail inválido.";
    return null;
  };

  const save = async () => {
    if (!activeOrganizationId || saving) return;
    const validation = validate();
    if (validation) { setToast({ msg: validation, type: "error" }); return; }
    setSaving(true);
    const { data, error } = await saveRegistration({
      id: selected?.id || null,
      organizationId: activeOrganizationId,
      entity: {
        person_type: form.person_type,
        name: form.name.trim(),
        legal_name: form.legal_name,
        trade_name: form.trade_name,
        document: normalizeDigits(form.document),
        state_registration: form.state_registration,
        birth_date: form.birth_date,
        foundation_date: form.foundation_date,
        phone: normalizeDigits(form.phone),
        whatsapp: normalizeDigits(form.whatsapp),
        email: form.email.trim(),
        is_active: form.is_active,
      },
      roles: form.roles,
      employee: form.roles.includes("employee") ? { job_title: form.job_title, team_name: form.team_name, admission_date: form.admission_date } : {},
      address: { type: form.address_type, zip_code: form.zip_code, state: form.state, city: form.city, neighborhood: form.neighborhood, street: form.street, number: form.number, complement: form.complement, reference: form.reference, location_url: form.location_url },
    });
    setSaving(false);
    if (error) { setToast({ msg: `Erro ao salvar cadastro: ${error.message}`, type: "error" }); return; }
    setToast({ msg: selected ? "Cadastro atualizado." : "Cadastro criado.", type: "success" });
    await load();
    onRouteChange?.(String(data), null);
  };

  const openNew = () => { setSelected(null); setForm(emptyForm()); onRouteChange?.("new", "edit"); };
  const openItem = (item: Registration) => { setSelected(item); setForm(toForm(item)); onRouteChange?.(item.id, null); };
  const openEdit = () => selected && onRouteChange?.(selected.id, "edit");
  const closeEditor = () => selected ? onRouteChange?.(selected.id, null) : onRouteChange?.(null, null);
  const closeDetail = () => { setSelected(null); onRouteChange?.(null, null); };

  if (!canView) return null;

  if (editorOpen) {
    const creating = routeResourceId === "new";
    return <AdminPage open onClose={closeEditor} breadcrumb="Cadastros" title={creating ? "Novo cadastro" : form.name || "Editar cadastro"} subtitle={creating ? "Cadastre uma pessoa ou empresa e defina seus vínculos." : "Atualize os dados e vínculos deste cadastro."}>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <div className="space-y-5 p-4 sm:p-5">
        <Section title="Tipo e vínculos">
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setForm(current => ({ ...current, person_type: "PF" }))} className={`rounded-xl border p-4 text-left ${form.person_type === "PF" ? "border-[#0057e7] bg-[#0057e7]/5" : "border-[#d9e1ec]"}`}><div className="font-black text-[#0d1b2e]">Pessoa Física</div><div className="mt-1 text-xs text-[#5a6a82]">CPF e data de nascimento.</div></button>
            <button type="button" disabled={form.roles.includes("employee")} onClick={() => setForm(current => ({ ...current, person_type: "PJ" }))} className={`rounded-xl border p-4 text-left disabled:opacity-40 ${form.person_type === "PJ" ? "border-[#0057e7] bg-[#0057e7]/5" : "border-[#d9e1ec]"}`}><div className="font-black text-[#0d1b2e]">Pessoa Jurídica</div><div className="mt-1 text-xs text-[#5a6a82]">CNPJ, razão social e nome fantasia.</div></button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">{(["customer","employee","supplier"] as RegistrationRole[]).map(role => { const Icon = roleIcons[role]; const checked = form.roles.includes(role); const allowed = role === "employee" ? (creating ? canCreateEmployee : canEditEmployee) : (creating ? canCreateCustomer : canEditCustomer); return <button key={role} type="button" disabled={!allowed} onClick={() => toggleRole(role)} className={`flex items-center gap-3 rounded-xl border p-3 text-left disabled:opacity-40 ${checked ? "border-[#0057e7] bg-[#0057e7]/5" : "border-[#d9e1ec]"}`}><Checkbox checked={checked} tabIndex={-1} /><Icon size={17} className="text-[#0057e7]" /><span className="text-sm font-bold text-[#0d1b2e]">{roleLabels[role]}</span></button>; })}</div>
        </Section>

        <Section title="Informações">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={form.person_type === "PJ" ? "Nome / identificação" : "Nome completo"} required value={form.name} onChange={value => setForm(current => ({ ...current, name: value }))} />
            <Field label={form.person_type === "PJ" ? "CNPJ" : "CPF"} required={form.roles.includes("employee")} value={form.person_type === "PJ" ? formatCnpj(form.document) : formatCpf(form.document)} onChange={value => setForm(current => ({ ...current, document: normalizeDigits(value) }))} />
            {form.person_type === "PJ" && <><Field label="Razão social" value={form.legal_name} onChange={value => setForm(current => ({ ...current, legal_name: value }))} /><Field label="Nome fantasia" value={form.trade_name} onChange={value => setForm(current => ({ ...current, trade_name: value }))} /><Field label="Inscrição estadual" value={form.state_registration} onChange={value => setForm(current => ({ ...current, state_registration: value }))} /><Field label="Data de fundação" type="date" value={form.foundation_date} onChange={value => setForm(current => ({ ...current, foundation_date: value }))} /></>}
            {form.person_type === "PF" && <Field label="Data de nascimento" type="date" value={form.birth_date} onChange={value => setForm(current => ({ ...current, birth_date: value }))} />}
            <Field label="Telefone" value={formatPhone(form.phone)} onChange={value => setForm(current => ({ ...current, phone: normalizeDigits(value) }))} />
            <Field label="WhatsApp" value={formatPhone(form.whatsapp)} onChange={value => setForm(current => ({ ...current, whatsapp: normalizeDigits(value) }))} />
            <Field label="E-mail" type="email" value={form.email} onChange={value => setForm(current => ({ ...current, email: value }))} />
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm font-bold text-[#0d1b2e]"><Checkbox checked={form.is_active} onCheckedChange={checked => setForm(current => ({ ...current, is_active: checked === true }))} /> Cadastro ativo</label>
        </Section>

        {form.roles.includes("employee") && <Section title="Funcionário">
          <div className="grid gap-4 sm:grid-cols-3"><Field label="Cargo" value={form.job_title} onChange={value => setForm(current => ({ ...current, job_title: value }))} /><Field label="Equipe" value={form.team_name} onChange={value => setForm(current => ({ ...current, team_name: value }))} /><Field label="Data de admissão" type="date" value={form.admission_date} onChange={value => setForm(current => ({ ...current, admission_date: value }))} /></div>
          <div className="mt-4 rounded-xl border border-[#d9e1ec] bg-[#f8fafc] p-4 text-xs leading-5 text-[#5a6a82]">O vínculo de funcionário não cria login automaticamente. Acesso ao sistema, função e permissões são administrados separadamente.</div>
        </Section>}

        <Section title="Endereço principal">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="CEP" value={form.zip_code} onChange={value => setForm(current => ({ ...current, zip_code: normalizeDigits(value).slice(0, 8) }))} /><Field label="UF" value={form.state} onChange={value => setForm(current => ({ ...current, state: value.toUpperCase().slice(0, 2) }))} /><Field label="Cidade" value={form.city} onChange={value => setForm(current => ({ ...current, city: value }))} /><Field label="Bairro" value={form.neighborhood} onChange={value => setForm(current => ({ ...current, neighborhood: value }))} /><div className="lg:col-span-2"><Field label="Rua" value={form.street} onChange={value => setForm(current => ({ ...current, street: value }))} /></div><Field label="Número" value={form.number} onChange={value => setForm(current => ({ ...current, number: value }))} /><Field label="Complemento" value={form.complement} onChange={value => setForm(current => ({ ...current, complement: value }))} /><div className="lg:col-span-2"><Field label="Referência" value={form.reference} onChange={value => setForm(current => ({ ...current, reference: value }))} /></div><div className="lg:col-span-2"><Field label="Link de localização" value={form.location_url} onChange={value => setForm(current => ({ ...current, location_url: value }))} placeholder="Google Maps ou link enviado" /></div></div>
        </Section>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><BtnSecondary onClick={closeEditor}>Cancelar</BtnSecondary><BtnPrimary disabled={saving || !canEdit && !creating} onClick={() => void save()}>{saving ? "Salvando..." : creating ? "Criar cadastro" : "Salvar alterações"}</BtnPrimary></div>
      </div>
    </AdminPage>;
  }

  if (selected && routeResourceId) {
    const roles = activeRoles(selected);
    const address = primaryAddress(selected);
    return <AdminPage open onClose={closeDetail} breadcrumb="Cadastros" title={selected.name} subtitle={selected.person_type === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <div className="space-y-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">{roles.map(role => <span key={role} className="rounded-full bg-[#eaf2ff] px-3 py-1 text-xs font-black text-[#0057e7]">{roleLabels[role]}</span>)}<StatusBadge status={selected.is_active ? "Ativo" : "Inativo"} /></div>
        <Section title="Informações"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[["Documento", selected.document ? (selected.person_type === "PJ" ? formatCnpj(selected.document) : formatCpf(selected.document)) : "—"],["Telefone", formatPhone(selected.phone) || "—"],["WhatsApp", formatPhone(selected.whatsapp) || "—"],["E-mail", selected.email || "—"],[selected.person_type === "PJ" ? "Razão social" : "Nascimento", selected.person_type === "PJ" ? selected.legal_name || "—" : selected.birth_date || "—"],[selected.person_type === "PJ" ? "Nome fantasia" : "Tipo", selected.person_type === "PJ" ? selected.trade_name || "—" : "Pessoa Física"]].map(([label,value]) => <div key={label}><div className="text-[10px] font-black uppercase tracking-wider text-[#8a98aa]">{label}</div><div className="mt-1 break-words text-sm font-bold text-[#0d1b2e]">{value}</div></div>)}</div></Section>
        {roles.includes("employee") && <Section title="Funcionário"><div className="grid gap-4 sm:grid-cols-3"><div><div className="text-[10px] font-black uppercase tracking-wider text-[#8a98aa]">Cargo</div><div className="mt-1 text-sm font-bold">{selected.employee_details?.[0]?.job_title || "—"}</div></div><div><div className="text-[10px] font-black uppercase tracking-wider text-[#8a98aa]">Equipe</div><div className="mt-1 text-sm font-bold">{selected.employee_details?.[0]?.team_name || "—"}</div></div><div><div className="text-[10px] font-black uppercase tracking-wider text-[#8a98aa]">Admissão</div><div className="mt-1 text-sm font-bold">{selected.employee_details?.[0]?.admission_date || "—"}</div></div></div></Section>}
        <Section title="Endereço"><div className="text-sm leading-6 text-[#0d1b2e]">{address ? [address.street, address.number, address.neighborhood, address.city, address.state].filter(Boolean).join(", ") || "Endereço sem logradouro informado." : "Nenhum endereço cadastrado."}</div>{address?.location_url && <a href={address.location_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-bold text-[#0057e7] hover:underline">Abrir localização</a>}</Section>
        <div className="flex flex-wrap justify-end gap-2">{roles.includes("customer") && selected.legacy_customer_id && onOpenCustomerHistory && <BtnSecondary onClick={() => onOpenCustomerHistory(selected.legacy_customer_id!)}>Ficha do cliente</BtnSecondary>}{roles.includes("employee") && onOpenAccessManagement && <BtnSecondary onClick={onOpenAccessManagement}><ShieldCheck size={15} /> Acessos e permissões</BtnSecondary>}{canEdit && <BtnPrimary onClick={openEdit}><Edit2 size={15} /> Editar cadastro</BtnPrimary>}</div>
      </div>
    </AdminPage>;
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
    <AdminCard>{loading ? <LoadingState /> : filtered.length === 0 ? <EmptyState icon={Users} title="Nenhum cadastro encontrado" message="Crie um cadastro ou ajuste os filtros." onAdd={canCreate ? openNew : undefined} addLabel="Novo cadastro" /> : <><div className="overflow-x-auto"><table className="min-w-[820px]"><thead><tr><th className="text-left">Nome / Razão social</th><th className="text-left">Tipo</th><th className="text-left">Vínculos</th><th className="text-left">CPF/CNPJ</th><th className="text-left">Telefone</th><th className="text-left">Status</th><th className="text-right">Ações</th></tr></thead><tbody>{paged.map(item => <tr key={item.id} className="cursor-default" onClick={() => openItem(item)}><td className="font-bold text-[#0d1b2e]">{item.name}</td><td className="text-xs text-[#5a6a82]">{item.person_type === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}</td><td><div className="flex flex-wrap gap-1">{activeRoles(item).map(role => <span key={role} className="rounded-full bg-[#eaf2ff] px-2 py-1 text-[10px] font-black text-[#0057e7]">{roleLabels[role]}</span>)}</div></td><td className="font-mono text-xs text-[#5a6a82]">{item.document ? item.person_type === "PJ" ? formatCnpj(item.document) : formatCpf(item.document) : "—"}</td><td className="text-xs text-[#5a6a82]">{formatPhone(item.phone) || "—"}</td><td><StatusBadge status={item.is_active ? "Ativo" : "Inativo"} /></td><td><div className="flex justify-end" onClick={event => event.stopPropagation()}><AdminIconButton ariaLabel="Abrir cadastro" title="Abrir cadastro" onClick={() => openItem(item)}><Edit2 size={15} /></AdminIconButton></div></td></tr>)}</tbody></table></div><PaginationBar page={safePage} pageSize={pageSize} totalItems={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} /></>}</AdminCard>
  </div>;
}
