import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Edit2, KeyRound, Plus, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminCard, AdminIconButton, BtnPrimary, BtnSecondary, InternalBackButton, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { EmptyState, LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FCpfInput, FEmailInput, FInput, FPhoneInput, FSelect, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { PartnerPermissionsArea } from "./PartnerPermissionsArea";
import {
  createPartnerCompany,
  createPartnerUser,
  listOrganizationModules,
  listPartnerCompanies,
  listPartnerRoles,
  listPartnerShares,
  listPartnerUsers,
  listSystemModules,
  setOrganizationModuleEnabled,
  updatePartnerCompany,
  updatePartnerUser,
  type PartnerCompanyInput,
} from "../infrastructure/partner-companies.repository";

type PartnerArea = "users" | "companies" | "permissions";
type RouteProps = {
  onBack: () => void;
  routeResourceId?: string | null;
  onRouteChange?: (resourceId: string | null, subpage?: string | null) => void;
};

type PartnerUserForm = {
  full_name: string;
  cpf: string;
  phone: string;
  email: string;
  password: string;
  function_name: string;
  role_id: string;
  is_owner: boolean;
  is_active: boolean;
};

const AREA_ITEMS = [
  { id: "users" as const, label: "Usuários", description: "Cadastre e gerencie os usuários vinculados às empresas parceiras.", icon: Users, permission: "organizations.members.manage" },
  { id: "companies" as const, label: "Empresas", description: "Cadastre e gerencie as empresas independentes da plataforma.", icon: Building2, permission: "organizations.view" },
  { id: "permissions" as const, label: "Permissões", description: "Configure módulos e acompanhe os acessos compartilhados com a ArtVideo.", icon: ShieldCheck, permission: "organizations.modules.manage" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Ativa" },
  { value: "suspended", label: "Suspensa" },
  { value: "cancelled", label: "Cancelada" },
];
const emptyCompany: PartnerCompanyInput = { name: "", legal_name: null, document: null, slug: "", status: "active" };
const emptyUser: PartnerUserForm = { full_name: "", cpf: "", phone: "", email: "", password: "", function_name: "", role_id: "", is_owner: false, is_active: true };
const normalizeSlug = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const statusLabel = (value: string) => value === "active" ? "Ativa" : value === "suspended" ? "Suspensa" : "Cancelada";
const memberStatusLabel = (value: string) => value === "active" ? "Ativo" : value === "invited" ? "Convidado" : "Bloqueado";
const companyOptions = (companies: any[]) => [{ value: "", label: "Selecione" }, ...companies.map(company => ({ value: company.id, label: company.name }))];

function AreaHeader({ title, description, onBack, action }: { title: string; description: string; onBack: () => void; action?: ReactNode }) {
  return <div className="space-y-4"><InternalBackButton onBack={onBack} /><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-black text-[#0d1b2e]">{title}</h2><p className="mt-1 text-sm text-[#5a6a82]">{description}</p></div>{action}</div></div>;
}

function CompaniesArea() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canCreate = hasPermission("organizations.create");
  const canEdit = hasPermission("organizations.edit") || hasPermission("organizations.suspend");
  const companiesQuery = useQuery({ queryKey: ["partner-companies", "companies"], queryFn: async () => { const { data, error } = await listPartnerCompanies(); if (error) throw error; return data || []; } });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<PartnerCompanyInput>(emptyCompany);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, name: form.name.trim(), legal_name: form.legal_name?.trim() || null, document: form.document?.trim() || null, slug: normalizeSlug(form.slug || form.name) };
      if (!payload.name || !payload.slug) throw new Error("Informe o nome da empresa.");
      const result = editing ? await updatePartnerCompany(editing.id, payload) : await createPartnerCompany(payload);
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["partner-companies"] }); setFormOpen(false); setEditing(null); setForm(emptyCompany); setToast({ msg: "Empresa salva com sucesso.", type: "success" }); },
    onError: (error: any) => setToast({ msg: `Não foi possível salvar a empresa: ${error?.message || "Erro desconhecido"}`, type: "error" }),
  });

  const openNew = () => { setEditing(null); setForm(emptyCompany); setFormOpen(true); };
  const openEdit = (company: any) => { setEditing(company); setForm({ name: company.name || "", legal_name: company.legal_name || null, document: company.document || null, slug: company.slug || "", status: company.status || "active" }); setFormOpen(true); };

  return <div className="space-y-4">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <div className="flex justify-end">{canCreate && <BtnPrimary onClick={openNew}><Plus size={15} /> Nova empresa</BtnPrimary>}</div>
    {formOpen && <AdminCard className="p-4 sm:p-5"><div className="grid gap-4 sm:grid-cols-2">
      <FInput label="Nome" required value={form.name} onChange={(event: any) => { const value = event.target.value; setForm(current => ({ ...current, name: value, slug: editing ? current.slug : normalizeSlug(value) })); }} />
      <FInput label="Razão social" value={form.legal_name || ""} onChange={(event: any) => setForm(current => ({ ...current, legal_name: event.target.value }))} />
      <FInput label="CNPJ/Documento" value={form.document || ""} onChange={(event: any) => setForm(current => ({ ...current, document: event.target.value }))} />
      <FInput label="Identificador" value={form.slug} onChange={(event: any) => setForm(current => ({ ...current, slug: normalizeSlug(event.target.value) }))} />
      <FSelect label="Status" value={form.status} options={STATUS_OPTIONS} onChange={(event: any) => setForm(current => ({ ...current, status: event.target.value as PartnerCompanyInput["status"] }))} />
    </div><div className="mt-4 flex justify-end gap-2"><BtnSecondary onClick={() => setFormOpen(false)}>Cancelar</BtnSecondary><BtnPrimary onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || (Boolean(editing) && !canEdit)}>{saveMutation.isPending ? "Salvando..." : "Salvar"}</BtnPrimary></div></AdminCard>}
    {companiesQuery.isPending ? <LoadingState /> : (companiesQuery.data || []).length === 0 ? <EmptyState icon={Building2} title="Nenhuma empresa parceira" message="Cadastre a primeira empresa para iniciar a configuração multiempresa." /> : <AdminCard><div className="overflow-x-auto"><table className="min-w-[760px]"><thead><tr><th className="text-left">Empresa</th><th className="text-left">Documento</th><th className="text-left">Identificador</th><th className="text-left">Status</th><th className="text-right">Ações</th></tr></thead><tbody>{(companiesQuery.data || []).map((company: any) => <tr key={company.id}><td><p className="font-bold text-[#0d1b2e]">{company.name}</p><p className="text-xs text-[#5a6a82]">{company.legal_name || "—"}</p></td><td className="text-sm text-[#5a6a82]">{company.document || "—"}</td><td className="text-sm text-[#5a6a82]">{company.slug}</td><td><span className="rounded-full bg-[#e8eef8] px-2.5 py-1 text-xs font-bold text-[#0d1b2e]">{statusLabel(company.status)}</span></td><td><div className="flex justify-end">{canEdit && <AdminIconButton title="Editar empresa" onClick={() => openEdit(company)}><Edit2 size={14} /></AdminIconButton>}</div></td></tr>)}</tbody></table></div></AdminCard>}
  </div>;
}

function UsersArea() {
  const queryClient = useQueryClient();
  const companiesQuery = useQuery({ queryKey: ["partner-companies", "companies"], queryFn: async () => { const { data, error } = await listPartnerCompanies(); if (error) throw error; return data || []; } });
  const rolesQuery = useQuery({ queryKey: ["partner-companies", "roles"], queryFn: async () => { const { data, error } = await listPartnerRoles(); if (error) throw error; return data || []; } });
  const [organizationId, setOrganizationId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<PartnerUserForm>(emptyUser);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  useEffect(() => { if (!organizationId && companiesQuery.data?.[0]?.id) setOrganizationId(companiesQuery.data[0].id); }, [companiesQuery.data, organizationId]);
  useEffect(() => { setFormOpen(false); setEditing(null); setForm(emptyUser); }, [organizationId]);

  const usersQuery = useQuery({ queryKey: ["partner-companies", "users", organizationId], enabled: Boolean(organizationId), queryFn: async () => { const { data, error } = await listPartnerUsers(organizationId); if (error) throw error; return data || []; } });
  const roleOptions = [{ value: "", label: "Selecione" }, ...(rolesQuery.data || []).map((role: any) => ({ value: role.id, label: role.name }))];
  const selectedCompany = (companiesQuery.data || []).find((company: any) => company.id === organizationId);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Selecione a empresa.");
      if (!form.full_name.trim() || !form.cpf.replace(/\D/g, "") || !form.role_id) throw new Error("Preencha nome, CPF e função.");
      if (!editing && !form.email.trim()) throw new Error("Informe o e-mail do usuário.");
      const payload = {
        organization_id: organizationId,
        full_name: form.full_name.trim(),
        cpf: form.cpf,
        phone: form.phone.trim() || null,
        email: form.email.trim(),
        password: form.password,
        function_name: form.function_name.trim() || null,
        role_id: form.role_id,
        is_owner: form.is_owner,
        is_active: form.is_active,
      };
      const result = editing
        ? await updatePartnerUser({ ...payload, user_id: editing.user_id })
        : await createPartnerUser(payload);
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: (data: any) => {
      void queryClient.invalidateQueries({ queryKey: ["partner-companies", "users", organizationId] });
      setFormOpen(false); setEditing(null); setForm(emptyUser);
      setToast({ msg: data?.reused_existing_login ? "Usuário existente vinculado à empresa." : "Usuário salvo com sucesso.", type: "success" });
    },
    onError: (error: any) => setToast({ msg: `Não foi possível salvar o usuário: ${error?.message || "Erro desconhecido"}`, type: "error" }),
  });

  const openNew = () => { setEditing(null); setForm(emptyUser); setFormOpen(true); };
  const openEdit = (user: any) => { setEditing(user); setForm({ full_name: user.full_name || "", cpf: user.cpf || "", phone: user.phone || "", email: user.email || "", password: "", function_name: user.function_name || "", role_id: user.role_id || "", is_owner: user.is_owner === true, is_active: user.status === "active" }); setFormOpen(true); };

  return <div className="space-y-4">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <AdminCard className="p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="min-w-0 flex-1"><FSelect label="Empresa" value={organizationId} options={companyOptions(companiesQuery.data || [])} onChange={(event: any) => setOrganizationId(event.target.value)} /></div><BtnPrimary onClick={openNew} disabled={!organizationId || selectedCompany?.status !== "active"}><Plus size={15} /> Novo usuário</BtnPrimary></div>{selectedCompany && selectedCompany.status !== "active" && <p className="mt-2 text-xs font-semibold text-amber-700">Ative a empresa para cadastrar novos usuários. Usuários existentes continuam disponíveis para consulta e edição.</p>}</AdminCard>
    {formOpen && <AdminCard className="p-4 sm:p-5"><div className="mb-4"><h3 className="font-black text-[#0d1b2e]">{editing ? "Editar usuário" : "Novo usuário"}</h3><p className="mt-1 text-xs text-[#5a6a82]">{editing ? "As alterações abaixo valem para o vínculo com esta empresa." : "Se o e-mail já existir, o login será apenas vinculado a esta empresa e a senha informada será ignorada."}</p></div><div className="grid gap-4 sm:grid-cols-2">
      <FInput label="Nome completo" required value={form.full_name} onChange={(event: any) => setForm(current => ({ ...current, full_name: event.target.value }))} />
      <FCpfInput label="CPF" required value={form.cpf} onChange={(event: any) => setForm(current => ({ ...current, cpf: event.target.value }))} />
      <FPhoneInput label="Telefone" mobile value={form.phone} onChange={(event: any) => setForm(current => ({ ...current, phone: event.target.value }))} />
      <FEmailInput label="E-mail" required={!editing} disabled={Boolean(editing)} value={form.email} onChange={(event: any) => setForm(current => ({ ...current, email: event.target.value }))} />
      {!editing && <FInput label="Senha temporária" type="password" hint="Obrigatória somente se o e-mail ainda não existir. Mínimo de 8 caracteres." value={form.password} onChange={(event: any) => setForm(current => ({ ...current, password: event.target.value }))} />}
      <FSelect label="Função" required value={form.role_id} options={roleOptions} onChange={(event: any) => setForm(current => ({ ...current, role_id: event.target.value }))} />
      <FInput label="Cargo/Função exibida" value={form.function_name} onChange={(event: any) => setForm(current => ({ ...current, function_name: event.target.value }))} />
      <div className="space-y-3 sm:col-span-2"><FToggle label="Usuário ativo" description="Quando desativado, o vínculo com esta empresa fica bloqueado." checked={form.is_active} onChange={value => setForm(current => ({ ...current, is_active: value }))} /><FToggle label="Proprietário da empresa" description="Marca o usuário como proprietário deste tenant. Não concede acesso a outras empresas." checked={form.is_owner} onChange={value => setForm(current => ({ ...current, is_owner: value }))} /></div>
    </div><div className="mt-5 flex justify-end gap-2"><BtnSecondary onClick={() => { setFormOpen(false); setEditing(null); setForm(emptyUser); }}>Cancelar</BtnSecondary><BtnPrimary onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>{saveMutation.isPending ? "Salvando..." : "Salvar usuário"}</BtnPrimary></div></AdminCard>}
    {usersQuery.isPending ? <LoadingState /> : (usersQuery.data || []).length === 0 ? <EmptyState icon={Users} title="Nenhum usuário vinculado" message="Esta empresa ainda não possui usuários cadastrados." /> : <AdminCard><div className="overflow-x-auto"><table className="min-w-[820px]"><thead><tr><th className="text-left">Usuário</th><th className="text-left">E-mail</th><th className="text-left">Função</th><th className="text-left">Status</th><th className="text-left">Proprietário</th><th className="text-right">Ações</th></tr></thead><tbody>{(usersQuery.data || []).map((user: any) => <tr key={user.membership_id}><td><p className="font-bold text-[#0d1b2e]">{user.full_name || "—"}</p><p className="text-xs text-[#5a6a82]">{user.phone || user.cpf || "—"}</p></td><td className="text-sm text-[#5a6a82]">{user.email || "—"}</td><td className="text-sm text-[#5a6a82]">{user.role_name || user.function_name || "Sem função"}</td><td><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${user.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{memberStatusLabel(user.status)}</span></td><td className="text-sm text-[#5a6a82]">{user.is_owner ? "Sim" : "Não"}</td><td><div className="flex justify-end"><AdminIconButton title="Editar usuário" onClick={() => openEdit(user)}><Edit2 size={14} /></AdminIconButton></div></td></tr>)}</tbody></table></div></AdminCard>}
  </div>;
}

function PermissionsArea() {
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canManageModules = hasPermission("organizations.modules.manage");
  const companiesQuery = useQuery({ queryKey: ["partner-companies", "companies"], queryFn: async () => { const { data, error } = await listPartnerCompanies(); if (error) throw error; return data || []; } });
  const [organizationId, setOrganizationId] = useState("");
  useEffect(() => { if (!organizationId && companiesQuery.data?.[0]?.id) setOrganizationId(companiesQuery.data[0].id); }, [companiesQuery.data, organizationId]);
  const modulesQuery = useQuery({ queryKey: ["partner-companies", "modules", organizationId], enabled: Boolean(organizationId), queryFn: async () => { const [{ data: systemModules, error: systemError }, { data: organizationModules, error: orgError }] = await Promise.all([listSystemModules(), listOrganizationModules(organizationId)]); if (systemError || orgError) throw systemError || orgError; return { systemModules: systemModules || [], organizationModules: organizationModules || [] }; } });
  const sharesQuery = useQuery({ queryKey: ["partner-companies", "shares", organizationId], enabled: Boolean(organizationId), queryFn: async () => { const { data, error } = await listPartnerShares(organizationId); if (error) throw error; return data || []; } });
  const enabledByKey = useMemo(() => new Map((modulesQuery.data?.organizationModules || []).map((item: any) => [item.module_key, item.is_enabled])), [modulesQuery.data]);
  const toggleMutation = useMutation({ mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => { const { error } = await setOrganizationModuleEnabled(organizationId, key, enabled, user?.id); if (error) throw error; }, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["partner-companies", "modules", organizationId] }) });
  return <div className="space-y-4"><AdminCard className="p-4"><FSelect label="Empresa" value={organizationId} options={companyOptions(companiesQuery.data || [])} onChange={(event: any) => setOrganizationId(event.target.value)} /></AdminCard><AdminCard className="p-4 sm:p-5"><div className="mb-4 flex items-center gap-2"><KeyRound size={17} className="text-[#0057e7]" /><div><h3 className="font-black text-[#0d1b2e]">Módulos liberados</h3><p className="text-xs text-[#5a6a82]">Controla quais áreas ficam disponíveis para a empresa selecionada.</p></div></div>{modulesQuery.isPending ? <LoadingState /> : <div className="grid gap-2 sm:grid-cols-2">{(modulesQuery.data?.systemModules || []).map((module: any) => { const enabled = enabledByKey.get(module.key) === true; return <button key={module.key} type="button" disabled={!canManageModules || toggleMutation.isPending} onClick={() => toggleMutation.mutate({ key: module.key, enabled: !enabled })} className="flex items-center justify-between rounded-xl border border-[#d9e1ec] px-3 py-3 text-left hover:border-[#0057e7]/40 disabled:cursor-default"><div className="min-w-0 pr-3"><p className="text-sm font-bold text-[#0d1b2e]">{module.name}</p><p className="mt-0.5 text-xs text-[#5a6a82]">{module.description}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{enabled ? "Ativo" : "Bloqueado"}</span></button>; })}</div>}</AdminCard><AdminCard className="p-4 sm:p-5"><h3 className="font-black text-[#0d1b2e]">Acesso compartilhado com a ArtVideo</h3><p className="mt-1 text-xs text-[#5a6a82]">Somente compartilhamentos explicitamente concedidos pela empresa aparecem aqui.</p>{sharesQuery.isPending ? <LoadingState /> : (sharesQuery.data || []).length === 0 ? <p className="mt-4 rounded-xl bg-[#f6f8fb] p-4 text-sm text-[#5a6a82]">Nenhum dado operacional foi compartilhado com a ArtVideo.</p> : <div className="mt-4 grid gap-2 sm:grid-cols-2">{(sharesQuery.data || []).map((share: any) => <div key={share.id} className="rounded-xl border border-[#d9e1ec] p-3"><p className="text-sm font-bold text-[#0d1b2e]">{share.resource_key}</p><p className="mt-1 text-xs font-bold uppercase text-[#0057e7]">{share.access_level}</p></div>)}</div>}</AdminCard></div>;
}

export function TabPartnerCompanies({ onBack, routeResourceId, onRouteChange }: RouteProps) {
  const { hasPermission } = useAuth();
  const area = (routeResourceId && AREA_ITEMS.some(item => item.id === routeResourceId) ? routeResourceId : null) as PartnerArea | null;
  const visibleItems = AREA_ITEMS.filter(item => hasPermission(item.permission));
  const openArea = (next: PartnerArea) => onRouteChange?.(next, null);
  const closeArea = () => onRouteChange?.(null, null);

  if (!area) return <div className="space-y-5"><InternalBackButton onBack={onBack} /><PageHeader title="Empresas Parceiras" subtitle="Administre empresas independentes, usuários e permissões da plataforma." /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleItems.map(item => { const Icon = item.icon; return <AdminCard key={item.id} className="group p-0 transition-all hover:border-[#0057e7]/40 hover:shadow-md"><button type="button" onClick={() => openArea(item.id)} className="w-full p-5 text-left"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#e8eef8] text-[#0057e7] group-hover:bg-[#0057e7] group-hover:text-white"><Icon size={19} /></div><h3 className="mt-4 text-base font-black text-[#0d1b2e]">{item.label}</h3><p className="mt-1.5 text-sm leading-5 text-[#5a6a82]">{item.description}</p><span className="mt-4 inline-block text-xs font-bold text-[#0057e7]">Acessar módulo</span></button></AdminCard>; })}</div></div>;

  const item = AREA_ITEMS.find(current => current.id === area)!;
  return <div className="space-y-5"><AreaHeader title={item.label} description={item.description} onBack={closeArea} />{area === "companies" && <CompaniesArea />}{area === "users" && <UsersArea />}{area === "permissions" && <PartnerPermissionsArea />}</div>;
}
