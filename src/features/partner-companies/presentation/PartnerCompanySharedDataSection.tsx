import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/shared/domain/formatters";
import { AdminCard, AdminCardContent, AdminCardHeader } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { listPartnerShares, type PartnerShareAccessLevel } from "../infrastructure/partner-companies.repository";

type SharedDataTab = "summary" | "customers" | "orders" | "inventory";

const DATA_TABS: Array<{ key: SharedDataTab; label: string }> = [
  { key: "summary", label: "RESUMO" },
  { key: "customers", label: "CLIENTES" },
  { key: "orders", label: "ORDENS DE SERVIÇO" },
  { key: "inventory", label: "ESTOQUE" },
];

const RESOURCE_META: Record<Exclude<SharedDataTab, "summary">, { title: string; description: string }> = {
  customers: { title: "Clientes", description: "Cadastros, contatos e endereços compartilhados com a ArtVideo." },
  orders: { title: "Ordens de Serviço", description: "Ordens, histórico, documentos, SLA e operação compartilhada." },
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

  return <AdminCard>
    <AdminCardHeader>
      <div>
        <h3 className="text-sm font-black text-[#0d1b2e]">Dados da empresa</h3>
        <p className="mt-0.5 text-xs text-[#5a6a82]">Consulte os dados compartilhados sem alterar a empresa ativa da ArtVideo.</p>
      </div>
    </AdminCardHeader>

    <div className="overflow-x-auto border-b border-[#0d1b2e]/10 px-4 sm:px-5">
      <nav className="flex min-w-max items-center gap-5" aria-label="Seções dos dados compartilhados">
        {DATA_TABS.map(tab => <button
          key={tab.key}
          type="button"
          onClick={() => setActiveTab(tab.key)}
          className={cn(
            "border-b-2 px-1 py-3 text-[11px] font-black transition-colors sm:text-xs",
            activeTab === tab.key ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82] hover:text-[#0d1b2e]",
          )}
        >{tab.label}</button>)}
      </nav>
    </div>

    <AdminCardContent>
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
            <p className="mt-2 text-xs leading-relaxed text-[#5a6a82]">Esta é a nova área de acesso da ArtVideo. A listagem, os indicadores e as ações deste recurso serão carregados aqui usando o ID desta empresa, sem trocar o contexto da empresa ativa.</p>
          </div>
        </div>;
      })()}
    </AdminCardContent>
  </AdminCard>;
}
