import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Edit2, PauseCircle, PlayCircle, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { PLATFORM_ORGANIZATION_ID } from "@/lib/organization.constants";
import { AdminCard, AdminIconButton, BtnPrimary, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { EmptyState, LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { useState } from "react";
import { PartnerCompanyDetails } from "./PartnerCompanyDetails";
import { PartnerCompanyEditorPage } from "./PartnerCompanyEditorPage";
import { getPartnerCompany, listPartnerCompanies, setPartnerCompanyStatus } from "../infrastructure/partner-companies.repository";

type RouteProps = {
  onBack: () => void;
  routeResourceId?: string | null;
  onRouteChange?: (resourceId: string | null, subpage?: string | null) => void;
};

const statusLabel = (value: string) => value === "active" ? "Ativa" : value === "suspended" ? "Suspensa" : "Cancelada";
const statusClass = (value: string) => value === "active" ? "bg-emerald-50 text-emerald-700" : value === "suspended" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600";

export function TabPartnerCompanies({ routeResourceId, onRouteChange }: RouteProps) {
  const { hasPermission, activeOrganizationId } = useAuth();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const isPlatformOrganization = activeOrganizationId === PLATFORM_ORGANIZATION_ID;
  const canCreate = hasPermission("organizations.create");
  const canEdit = hasPermission("organizations.edit");
  const canSuspend = hasPermission("organizations.suspend");

  const isNew = routeResourceId === "new";
  const editingId = routeResourceId?.startsWith("edit-") ? routeResourceId.slice(5) : null;
  const detailId = routeResourceId && !isNew && !editingId ? routeResourceId : null;

  const companiesQuery = useQuery({
    queryKey: ["partner-companies", "companies"],
    enabled: isPlatformOrganization,
    queryFn: async () => {
      const { data, error } = await listPartnerCompanies();
      if (error) throw error;
      return data || [];
    },
  });

  const selectedId = editingId || detailId;
  const companyQuery = useQuery({
    queryKey: ["partner-companies", "company", selectedId],
    enabled: Boolean(selectedId) && isPlatformOrganization,
    queryFn: async () => {
      const { data, error } = await getPartnerCompany(selectedId!);
      if (error) throw error;
      return data;
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (company: any) => {
      const nextStatus = company.status === "active" ? "suspended" : "active";
      const { data, error } = await setPartnerCompanyStatus(company.id, nextStatus);
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      void queryClient.invalidateQueries({ queryKey: ["partner-companies"] });
      setToast({ msg: data?.status === "active" ? "Empresa reativada." : "Empresa suspensa.", type: "success" });
    },
    onError: (error: any) => setToast({ msg: `Não foi possível alterar o status: ${error?.message || "Erro desconhecido"}`, type: "error" }),
  });

  if (!isPlatformOrganization) return null;

  if (isNew) {
    return <PartnerCompanyEditorPage
      open
      canSave={canCreate}
      onClose={() => onRouteChange?.(null, null)}
      onSaved={(company) => {
        void queryClient.invalidateQueries({ queryKey: ["partner-companies"] });
        onRouteChange?.(company.id, null);
      }}
    />;
  }

  if (editingId) {
    if (companyQuery.isPending) return <LoadingState text="Carregando empresa..." />;
    if (companyQuery.isError || !companyQuery.data) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">Não foi possível carregar a empresa: {(companyQuery.error as any)?.message || "Empresa não encontrada"}</div>;
    return <PartnerCompanyEditorPage
      open
      company={companyQuery.data}
      canSave={canEdit}
      onClose={() => onRouteChange?.(editingId, null)}
      onSaved={(company) => {
        void queryClient.invalidateQueries({ queryKey: ["partner-companies"] });
        onRouteChange?.(company.id, null);
      }}
    />;
  }

  if (detailId) {
    if (companyQuery.isPending) return <LoadingState text="Carregando empresa..." />;
    if (companyQuery.isError || !companyQuery.data) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">Não foi possível carregar a empresa: {(companyQuery.error as any)?.message || "Empresa não encontrada"}</div>;
    return <PartnerCompanyDetails
      company={companyQuery.data}
      canEdit={canEdit}
      onBack={() => onRouteChange?.(null, null)}
      onEdit={() => onRouteChange?.(`edit-${companyQuery.data.id}`, null)}
    />;
  }

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader
      title="Empresas Parceiras"
      subtitle="Gerencie empresas independentes, seus usuários, módulos e compartilhamentos em um só lugar."
      actions={canCreate ? <BtnPrimary onClick={() => onRouteChange?.("new", null)}><Plus size={15} /> Nova empresa</BtnPrimary> : undefined}
    />

    {companiesQuery.isPending ? <LoadingState /> : companiesQuery.isError ? (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">Não foi possível carregar as empresas: {(companiesQuery.error as any)?.message || "Erro desconhecido"}</div>
    ) : (companiesQuery.data || []).length === 0 ? (
      <EmptyState icon={Building2} title="Nenhuma empresa parceira" message="Cadastre a primeira empresa parceira para iniciar a configuração." />
    ) : (
      <AdminCard>
        <div className="overflow-x-auto">
          <table className="min-w-[720px]">
            <thead><tr><th className="text-left">Empresa</th><th className="text-left">CPF/CNPJ</th><th className="text-left">Status</th><th className="text-right">Ações</th></tr></thead>
            <tbody>{(companiesQuery.data || []).map((company: any) => <tr key={company.id} onClick={() => onRouteChange?.(company.id, null)} className="cursor-pointer">
              <td><p className="font-bold text-[#0d1b2e]">{company.name}</p><p className="text-xs text-[#5a6a82]">{company.legal_name || (company.settings?.person_type === "PF" ? "Pessoa Física" : "Pessoa Jurídica")}</p></td>
              <td className="text-sm text-[#5a6a82]">{company.document || "—"}</td>
              <td><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(company.status)}`}>{statusLabel(company.status)}</span></td>
              <td onClick={(event) => event.stopPropagation()}><div className="flex justify-end gap-2">
                {canEdit && <AdminIconButton title="Editar empresa" onClick={() => onRouteChange?.(`edit-${company.id}`, null)}><Edit2 size={14} /></AdminIconButton>}
                {canSuspend && company.status !== "cancelled" && <AdminIconButton title={company.status === "active" ? "Suspender empresa" : "Reativar empresa"} onClick={() => statusMutation.mutate(company)} loading={statusMutation.isPending}>{company.status === "active" ? <PauseCircle size={14} /> : <PlayCircle size={14} />}</AdminIconButton>}
              </div></td>
            </tr>)}</tbody>
          </table>
        </div>
      </AdminCard>
    )}
  </div>;
}
