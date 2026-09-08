import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, LayoutDashboard, Package, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { listPartnerShares, type PartnerShareAccessLevel } from "../infrastructure/partner-companies.repository";

type SharedDataTab = "summary" | "customers" | "orders" | "inventory";

const DATA_TABS: Array<{ key: SharedDataTab; label: string; icon: LucideIcon }> = [
  { key: "summary", label: "Resumo", icon: LayoutDashboard },
  { key: "customers", label: "Clientes", icon: Users },
  { key: "orders", label: "Ordens de serviço", icon: ClipboardList },
  { key: "inventory", label: "Estoque", icon: Package },
];

const RESOURCE_META: Record<Exclude<SharedDataTab, "summary">, { title: string; description: string }> = {
  customers: { title: "Clientes", description: "Cadastros, contatos e endereços compartilhados com a ArtVideo." },
  orders: { title: "Ordens de serviço", description: "Ordens, histórico, documentos, SLA e operação compartilhada." },
  inventory: { title: "Estoque", description: "Itens, saldos, movimentações e fluxo de peças compartilhados." },
};

const ACCESS_LABEL: Record<PartnerShareAccessLevel, string> = {
  none: "Sem acesso",
  summary: "Somente resumo",
  read: "Leitura",
  manage: "Gerenciamento",
};

const ACCESS_DESCRIPTION: Record<PartnerShareAccessLevel, string> = {
  none: "Esta empresa não compartilhou este recurso com a ArtVideo.",
  summary: "A ArtVideo verá somente indicadores e informações agregadas, sem acesso aos registros individuais.",
  read: "A ArtVideo poderá consultar os registros individuais, sem alterar os dados da empresa.",
  manage: "A ArtVideo poderá consultar e executar as ações permitidas pelas permissões efetivas do usuário.",
};

export function PartnerCompanySharedDataSection({ organizationId }: { organizationId: string }) {
  const [activeTab, setActiveTab] = useState<SharedDataTab>("summary");
  const sharesQuery = useQuery({
    queryKey: ["partner-companies", "shared-data", organizationId],
    queryFn: async () => {
      const { data, error } = await listPartnerShares(organizationId);
      if (error) throw error;
      return data || [];
    },
  });

  const shareByKey = useMemo(
    () => new Map((sharesQuery.data || []).map((item: any) => [item.resource_key, item.access_level as PartnerShareAccessLevel])),
    [sharesQuery.data],
  );

  if (sharesQuery.isPending) return <LoadingState text="Carregando dados compartilhados..." />;
  if (sharesQuery.isError) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">Não foi possível carregar os acessos aos dados: {(sharesQuery.error as any)?.message || "Erro desconhecido"}</div>;

  return <div className="min-w-0 space-y-4">
    <nav className="flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-[#0d1b2e]/8 bg-white p-1.5 shadow-sm" aria-label="Seções dos dados compartilhados">
      {DATA_TABS.map(tab => {
        const Icon = tab.icon;
        const selected = activeTab === tab.key;
        return <button
          key={tab.key}
          type="button"
          aria-current={selected ? "page" : undefined}
          onClick={() => setActiveTab(tab.key)}
          className={cn(
            "inline-flex min-h-10 shrink-0 cursor-default items-center justify-center gap-2 rounded-lg px-3 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0057e7]/40",
            selected ? "bg-[#0057e7] text-white shadow-sm" : "text-[#5a6a82] hover:bg-[#0057e7]/5 hover:text-[#0057e7]",
          )}
        >
          <Icon size={15} />
          {tab.label}
        </button>;
      })}
    </nav>

    <div className="min-w-0">
      {activeTab === "summary" ? (
        <div className="divide-y divide-[#d9e1ec]">
          {(Object.keys(RESOURCE_META) as Array<Exclude<SharedDataTab, "summary">>).map(resourceKey => {
            const access = shareByKey.get(resourceKey) || "none";
            const meta = RESOURCE_META[resourceKey];
            return <div key={resourceKey} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
              <div className="min-w-0">
                <p className="text-sm font-black text-[#0d1b2e]">{meta.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-[#5a6a82]">{meta.description}</p>
              </div>
              <span className="shrink-0 text-xs font-bold text-[#0057e7]">{ACCESS_LABEL[access]}</span>
            </div>;
          })}
        </div>
      ) : (() => {
        const access = shareByKey.get(activeTab) || "none";
        const meta = RESOURCE_META[activeTab];
        return <div className="min-w-0 py-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <h4 className="text-base font-black text-[#0d1b2e]">{meta.title}</h4>
              <p className="mt-1 text-sm leading-relaxed text-[#5a6a82]">{meta.description}</p>
            </div>
            <span className="shrink-0 text-xs font-bold text-[#0057e7]">{ACCESS_LABEL[access]}</span>
          </div>
          <div className="mt-5 border-t border-[#d9e1ec] pt-5">
            <p className="text-sm font-semibold text-[#0d1b2e]">{ACCESS_DESCRIPTION[access]}</p>
            <p className="mt-2 text-xs leading-relaxed text-[#5a6a82]">Os dados deste recurso serão carregados aqui usando o ID desta empresa. A configuração de compartilhamento continua definindo se a ArtVideo terá resumo, leitura ou gerenciamento.</p>
          </div>
        </div>;
      })()}
    </div>
  </div>;
}
