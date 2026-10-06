import { systemErrorMessage } from "@/shared/domain/error-message";
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
  type PartnerShareConfigLevel,
} from "../infrastructure/partner-companies.repository";

const PARTNER_MODULE_GROUPS = [
  {
    key: "dashboard",
    label: "Dashboard",
    description: "Indicadores e visão geral da operação.",
    moduleKeys: ["dashboard"],
  },
  {
    key: "registrations",
    label: "Cadastros",
    description: "Clientes, funcionários, usuários, equipes, funções e permissões.",
    moduleKeys: ["customers", "employees"],
  },
  {
    key: "orders",
    label: "Ordens de Serviço",
    description: "Ativa todo o domínio da OS: equipamentos, serviços, tipos de atendimento, situações, status, documentos e checklists.",
    moduleKeys: ["orders", "equipment", "services", "service_types", "order_situations", "order_statuses", "documents", "checklists"],
  },
  {
    key: "agenda",
    label: "Agenda",
    description: "Agendamentos, visitas e retornos.",
    moduleKeys: ["agenda"],
  },
  {
    key: "inventory",
    label: "Estoque",
    description: "Estoque e base integrada de produtos.",
    moduleKeys: ["inventory", "products"],
  },
  {
    key: "quotes",
    label: "Orçamentos",
    description: "Solicitações e gestão de orçamentos.",
    moduleKeys: ["quotes"],
  },
  {
    key: "pdv",
    label: "PDV",
    description: "Ponto de venda, caixa e venda rápida.",
    moduleKeys: ["pdv"],
  },
  {
    key: "finance",
    label: "Financeiro",
    description: "Contas, pagamentos, recebimentos e gestão financeira.",
    moduleKeys: ["finance"],
  },
  {
    key: "field_tracking",
    label: "Mapa de Campo",
    description: "Rastreamento operacional de técnicos, dispositivos e veículos.",
    moduleKeys: ["field_tracking"],
  },
  {
    key: "queue",
    label: "Union Senhas",
    description: "Fila eletrônica integrada. Ao ativar, a ferramenta Union Senhas fica disponível para a empresa.",
    moduleKeys: ["queue"],
  },
  {
    key: "sac_digital",
    label: "SAC Digital",
    description: "Atendimento integrado por WhatsApp e outros canais usando a conta SAC Digital da própria empresa.",
    moduleKeys: ["sac_digital"],
  },
  {
    key: "pbx",
    label: "PABX Union",
    description: "Telefonia, ramais e recursos do PABX Union.",
    moduleKeys: ["pbx"],
  },
  {
    key: "marketplace",
    label: "Marketplace Union",
    description: "Catálogo e participação da empresa no marketplace do ecossistema Union.",
    moduleKeys: ["marketplace"],
  },
  {
    key: "ai",
    label: "Union IA",
    description: "Recursos e créditos de inteligência artificial do ecossistema Union.",
    moduleKeys: ["ai"],
  },
  {
    key: "company_settings",
    label: "Dados da empresa",
    description: "Dados cadastrais e identidade visual da empresa.",
    moduleKeys: ["company_settings"],
  },
] as const;

const SHARE_RESOURCES = [
  { key: "customers" as const, label: "Cadastro", description: "Cadastros, contatos e endereços dos clientes." },
  { key: "orders" as const, label: "Ordens de Serviço e Operação", description: "OS, histórico, documentos, SLA e fluxo operacional." },
  { key: "inventory" as const, label: "Estoque", description: "Itens, saldos, movimentações e fluxo de peças." },
];

const ACCESS_OPTIONS = [
  { value: "none", label: "Nenhum acesso" },
  { value: "summary", label: "Somente resumo" },
  { value: "read", label: "Leitura" },
];

const ACCESS_HELP: Record<PartnerShareConfigLevel, string> = {
  none: "A Union World não recebe acesso a este recurso.",
  summary: "Somente indicadores e resumos compatíveis; registros detalhados continuam bloqueados.",
  read: "Consulta dos registros detalhados, sempre sem alterações na empresa parceira.",
};

function normalizeShareLevel(level?: PartnerShareAccessLevel): PartnerShareConfigLevel {
  return level === "manage" ? "read" : level || "none";
}

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
        systemModules: systemModules || [],
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

  const systemModuleKeys = useMemo(
    () => new Set((modulesQuery.data?.systemModules || []).map((module: any) => String(module.key))),
    [modulesQuery.data?.systemModules],
  );

  const visibleGroups = useMemo(() => {
    const configuredKeys = new Set(PARTNER_MODULE_GROUPS.flatMap(group => [...group.moduleKeys]));
    const configuredGroups = PARTNER_MODULE_GROUPS
      .map(group => ({
        ...group,
        moduleKeys: group.moduleKeys.filter(key => systemModuleKeys.has(key)),
      }))
      .filter(group => group.moduleKeys.length > 0);

    const dynamicGroups = (modulesQuery.data?.systemModules || [])
      .filter((module: any) => !configuredKeys.has(String(module.key)))
      .map((module: any) => ({
        key: String(module.key),
        label: String(module.name || module.key),
        description: String(module.description || "Módulo disponível para esta empresa."),
        moduleKeys: [String(module.key)],
      }));

    return [...configuredGroups, ...dynamicGroups];
  }, [modulesQuery.data?.systemModules, systemModuleKeys]);

  const groupedModuleKeys = useMemo(
    () => Array.from(new Set(visibleGroups.flatMap(group => group.moduleKeys))),
    [visibleGroups],
  );

  const normalizeModuleToggleKeys = (keys: readonly string[]) => {
    const normalized = new Set(keys);
    if (normalized.has("customers") || normalized.has("employees")) {
      normalized.delete("employees");
      normalized.add("customers");
    }
    if (normalized.has("inventory") || normalized.has("products")) {
      normalized.delete("products");
      normalized.add("inventory");
    }
    return Array.from(normalized);
  };

  const moduleColumns = useMemo(() => {
    const splitAt = Math.ceil(visibleGroups.length / 2);
    return [visibleGroups.slice(0, splitAt), visibleGroups.slice(splitAt)];
  }, [visibleGroups]);

  const allModulesEnabled = groupedModuleKeys.length > 0
    && groupedModuleKeys.every(key => enabledByKey.get(key) === true);

  const shareByKey = useMemo(
    () => new Map((sharesQuery.data || []).map((item: any) => [item.resource_key, normalizeShareLevel(item.access_level as PartnerShareAccessLevel)])),
    [sharesQuery.data],
  );

  const toggleGroupMutation = useMutation({
    mutationFn: async ({ keys, enabled }: { keys: readonly string[]; enabled: boolean }) => {
      for (const key of normalizeModuleToggleKeys(keys)) {
        const { error } = await setOrganizationModuleEnabled(organizationId, key, enabled, user?.id);
        if (error) throw error;
      }
      return { keys, enabled };
    },
    onSuccess: ({ keys, enabled }) => {
      void queryClient.invalidateQueries({ queryKey: ["partner-companies", "modules", organizationId] });
      const isOrdersDomain = keys.includes("orders");
      setToast({
        msg: isOrdersDomain
          ? enabled ? "Todo o módulo de Ordens de Serviço foi ativado." : "Todo o módulo de Ordens de Serviço foi desativado."
          : "Módulo atualizado.",
        type: "success",
      });
    },
    onError: (error: any) => setToast({ msg: `Não foi possível atualizar o módulo: ${systemErrorMessage(error, "Erro desconhecido")}`, type: "error" }),
  });

  const bulkModulesMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      for (const key of normalizeModuleToggleKeys(groupedModuleKeys)) {
        const { error } = await setOrganizationModuleEnabled(organizationId, key, enabled, user?.id);
        if (error) throw error;
      }
      return enabled;
    },
    onSuccess: (enabled) => {
      void queryClient.invalidateQueries({ queryKey: ["partner-companies", "modules", organizationId] });
      setToast({ msg: enabled ? "Todos os módulos foram ativados." : "Todos os módulos foram desativados.", type: "success" });
    },
    onError: (error: any) => setToast({ msg: `Não foi possível atualizar todos os módulos: ${systemErrorMessage(error, "Erro desconhecido")}`, type: "error" }),
  });

  const shareMutation = useMutation({
    mutationFn: async ({ resourceKey, accessLevel }: { resourceKey: "customers" | "orders" | "inventory"; accessLevel: PartnerShareConfigLevel }) => {
      const { error } = await setPartnerDataShare(organizationId, resourceKey, accessLevel);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["partner-companies", "shares", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["partner-companies", "shared-data", organizationId] });
      setToast({ msg: "Compartilhamento atualizado.", type: "success" });
    },
    onError: (error: any) => setToast({ msg: `Não foi possível atualizar o compartilhamento: ${systemErrorMessage(error, "Erro desconhecido")}`, type: "error" }),
  });

  const busy = toggleGroupMutation.isPending || bulkModulesMutation.isPending || shareMutation.isPending;

  return <div className="space-y-4">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    <AdminCard>
      <AdminCardHeader>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black text-[#0d1b2e]">Módulos e ferramentas disponíveis</h3>
          <p className="mt-0.5 text-xs text-[#5a6a82]">Ative apenas as áreas e ferramentas que esta empresa poderá utilizar. Novos módulos ativos do sistema entram aqui automaticamente.</p>
        </div>
        {!modulesQuery.isPending && !modulesQuery.isError && visibleGroups.length > 0 && (
          <button
            type="button"
            disabled={!canManageModules || busy}
            onClick={() => bulkModulesMutation.mutate(!allModulesEnabled)}
            className="shrink-0 rounded-lg border border-[#0057e7]/20 bg-card px-3 py-2 text-xs font-bold text-[#0057e7] transition-colors hover:bg-[#eef5ff] disabled:cursor-default disabled:opacity-50"
          >
            {bulkModulesMutation.isPending ? "Atualizando..." : allModulesEnabled ? "Desativar todos" : "Ativar todos"}
          </button>
        )}
      </AdminCardHeader>
      <AdminCardContent>
        {modulesQuery.isPending ? <LoadingState /> : modulesQuery.isError ? (
          <p className="text-sm font-semibold text-red-700">{systemErrorMessage(modulesQuery.error, "Não foi possível carregar os módulos.")}</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 sm:gap-0">
            {moduleColumns.map((column, columnIndex) => (
              <div
                key={columnIndex}
                className={columnIndex === 0
                  ? "divide-y divide-[#d9e1ec] sm:pr-8"
                  : "divide-y divide-[#d9e1ec] border-t border-[#d9e1ec] pt-4 sm:ml-4 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0"}
              >
                {column.map(group => {
                  const enabled = group.moduleKeys.every(key => enabledByKey.get(key) === true);
                  return <div key={group.key} className="py-4 first:pt-0 last:pb-0">
                    <FToggle
                      label={group.label}
                      description={group.description}
                      checked={enabled}
                      disabled={!canManageModules || busy}
                      onChange={(nextEnabled) => toggleGroupMutation.mutate({ keys: group.moduleKeys, enabled: nextEnabled })}
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
          <h3 className="text-sm font-black text-[#0d1b2e]">Dados compartilhados com a Union World</h3>
          <p className="mt-0.5 text-xs text-[#5a6a82]">Define somente o nível de visualização concedido à Union World.</p>
        </div>
      </AdminCardHeader>
      <AdminCardContent>
        {sharesQuery.isPending ? <LoadingState /> : sharesQuery.isError ? (
          <p className="text-sm font-semibold text-red-700">{systemErrorMessage(sharesQuery.error, "Não foi possível carregar os compartilhamentos.")}</p>
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
                  label="Acesso da Union World"
                  value={level}
                  options={ACCESS_OPTIONS}
                  disabled={!canManageShares || busy}
                  onChange={(event: any) => shareMutation.mutate({ resourceKey: resource.key, accessLevel: event.target.value as PartnerShareConfigLevel })}
                />
              </div>;
            })}
          </div>
        )}
      </AdminCardContent>
    </AdminCard>
  </div>;
}
