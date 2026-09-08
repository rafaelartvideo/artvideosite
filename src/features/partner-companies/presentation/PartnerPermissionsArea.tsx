import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, KeyRound, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminCard } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FSelect } from "@/shared/ui/admin/AdminFormControls";
import {
  listOrganizationModules,
  listPartnerCompanies,
  listPartnerShares,
  listSystemModules,
  setOrganizationModuleEnabled,
  setPartnerDataShare,
  type PartnerShareAccessLevel,
} from "../infrastructure/partner-companies.repository";

const SAFE_PARTNER_MODULES = new Set([
  "customers",
  "orders",
  "inventory",
  "equipment",
  "services",
  "service_types",
  "order_situations",
  "order_statuses",
  "documents",
  "employees",
]);

const SHARE_RESOURCES = [
  {
    key: "customers" as const,
    label: "Clientes",
    description: "Cadastros, dados de contato e endereços dos clientes da empresa.",
  },
  {
    key: "orders" as const,
    label: "Ordens de Serviço e Operação",
    description: "OS, histórico, documentos, SLA e configurações operacionais ligadas ao fluxo das ordens.",
  },
  {
    key: "inventory" as const,
    label: "Estoque",
    description: "Itens, saldos, movimentações e fluxos de peças vinculados ao estoque.",
  },
];

const ACCESS_OPTIONS = [
  { value: "none", label: "Nenhum acesso" },
  { value: "summary", label: "Somente resumo" },
  { value: "read", label: "Leitura" },
  { value: "manage", label: "Gerenciar" },
];

const ACCESS_HELP: Record<PartnerShareAccessLevel, string> = {
  none: "A ArtVideo não recebe acesso a este recurso.",
  summary: "Permite somente indicadores/resumos compatíveis; os registros detalhados continuam bloqueados.",
  read: "Permite consultar os registros detalhados, sem alterações operacionais.",
  manage: "Permite consultar e executar ações que também estejam autorizadas pelas permissões da ArtVideo.",
};

const companyOptions = (companies: any[]) => [
  { value: "", label: "Selecione" },
  ...companies.map(company => ({ value: company.id, label: company.name })),
];

export function PartnerPermissionsArea() {
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canManageModules = hasPermission("organizations.modules.manage");
  const canManageShares = hasPermission("organizations.data_shares.manage");
  const [organizationId, setOrganizationId] = useState("");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const companiesQuery = useQuery({
    queryKey: ["partner-companies", "companies"],
    queryFn: async () => {
      const { data, error } = await listPartnerCompanies();
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (!organizationId && companiesQuery.data?.[0]?.id) {
      setOrganizationId(companiesQuery.data[0].id);
    }
  }, [companiesQuery.data, organizationId]);

  const modulesQuery = useQuery({
    queryKey: ["partner-companies", "modules", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const [{ data: systemModules, error: systemError }, { data: organizationModules, error: organizationError }] = await Promise.all([
        listSystemModules(),
        listOrganizationModules(organizationId),
      ]);
      if (systemError || organizationError) throw systemError || organizationError;
      return {
        systemModules: (systemModules || []).filter((module: any) => SAFE_PARTNER_MODULES.has(module.key)),
        organizationModules: organizationModules || [],
      };
    },
  });

  const sharesQuery = useQuery({
    queryKey: ["partner-companies", "shares", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await listPartnerShares(organizationId);
      if (error) throw error;
      return data || [];
    },
  });

  const enabledByKey = useMemo(
    () => new Map((modulesQuery.data?.organizationModules || []).map((item: any) => [item.module_key, item.is_enabled === true])),
    [modulesQuery.data],
  );
  const shareByKey = useMemo(
    () => new Map((sharesQuery.data || []).map((item: any) => [item.resource_key, item.access_level as PartnerShareAccessLevel])),
    [sharesQuery.data],
  );

  const toggleModuleMutation = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const { error } = await setOrganizationModuleEnabled(organizationId, key, enabled, user?.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["partner-companies", "modules", organizationId] });
      setToast({ msg: "Módulo atualizado.", type: "success" });
    },
    onError: (error: any) => setToast({ msg: `Não foi possível atualizar o módulo: ${error?.message || "Erro desconhecido"}`, type: "error" }),
  });

  const shareMutation = useMutation({
    mutationFn: async ({ resourceKey, accessLevel }: { resourceKey: "customers" | "orders" | "inventory"; accessLevel: PartnerShareAccessLevel }) => {
      const { error } = await setPartnerDataShare(organizationId, resourceKey, accessLevel);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["partner-companies", "shares", organizationId] });
      setToast({ msg: "Compartilhamento atualizado e registrado na auditoria.", type: "success" });
    },
    onError: (error: any) => setToast({ msg: `Não foi possível atualizar o compartilhamento: ${error?.message || "Erro desconhecido"}`, type: "error" }),
  });

  const selectedCompany = (companiesQuery.data || []).find((company: any) => company.id === organizationId);
  const busy = toggleModuleMutation.isPending || shareMutation.isPending;

  return <div className="space-y-4">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    <AdminCard className="p-4">
      <FSelect
        label="Empresa"
        value={organizationId}
        options={companyOptions(companiesQuery.data || [])}
        onChange={(event: any) => setOrganizationId(event.target.value)}
      />
      {selectedCompany && selectedCompany.status !== "active" && (
        <p className="mt-2 text-xs font-semibold text-amber-700">
          A empresa está {selectedCompany.status === "suspended" ? "suspensa" : "cancelada"}. As configurações permanecem visíveis, mas o tenant não opera enquanto estiver inativo.
        </p>
      )}
    </AdminCard>

    <AdminCard className="p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-2">
        <KeyRound size={18} className="mt-0.5 shrink-0 text-[#0057e7]" />
        <div>
          <h3 className="font-black text-[#0d1b2e]">Módulos disponíveis para a empresa</h3>
          <p className="mt-1 text-xs leading-5 text-[#5a6a82]">
            Define quais áreas a empresa pode utilizar. Por segurança, só aparecem módulos que já estão isolados no núcleo multiempresa.
          </p>
        </div>
      </div>

      {modulesQuery.isPending ? <LoadingState /> : (
        <div className="grid gap-2 sm:grid-cols-2">
          {(modulesQuery.data?.systemModules || []).map((module: any) => {
            const enabled = enabledByKey.get(module.key) === true;
            return <button
              key={module.key}
              type="button"
              disabled={!canManageModules || busy || !organizationId}
              onClick={() => toggleModuleMutation.mutate({ key: module.key, enabled: !enabled })}
              className="flex items-center justify-between rounded-xl border border-[#d9e1ec] px-3 py-3 text-left transition-colors hover:border-[#0057e7]/40 disabled:cursor-default disabled:opacity-70"
            >
              <div className="min-w-0 pr-3">
                <p className="text-sm font-bold text-[#0d1b2e]">{module.name}</p>
                <p className="mt-0.5 text-xs leading-5 text-[#5a6a82]">{module.description}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {enabled ? "Ativo" : "Bloqueado"}
              </span>
            </button>;
          })}
        </div>
      )}
    </AdminCard>

    <AdminCard className="p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-2">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#0057e7]" />
        <div>
          <h3 className="font-black text-[#0d1b2e]">Dados compartilhados com a ArtVideo</h3>
          <p className="mt-1 text-xs leading-5 text-[#5a6a82]">
            Esta configuração é independente dos módulos acima. Liberar um módulo para a empresa não concede à ArtVideo acesso aos dados dela.
          </p>
        </div>
      </div>

      {sharesQuery.isPending ? <LoadingState /> : (
        <div className="space-y-3">
          {SHARE_RESOURCES.map(resource => {
            const currentLevel = shareByKey.get(resource.key) || "none";
            return <div key={resource.key} className="rounded-xl border border-[#d9e1ec] p-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Database size={15} className="shrink-0 text-[#0057e7]" />
                    <p className="text-sm font-black text-[#0d1b2e]">{resource.label}</p>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[#5a6a82]">{resource.description}</p>
                </div>
                <FSelect
                  label="Acesso da ArtVideo"
                  value={currentLevel}
                  options={ACCESS_OPTIONS}
                  disabled={!canManageShares || busy || !organizationId}
                  onChange={(event: any) => shareMutation.mutate({
                    resourceKey: resource.key,
                    accessLevel: event.target.value as PartnerShareAccessLevel,
                  })}
                />
              </div>
              <div className="mt-3 rounded-lg bg-[#f6f8fb] px-3 py-2 text-xs leading-5 text-[#5a6a82]">
                {ACCESS_HELP[currentLevel]}
              </div>
            </div>;
          })}
        </div>
      )}
    </AdminCard>
  </div>;
}
