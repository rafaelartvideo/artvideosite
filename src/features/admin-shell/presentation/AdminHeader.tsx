import { Globe, Menu, Settings } from "lucide-react";
import type { AdminPageState, AdminTab } from "@/app/admin/shared";
import { mainItems, utilityItems } from "../navigation-config";

type AdminHeaderProps = {
  activeTab: AdminTab;
  page: AdminPageState;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
};

const tabDescriptions: Record<AdminTab, string> = {
  dashboard: "Visão geral do sistema em tempo real",
  services: "Gerencie os serviços apresentados no site público",
  categories: "Organize os serviços e produtos por categoria",
  products: "Controle o catálogo de produtos da loja",
  brands: "Administre as marcas cadastradas",
  quotes: "Acompanhe e responda às solicitações recebidas",
  orders: "Abertura, acompanhamento e conclusão dos atendimentos",
  agenda: "Visualize e organize os atendimentos agendados",
  site: "Conteúdo e configurações do site público",
  operation: "Configurações internas da assistência técnica",
  equipment: "Cadastro técnico usado nas ordens de serviço",
  generalServices: "Serviços técnicos internos utilizados na operação",
  serviceTypes: "Configuração dos tipos de atendimento",
  inventory: "Controle de itens, movimentações e histórico do estoque atual",
  situations: "Etapas de progresso das ordens de serviço",
  orderStatuses: "Status principais das ordens de serviço",
  customers: "Consulte clientes e seus dados de atendimento",
  employees: "Cadastro e gestão dos funcionários da empresa",
  settings: "Controle as configurações globais do site",
  contact: "Dados exibidos no site e usados nos contatos",
};

const shellItems = [
  ...mainItems,
  { id: "site", label: "Site", icon: Globe },
  { id: "operation", label: "Operação", icon: Settings },
  ...utilityItems,
];

export function AdminHeader({
  activeTab,
  page,
  sidebarOpen,
  onToggleSidebar,
}: AdminHeaderProps) {
  const activeItem = shellItems.find((item) => item.id === activeTab);

  return (
    <header className="bg-white border-b border-[#0d1b2e]/8 px-4 sm:px-6 py-3.5 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-expanded={sidebarOpen}
          aria-label={sidebarOpen ? "Fechar menu" : "Abrir menu"}
          className="md:hidden text-[#0d1b2e] p-1.5 hover:bg-[#f5f7fa] rounded-lg"
        >
          <Menu size={20} />
        </button>

        <div>
          {page && (
            <div className="flex items-center gap-1.5 text-[10px] text-[#5a6a82] mb-0.5">
              <button
                type="button"
                onClick={page.onBack}
                className="font-semibold hover:text-[#0057e7] transition-colors"
              >
                {page.breadcrumb}
              </button>
              <span aria-hidden="true">&gt;</span>
              <span className="truncate max-w-[180px]">{page.title}</span>
            </div>
          )}

          <h2 className="font-black text-[#0d1b2e] text-[15px]">
            {page?.title || activeItem?.label}
          </h2>
          <p className="hidden sm:block text-[#5a6a82] mt-0.5 text-[14px]">
            {page?.subtitle || tabDescriptions[activeTab]}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-[#5a6a82]">
        <span className="w-2 h-2 bg-emerald-500 rounded-full inline-block" />
        <span className="hidden sm:inline font-medium">Supabase conectado</span>
      </div>
    </header>
  );
}
