import { Menu, X } from "lucide-react";
import logoSolo from "@/imports/LogoSoloSemFundo.png";
import type { AdminPageState, AdminTab } from "../domain/admin.types";

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
  documents: "Modelos e configurações de impressão das ordens de serviço",
  situations: "Etapas de progresso das ordens de serviço",
  orderStatuses: "Status principais das ordens de serviço",
  customers: "Consulte clientes e seus dados de atendimento",
  employees: "Cadastro e gestão dos funcionários da empresa",
  settings: "Configurações administrativas e dados da empresa",
  siteSettings: "Identidade visual e conteúdo do site público",
  contact: "Dados exibidos no site e usados nos contatos",
};

export function AdminHeader({
  activeTab,
  page,
  sidebarOpen,
  onToggleSidebar,
}: AdminHeaderProps) {
  return (
    <>
      <header className="relative z-40 shrink-0 border-b border-[#0d1b2e]/8 bg-white pt-[env(safe-area-inset-top)] shadow-sm md:hidden">
        <div className="relative flex h-16 items-center px-4">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-expanded={sidebarOpen}
            aria-label={sidebarOpen ? "Fechar menu" : "Abrir menu"}
            title={sidebarOpen ? "Fechar menu" : "Abrir menu"}
            className="relative z-10 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-transparent bg-[#0057e7] text-white shadow-sm transition-colors hover:bg-[#0046c0] active:bg-[#003da8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0057e7]/40 focus-visible:ring-offset-2"
          >
            {sidebarOpen ? <X size={20} strokeWidth={2.4} /> : <Menu size={21} strokeWidth={2.4} />}
          </button>

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <img src={logoSolo} alt="ArtVideo" className="h-9 w-9 object-contain" />
          </div>
        </div>
      </header>

      {page && (
        <header className="hidden md:flex bg-white border-b border-[#0d1b2e]/8 px-6 py-3.5 items-center justify-between sticky top-0 z-30">
          <div>
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

            <h2 className="font-black text-[#0d1b2e] text-[15px]">{page.title}</h2>
            <p className="text-[#5a6a82] mt-0.5 text-[14px]">
              {page.subtitle || tabDescriptions[activeTab]}
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-[#5a6a82]">
            <span className="w-2 h-2 bg-emerald-500 rounded-full inline-block" />
            <span className="font-medium">Supabase conectado</span>
          </div>
        </header>
      )}
    </>
  );
}
