import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { AdminCard, AdminCardContent, AdminCardHeader } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FSelect, FToggle } from "@/shared/ui/admin/AdminFormControls";
import {
  listOrganizationModules,
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
  "company_settings",
]);

const SHARE_RESOURCES = [
  { key: "customers" as const, label: "Clientes", description: "Cadastros, contatos e endereços dos clientes." },
  { key: "orders" as const, label: "Ordens de Serviço e Operação", description: "OS, histórico, documentos, SLA e fluxo operacional." },
  { key: "inventory" as const, label: "Estoque", description: "Itens, saldos, movimentações e fluxo de peças." },
];

const ACCESS_OPTIONS = [
  { value: "none", label: "Nenhum acesso" },
  { value: "summary", label: "Somente resumo" },
  { value: "read", label: "Leitura" },
  { value: "manage", label: "Gerenciar" },
];

const ACCESS_HELP: Record<PartnerShareAccessLevel, string> = {
  none: "A ArtVideo não recebe acesso a este recurso.",
  summary: "Somente indicadores e resumos compatíveis; registros detalhados continuam bloqueados.",
  read: "Consulta dos registros detalhados, sem alterações operacionais.",
  manage: "Consulta e ações permitidas também pelas permissões efetivas da ArtVideo.",
};

export function PartnerCompanyPermissionsSection({ organizationId }: { organizationId: string }) {
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const canManageModules = hasPermission("organizations.modules.manage");
  const canManageShares = hasPermission("organizations.data_shares.manage");

  const modulesQuery = useQuery({
    queryKey: ["partner-companies", "modules", organizationId],
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

  const sortedModules = useMemo(
    () => [...(modulesQuery.data?.systemModules || [])].sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" })),
    [modulesQuery.data?.systemModules],
  );

  const moduleColumns = useMemo(() => {
    const splitAt = Math.ceil(sortedModules.length / 2);
    return [sortedModules.slice(0, splitAt), sortedModules.slice(splitAt)];
  }, [sortedModules]);

  const allModulesEnabled = sortedModules.length > 0 && sortedModules.every((module: any) => enabledByKey.get(module.key) === true);

  const shareByKey = useMemo(
    () => new Map((sharesQuery.data || []).map((item: any) => [item.resource_key, item.access_level as PartnerShareAccessLevel])),
    [sharesQuery.data],
  );

  const toggleMutation = useMutation({
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

  const bulkModulesMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      for (const module of sortedModules) {
        if ((enabledByKey.get(module.key) === true) === enabled) continue;
        const { error } = await setOrganizationModuleEnabled(organizationId, module.key, enabled, user?.id);
        if (error) throw error;
      }
      return enabled;
    },
    onSuccess: (enabled) => {
      void queryClient.invalidateQueries({ queryKey: ["partner-companies", "modules", organizationId] });
      setToast({ msg: enabled ? "Todos os módulos foram marcados." : "Todos os módulos foram desmarcados.", type: "success" });
    },
    onError: (error: any) => setToast({ msg: `Não foi possível atualizar todos os módulos: ${error?.message || "Erro desconhecido"}`, type: "error" }),
  });

  const shareMutation = useMutation({
    mutationFn: async ({ resourceKey, accessLevel }: { resourceKey: "customers" | "orders" | "inventory"; accessLevel: PartnerShareAccessLevel }) => {
      const { error } = await setPartnerDataShare(organizationId, resourceKey, accessLevel);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["partner-companies", "shares", organizationId] });
      setToast({ msg: "Compartilhamento atualizado.", type: "success" });
    },
    onError: (error: any) => setToast({ msg: `Não foi possível atualizar o compartilhamento: ${error?.message || "Erro desconhecido"}`, type: "error" }),
  });

  const busy = toggleMutation.isPending || bulkModulesMutation.isPending || shareMutation.isPending;

  return <div className="space-y-4">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    <AdminCard>
      <AdminCardHeader>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black text-[#0d1b2e]">Módulos disponíveis</h3>
          <p className="mt-0.5 text-xs text-[#5a6a82]">Define quais áreas esta empresa pode utilizar.</p>
        </div>
        {!modulesQuery.isPending && !modulesQuery.isError && sortedModules.length > 0 && (
          <button
            type="button"
            disabled={!canManageModules || busy}
            onClick={() => bulkModulesMutation.mutate(!allModulesEnabled)}
            className="shrink-0 rounded-lg border border-[#0057e7]/20 bg-white px-3 py-2 text-xs font-bold text-[#0057e7] transition-colors hover:bg-[#eef5ff] disabled:cursor-default disabled:opacity-50"
          >
            {bulkModulesMutation.isPending ? "Atualizando..." : allModulesEnabled ? "Desmarcar todos" : "Marcar todos"}
          </button>
        )}
      </AdminCardHeader>
      <AdminCardContent>
        {modulesQuery.isPending ? <LoadingState /> : modulesQuery.isError ? (
          <p className="text-sm font-semibold text-red-700">{(modulesQuery.error as any)?.message || "Não foi possível carregar os módulos."}</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 sm:gap-0">
            {moduleColumns.map((column, columnIndex) => (
              <div
                key={columnIndex}
                className={columnIndex === 0
                  ? "divide-y divide-[#d9e1ec] sm:pr-8"
                  : "divide-y divide-[#d9e1ec] border-t border-[#d9e1ec] pt-4 sm:ml-4 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0"}
              >
                {column.map((module: any) => {
                  const enabled = enabledByKey.get(module.key) === true;
                  return <div key={module.key} className="py-4 first:pt-0 last:pb-0">
                    <FToggle
                      label={module.name}
                      description={module.description}
                      checked={enabled}
                      disabled={!canManageModules || busy}
                      onChange={(nextEnabled) => toggleMutation.mutate({ key: module.key, enabled: nextEnabled })}
                    />
                  </div>;
                })}
              </div>
            ))}
          </div>
        )}
      </AdminCardContent>
    </AdminCard>

    <AdminCard>
      <AdminCardHeader>
        <div>
          <h3 className="text-sm font-black text-[#0d1b2e]">Dados compartilhados com a ArtVideo</h3>
          <p className="mt-0.5 text-xs text-[#5a6a82]">Configuração independente dos módulos liberados para a empresa.</p>
        </div>
      </AdminCardHeader>
      <AdminCardContent>
        {sharesQuery.isPending ? <LoadingState /> : sharesQuery.isError ? (
          <p className="text-sm font-semibold text-red-700">{(sharesQuery.error as any)?.message || "Não foi possível carregar os compartilhamentos."}</p>
        ) : (
          <div className="divide-y divide-[#d9e1ec]">
            {SHARE_RESOURCES.map(resource => {
              const level = shareByKey.get(resource.key) || "none";
              return <div key={resource.key} className="grid gap-4 py-4 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_260px] md:items-center md:gap-6">
                <div className="min-w-0">
                  <p className="text-sm font-black text-[#0d1b2e]">{resource.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#5a6a82]">{resource.description}</p>
                  <p className="mt-2 text-xs leading-relaxed text-[#5a6a82]">{ACCESS_HELP[level]}</p>
                </div>
                <FSelect
                  label="Acesso da ArtVideo"
                  value={level}
                  options={ACCESS_OPTIONS}
                  disabled={!canManageShares || busy}
                  onChange={(event: any) => shareMutation.mutate({ resourceKey: resource.key, accessLevel: event.target.value as PartnerShareAccessLevel })}
                />
              </div>;
            })}
          </div>
        )}
      </AdminCardContent>
    </AdminCard>
  </div>;
}
