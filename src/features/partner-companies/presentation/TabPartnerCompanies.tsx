import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Edit2, Plus, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { PLATFORM_ORGANIZATION_ID } from "@/lib/organization.constants";
import { AdminHubPage } from "@/features/admin-shell/presentation/AdminNavigation";
import { AdminCard, AdminIconButton, BtnPrimary, BtnSecondary, InternalBackButton, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { EmptyState, LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import { PartnerPermissionsArea } from "./PartnerPermissionsArea";
import { PartnerUsersArea } from "./PartnerUsersArea";
import {
  createPartnerCompany,
  listPartnerCompanies,
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
  {
    id: "users" as const,
    label: "Usuários",
    description: "Cadastre e gerencie os usuários vinculados às empresas parceiras.",
    icon: Users,
    permissionKey: "organizations.members.manage",
  },
  {
    id: "companies" as const,
    label: "Empresas",
    description: "Cadastre e gerencie as empresas independentes da plataforma.",
    icon: Building2,
    permissionKey: "organizations.view",
  },
  {
    id: "permissions" as const,
    label: "Permissões",
    description: "Configure módulos e os acessos compartilhados com a ArtVideo.",
    icon: ShieldCheck,
    permissionKey: "organizations.modules.manage",
  },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Ativa" },
  { value: "suspended", label: "Suspensa" },
  { value: "cancelled", label: "Cancelada" },
];

const emptyCompany: PartnerCompanyInput = {
  name: "",
  legal_name: null,
  document: null,
  slug: "",
  status: "active",
};

const normalizeSlug = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const statusLabel = (value: string) =>
  value === "active" ? "Ativa" : value === "suspended" ? "Suspensa" : "Cancelada";

function CompaniesArea() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canCreate = hasPermission("organizations.create");
  const canEdit = hasPermission("organizations.edit") || hasPermission("organizations.suspend");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<PartnerCompanyInput>(emptyCompany);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const companiesQuery = useQuery({
    queryKey: ["partner-companies", "companies"],
    queryFn: async () => {
      const { data, error } = await listPartnerCompanies();
      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        name: form.name.trim(),
        legal_name: form.legal_name?.trim() || null,
        document: form.document?.trim() || null,
        slug: normalizeSlug(form.slug || form.name),
      };
      if (!payload.name || !payload.slug) throw new Error("Informe o nome da empresa.");
      const result = editing
        ? await updatePartnerCompany(editing.id, payload)
        : await createPartnerCompany(payload);
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["partner-companies"] });
      setFormOpen(false);
      setEditing(null);
      setForm(emptyCompany);
      setToast({ msg: "Empresa salva com sucesso.", type: "success" });
    },
    onError: (error: any) => setToast({
      msg: `Não foi possível salvar a empresa: ${error?.message || "Erro desconhecido"}`,
      type: "error",
    }),
  });

  const openNew = () => {
    setEditing(null);
    setForm(emptyCompany);
    setFormOpen(true);
  };

  const openEdit = (company: any) => {
    setEditing(company);
    setForm({
      name: company.name || "",
      legal_name: company.legal_name || null,
      document: company.document || null,
      slug: company.slug || "",
      status: company.status || "active",
    });
    setFormOpen(true);
  };

  return <div className="space-y-4">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    <div className="flex justify-end">
      {canCreate && <BtnPrimary onClick={openNew}><Plus size={15} /> Nova empresa</BtnPrimary>}
    </div>

    {formOpen && <AdminCard className="p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <FInput
          label="Nome"
          required
          value={form.name}
          onChange={(event: any) => {
            const value = event.target.value;
            setForm(current => ({
              ...current,
              name: value,
              slug: editing ? current.slug : normalizeSlug(value),
            }));
          }}
        />
        <FInput label="Razão social" value={form.legal_name || ""} onChange={(event: any) => setForm(current => ({ ...current, legal_name: event.target.value }))} />
        <FInput label="CNPJ/Documento" value={form.document || ""} onChange={(event: any) => setForm(current => ({ ...current, document: event.target.value }))} />
        <FInput label="Identificador" value={form.slug} onChange={(event: any) => setForm(current => ({ ...current, slug: normalizeSlug(event.target.value) }))} />
        <FSelect label="Status" value={form.status} options={STATUS_OPTIONS} onChange={(event: any) => setForm(current => ({ ...current, status: event.target.value as PartnerCompanyInput["status"] }))} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <BtnSecondary onClick={() => setFormOpen(false)}>Cancelar</BtnSecondary>
        <BtnPrimary onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || (Boolean(editing) && !canEdit)}>
          {saveMutation.isPending ? "Salvando..." : "Salvar"}
        </BtnPrimary>
      </div>
    </AdminCard>}

    {companiesQuery.isPending ? <LoadingState /> : companiesQuery.isError ? (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
        Não foi possível carregar as empresas: {(companiesQuery.error as any)?.message || "Erro desconhecido"}
      </div>
    ) : (companiesQuery.data || []).length === 0 ? (
      <EmptyState icon={Building2} title="Nenhuma empresa parceira" message="Cadastre a primeira empresa para iniciar a configuração multiempresa." />
    ) : (
      <AdminCard>
        <div className="overflow-x-auto">
          <table className="min-w-[760px]">
            <thead><tr><th className="text-left">Empresa</th><th className="text-left">Documento</th><th className="text-left">Identificador</th><th className="text-left">Status</th><th className="text-right">Ações</th></tr></thead>
            <tbody>{(companiesQuery.data || []).map((company: any) => <tr key={company.id}>
              <td><p className="font-bold text-[#0d1b2e]">{company.name}</p><p className="text-xs text-[#5a6a82]">{company.legal_name || "—"}</p></td>
              <td className="text-sm text-[#5a6a82]">{company.document || "—"}</td>
              <td className="text-sm text-[#5a6a82]">{company.slug}</td>
              <td><span className="rounded-full bg-[#e8eef8] px-2.5 py-1 text-xs font-bold text-[#0d1b2e]">{statusLabel(company.status)}</span></td>
              <td><div className="flex justify-end">{canEdit && <AdminIconButton title="Editar empresa" onClick={() => openEdit(company)}><Edit2 size={14} /></AdminIconButton>}</div></td>
            </tr>)}</tbody>
          </table>
        </div>
      </AdminCard>
    )}
  </div>;
}

export function TabPartnerCompanies({ routeResourceId, onRouteChange }: RouteProps) {
  const { hasPermission, activeOrganizationId } = useAuth();
  const isPlatformOrganization = activeOrganizationId === PLATFORM_ORGANIZATION_ID;

  if (!isPlatformOrganization) return null;

  const area = (
    routeResourceId && AREA_ITEMS.some(item => item.id === routeResourceId)
      ? routeResourceId
      : null
  ) as PartnerArea | null;

  const visibleItems = AREA_ITEMS
    .filter(item => hasPermission(item.permissionKey))
    .map(({ permissionKey: _permissionKey, ...item }) => item);

  const openArea = (next: PartnerArea) => onRouteChange?.(next, null);
  const closeArea = () => onRouteChange?.(null, null);

  if (!area) {
    return <AdminHubPage
      title="Empresas Parceiras"
      description="Administre empresas independentes, usuários e permissões da plataforma."
      items={visibleItems}
      onSelect={id => openArea(id as PartnerArea)}
    />;
  }

  const item = AREA_ITEMS.find(current => current.id === area)!;

  return <div className="min-w-0 space-y-5">
    <PageHeader
      title={item.label}
      subtitle={item.description}
      actions={<InternalBackButton onBack={closeArea} />}
    />
    {area === "companies" && <CompaniesArea />}
    {area === "users" && <PartnerUsersArea />}
    {area === "permissions" && <PartnerPermissionsArea />}
  </div>;
}
