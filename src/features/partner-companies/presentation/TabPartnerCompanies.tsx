import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Edit2, PauseCircle, PlayCircle, Plus } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { PLATFORM_ORGANIZATION_ID } from "@/lib/organization.constants";
import { AdminCard, AdminIconButton, BtnPrimary, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { EmptyState, LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { getPartnerCompany, listPartnerCompanies, setPartnerCompanyStatus } from "../infrastructure/partner-companies.repository";

const PartnerCompanyDetails = lazy(() => import("./PartnerCompanyDetails").then(module => ({ default: module.PartnerCompanyDetails })));
const PartnerCompanyEditorPage = lazy(() => import("./PartnerCompanyEditorPage").then(module => ({ default: module.PartnerCompanyEditorPage })));

type RouteProps = {
  onBack: () => void;
  routeResourceId?: string | null;
  onRouteChange?: (resourceId: string | null, subpage?: string | null) => void;
};

const LEGACY_AREAS = new Set(["users", "companies", "permissions"]);
const statusLabel = (value: string) => value === "active" ? "Ativa" : value === "suspended" ? "Suspensa" : "Cancelada";
const statusClass = (value: string) => value === "active" ? "bg-emerald-50 text-emerald-700" : value === "suspended" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600";

function PartnerPageFallback() {
  return <div className="p-8"><LoadingState text="Carregando empresa..." /></div>;
}

export function TabPartnerCompanies({ routeResourceId, onRouteChange }: RouteProps) {
  const { hasPermission, activeOrganizationId } = useAuth();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const isPlatformOrganization = activeOrganizationId === PLATFORM_ORGANIZATION_ID;
  const canCreate = hasPermission("organizations.create");
  const canEdit = hasPermission("organizations.edit");
  const canSuspend = hasPermission("organizations.suspend");
  const normalizedResourceId = routeResourceId && LEGACY_AREAS.has(routeResourceId) ? null : routeResourceId;

  const isNew = normalizedResourceId === "new";
  const editingId = normalizedResourceId?.startsWith("edit-") ? normalizedResourceId.slice(5) : null;
  const detailId = normalizedResourceId && !isNew && !editingId ? normalizedResourceId : null;

  const companiesQuery = useQuery({
    queryKey: ["partner-companies", "companies", { page, pageSize }],
    enabled: isPlatformOrganization && !normalizedResourceId,
    queryFn: () => listPartnerCompanies({ page, pageSize }),
    placeholderData: previous => previous,
  });
  const companies = companiesQuery.data?.items ?? [];
  const totalCompanies = companiesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCompanies / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

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
    return <Suspense fallback={<PartnerPageFallback />}><PartnerCompanyEditorPage
      open
      canSave={canCreate}
      onClose={() => onRouteChange?.(null, null)}
      onSaved={(company) => {
        void queryClient.invalidateQueries({ queryKey: ["partner-companies"] });
        onRouteChange?.(company.id, null);
      }}
    /></Suspense>;
  }

  if (editingId) {
    if (companyQuery.isPending) return <LoadingState text="Carregando empresa..." />;
    if (companyQuery.isError || !companyQuery.data) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">Não foi possível carregar a empresa: {(companyQuery.error as any)?.message || "Empresa não encontrada"}</div>;
    return <Suspense fallback={<PartnerPageFallback />}><PartnerCompanyEditorPage
      open
      company={companyQuery.data}
      canSave={canEdit}
      onClose={() => onRouteChange?.(editingId, null)}
      onSaved={(company) => {
        void queryClient.invalidateQueries({ queryKey: ["partner-companies"] });
        onRouteChange?.(company.id, null);
      }}
    /></Suspense>;
  }

  if (detailId) {
    if (companyQuery.isPending) return <LoadingState text="Carregando empresa..." />;
    if (companyQuery.isError || !companyQuery.data) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">Não foi possível carregar a empresa: {(companyQuery.error as any)?.message || "Empresa não encontrada"}</div>;
    return <Suspense fallback={<PartnerPageFallback />}><PartnerCompanyDetails
      company={companyQuery.data}
      canEdit={canEdit}
      onBack={() => onRouteChange?.(null, null)}
      onEdit={() => onRouteChange?.(`edit-${companyQuery.data.id}`, null)}
    /></Suspense>;
  }

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader
      title="Empresas Parceiras"
      subtitle="Gerencie empresas independentes, seus usuários, módulos e compartilhamentos em um só lugar."
      actions={canCreate ? <BtnPrimary onClick={() => onRouteChange?.("new", null)}><Plus size={15} /> Nova empresa</BtnPrimary> : undefined}
    />

    {companiesQuery.isFetching ? <LoadingState text="Carregando empresas..." /> : companiesQuery.isError ? (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">Não foi possível carregar as empresas: {(companiesQuery.error as any)?.message || "Erro desconhecido"}</div>
    ) : totalCompanies === 0 ? (
      <EmptyState icon={Building2} title="Nenhuma empresa parceira" message="Cadastre a primeira empresa parceira para iniciar a configuração." />
    ) : (
      <AdminCard>
        <div className="overflow-x-auto">
          <table className="min-w-[720px]">
            <thead><tr><th className="text-left">Empresa</th><th className="text-left">CPF/CNPJ</th><th className="text-left">Status</th><th className="text-right">Ações</th></tr></thead>
            <tbody>{companies.map((company: any) => <tr key={company.id} onClick={() => onRouteChange?.(company.id, null)} className="cursor-pointer">
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
        <PaginationBar
          page={page}
          pageSize={pageSize}
          totalItems={totalCompanies}
          onPageChange={setPage}
          onPageSizeChange={size => { setPageSize(size); setPage(1); }}
        />
      </AdminCard>
    )}
  </div>;
}