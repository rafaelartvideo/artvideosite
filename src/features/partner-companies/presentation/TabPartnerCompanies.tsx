import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Edit2, KeyRound, Plus, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminCard, AdminIconButton, BtnPrimary, BtnSecondary, InternalBackButton, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { EmptyState, LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import {
  createPartnerCompany,
  listOrganizationModules,
  listPartnerCompanies,
  listPartnerMembers,
  listPartnerShares,
  listSystemModules,
  setOrganizationModuleEnabled,
  updatePartnerCompany,
  type PartnerCompanyInput,
} from "../infrastructure/partner-companies.repository";

type PartnerArea = "users" | "companies" | "permissions";
type RouteProps = {
  onBack: () => void;
  routeResourceId?: string | null;
  onRouteChange?: (resourceId: string | null, subpage?: string | null) => void;
};

const AREA_ITEMS = [
  { id: "users" as const, label: "Usuários", description: "Visualize os usuários vinculados às empresas parceiras.", icon: Users, permission: "organizations.members.manage" },
  { id: "companies" as const, label: "Empresas", description: "Cadastre e gerencie as empresas independentes da plataforma.", icon: Building2, permission: "organizations.view" },
  { id: "permissions" as const, label: "Permissões", description: "Configure módulos e acompanhe os acessos compartilhados com a ArtVideo.", icon: ShieldCheck, permission: "organizations.modules.manage" },
];

const emptyCompany: PartnerCompanyInput = { name: "", legal_name: null, document: null, slug: "", status: "active" };
const normalizeSlug = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const statusLabel = (value: string) => value === "active" ? "Ativa" : value === "suspended" ? "Suspensa" : "Cancelada";

function AreaHeader({ title, description, onBack, action }: { title: string; description: string; onBack: () => void; action?: React.ReactNode }) {
  return <div className="space-y-4"><InternalBackButton onBack={onBack} /><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-black text-[#0d1b2e]">{title}</h2><p className="mt-1 text-sm text-[#5a6a82]">{description}</p></div>{action}</div></div>;
}

function CompaniesArea() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canCreate = hasPermission("organizations.create");
  const canEdit = hasPermission("organizations.edit");
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
    {formOpen && <AdminCard className="p-4 sm:p-5"><div className="grid gap-4 sm:grid-cols-2"><FInput label="Nome" required value={form.name} onChange={value => setForm(current => ({ ...current, name: value, slug: editing ? current.slug : normalizeSlug(value) }))} /><FInput label="Razão social" value={form.legal_name || ""} onChange={value => setForm(current => ({ ...current, legal_name: value }))} /><FInput label="CNPJ/Documento" value={form.document || ""} onChange={value => setForm(current => ({ ...current, document: value }))} /><FInput label="Identificador" value={form.slug} onChange={value => setForm(current => ({ ...current, slug: normalizeSlug(value) }))} /><FSelect label="Status" value={form.status} onChange={value => setForm(current => ({ ...current, status: value as PartnerCompanyInput["status"] }))}><option value="active">Ativa</option><option value="suspended">Suspensa</option><option value="cancelled">Cancelada</option></FSelect></div><div className="mt-4 flex justify-end gap-2"><BtnSecondary onClick={() => setFormOpen(false)}>Cancelar</BtnSecondary><BtnPrimary onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || (Boolean(editing) && !canEdit)}>{saveMutation.isPending ? "Salvando..." : "Salvar"}</BtnPrimary></div></AdminCard>}
    {companiesQuery.isPending ? <LoadingState /> : (companiesQuery.data || []).length === 0 ? <EmptyState icon={Building2} title="Nenhuma empresa parceira" message="Cadastre a primeira empresa para iniciar a configuração multiempresa." /> : <AdminCard><div className="overflow-x-auto"><table className="min-w-[760px]"><thead><tr><th className="text-left">Empresa</th><th className="text-left">Documento</th><th className="text-left">Identificador</th><th className="text-left">Status</th><th className="text-right">Ações</th></tr></thead><tbody>{(companiesQuery.data || []).map((company: any) => <tr key={company.id}><td><p className="font-bold text-[#0d1b2e]">{company.name}</p><p className="text-xs text-[#5a6a82]">{company.legal_name || "—"}</p></td><td className="text-sm text-[#5a6a82]">{company.document || "—"}</td><td className="text-sm text-[#5a6a82]">{company.slug}</td><td><span className="rounded-full bg-[#e8eef8] px-2.5 py-1 text-xs font-bold text-[#0d1b2e]">{statusLabel(company.status)}</span></td><td><div className="flex justify-end">{canEdit && <AdminIconButton title="Editar empresa" onClick={() => openEdit(company)}><Edit2 size={14} /></AdminIconButton>}</div></td></tr>)}</tbody></table></div></AdminCard>}
  </div>;
}

function UsersArea() {
  const companiesQuery = useQuery({ queryKey: ["partner-companies", "companies"], queryFn: async () => { const { data, error } = await listPartnerCompanies(); if (error) throw error; return data || []; } });
  const [organizationId, setOrganizationId] = useState("");
  useEffect(() => { if (!organizationId && companiesQuery.data?.[0]?.id) setOrganizationId(companiesQuery.data[0].id); }, [companiesQuery.data, organizationId]);
  const membersQuery = useQuery({ queryKey: ["partner-companies", "members", organizationId], enabled: Boolean(organizationId), queryFn: async () => { const { data, error } = await listPartnerMembers(organizationId); if (error) throw error; return data || []; } });
  return <div className="space-y-4"><AdminCard className="p-4"><FSelect label="Empresa" value={organizationId} onChange={setOrganizationId}><option value="">Selecione</option>{(companiesQuery.data || []).map((company: any) => <option key={company.id} value={company.id}>{company.name}</option>)}</FSelect></AdminCard>{membersQuery.isPending ? <LoadingState /> : (membersQuery.data || []).length === 0 ? <EmptyState icon={Users} title="Nenhum usuário vinculado" message="Esta empresa ainda não possui membros cadastrados." /> : <AdminCard><div className="overflow-x-auto"><table className="min-w-[680px]"><thead><tr><th className="text-left">Usuário</th><th className="text-left">Função</th><th className="text-left">Status</th><th className="text-left">Proprietário</th></tr></thead><tbody>{(membersQuery.data || []).map((member: any) => <tr key={member.id}><td className="font-bold text-[#0d1b2e]">{member.profile?.full_name || member.user_id}</td><td className="text-sm text-[#5a6a82]">{member.role?.name || "Sem função"}</td><td className="text-sm text-[#5a6a82]">{member.status}</td><td className="text-sm text-[#5a6a82]">{member.is_owner ? "Sim" : "Não"}</td></tr>)}</tbody></table></div></AdminCard>}</div>;
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
  return <div className="space-y-4"><AdminCard className="p-4"><FSelect label="Empresa" value={organizationId} onChange={setOrganizationId}><option value="">Selecione</option>{(companiesQuery.data || []).map((company: any) => <option key={company.id} value={company.id}>{company.name}</option>)}</FSelect></AdminCard><AdminCard className="p-4 sm:p-5"><div className="mb-4 flex items-center gap-2"><KeyRound size={17} className="text-[#0057e7]" /><div><h3 className="font-black text-[#0d1b2e]">Módulos liberados</h3><p className="text-xs text-[#5a6a82]">Controla quais áreas ficam disponíveis para a empresa selecionada.</p></div></div>{modulesQuery.isPending ? <LoadingState /> : <div className="grid gap-2 sm:grid-cols-2">{(modulesQuery.data?.systemModules || []).map((module: any) => { const enabled = enabledByKey.get(module.key) === true; return <button key={module.key} type="button" disabled={!canManageModules || toggleMutation.isPending} onClick={() => toggleMutation.mutate({ key: module.key, enabled: !enabled })} className="flex items-center justify-between rounded-xl border border-[#d9e1ec] px-3 py-3 text-left hover:border-[#0057e7]/40 disabled:cursor-default"><div className="min-w-0 pr-3"><p className="text-sm font-bold text-[#0d1b2e]">{module.name}</p><p className="mt-0.5 text-xs text-[#5a6a82]">{module.description}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{enabled ? "Ativo" : "Bloqueado"}</span></button>; })}</div>}</AdminCard><AdminCard className="p-4 sm:p-5"><h3 className="font-black text-[#0d1b2e]">Acesso compartilhado com a ArtVideo</h3><p className="mt-1 text-xs text-[#5a6a82]">Somente compartilhamentos explicitamente concedidos pela empresa aparecem aqui.</p>{sharesQuery.isPending ? <LoadingState /> : (sharesQuery.data || []).length === 0 ? <p className="mt-4 rounded-xl bg-[#f6f8fb] p-4 text-sm text-[#5a6a82]">Nenhum dado operacional foi compartilhado com a ArtVideo.</p> : <div className="mt-4 grid gap-2 sm:grid-cols-2">{(sharesQuery.data || []).map((share: any) => <div key={share.id} className="rounded-xl border border-[#d9e1ec] p-3"><p className="text-sm font-bold text-[#0d1b2e]">{share.resource_key}</p><p className="mt-1 text-xs font-bold uppercase text-[#0057e7]">{share.access_level}</p></div>)}</div>}</AdminCard></div>;
}

export function TabPartnerCompanies({ onBack, routeResourceId, onRouteChange }: RouteProps) {
  const { hasPermission } = useAuth();
  const area = (routeResourceId && AREA_ITEMS.some(item => item.id === routeResourceId) ? routeResourceId : null) as PartnerArea | null;
  const visibleItems = AREA_ITEMS.filter(item => hasPermission(item.permission));
  const openArea = (next: PartnerArea) => onRouteChange?.(next, null);
  const closeArea = () => onRouteChange?.(null, null);

  if (!area) return <div className="space-y-5"><div className="flex items-start gap-3"><InternalBackButton onBack={onBack} /></div><PageHeader title="Empresas Parceiras" subtitle="Administre empresas independentes, usuários e permissões da plataforma." /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleItems.map(item => { const Icon = item.icon; return <AdminCard key={item.id} className="group p-0 transition-all hover:border-[#0057e7]/40 hover:shadow-md"><button type="button" onClick={() => openArea(item.id)} className="w-full p-5 text-left"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#e8eef8] text-[#0057e7] group-hover:bg-[#0057e7] group-hover:text-white"><Icon size={19} /></div><h3 className="mt-4 text-base font-black text-[#0d1b2e]">{item.label}</h3><p className="mt-1.5 text-sm leading-5 text-[#5a6a82]">{item.description}</p><span className="mt-4 inline-block text-xs font-bold text-[#0057e7]">Acessar módulo</span></button></AdminCard>; })}</div></div>;

  const item = AREA_ITEMS.find(current => current.id === area)!;
  return <div className="space-y-5"><AreaHeader title={item.label} description={item.description} onBack={closeArea} />{area === "companies" && <CompaniesArea />}{area === "users" && <UsersArea />}{area === "permissions" && <PermissionsArea />}</div>;
}
