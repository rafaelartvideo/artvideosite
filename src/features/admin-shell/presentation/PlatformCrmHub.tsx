import type { AdminTab } from "../domain/admin.types";
import { mainItems, operationItems } from "../navigation-config";
import { AdminHubPage, type AdminHubItem } from "./AdminNavigation";

const mainDescriptions: Record<string, string> = {
  dashboard: "Visão geral dos indicadores e atividades da empresa.",
  quotes: "Crie e acompanhe solicitações de orçamento.",
  orders: "Teste o fluxo completo de ordens de serviço.",
  customerRequests: "Registre e acompanhe pedidos avulsos de produtos e serviços.",
  technicianPanel: "Consulte as ordens e os serviços no painel dos técnicos.",
  customers: "Gerencie clientes, contatos e equipamentos.",
  agenda: "Organize compromissos e atendimentos agendados.",
  fieldTracking: "Acompanhe técnicos, veículos e dispositivos em campo.",
  inventory: "Gerencie produtos, estoque, movimentações e cadastros relacionados.",
  pdv: "Teste vendas rápidas, caixa e pagamentos no PDV.",
  sales: "Vitrine, pedidos comerciais, financeiro e separação de entregas sem depender do PDV.",
  finance: "Acesse contas, lançamentos, recebimentos e rotinas financeiras.",
};

const crmMainIds = new Set([
  "dashboard",
  "quotes",
  "orders",
  "customerRequests",
  "technicianPanel",
  "customers",
  "agenda",
  "fieldTracking",
  "inventory",
  "sales",
  "pdv",
  "finance",
]);

export function PlatformCrmHub({
  onSelect,
}: {
  onSelect: (tab: AdminTab) => void;
}) {
  const items: AdminHubItem[] = [
    ...mainItems
      .filter((item) => crmMainIds.has(item.id))
      .map((item) => ({
        ...item,
        description: mainDescriptions[item.id] || `Acesse o módulo ${item.label}.`,
      })),
    // Configurações dos atendimentos ficam nos próprios módulos em Ferramentas.
    ...operationItems.map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
      description: item.description,
    })),
  ].sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));

  return (
    <AdminHubPage
      title="CRM"
      description="Ambiente completo para a Union World testar os fluxos do CRM como uma empresa operando normalmente."
      items={items}
      onSelect={(id) => onSelect(id as AdminTab)}
    />
  );
}
