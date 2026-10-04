import type { AdminTab } from "../domain/admin.types";
import { mainItems, operationItems } from "../navigation-config";
import { AdminHubPage, type AdminHubItem } from "./AdminNavigation";

const mainDescriptions: Record<string, string> = {
  dashboard: "Visão geral dos indicadores e atividades da empresa.",
  quotes: "Crie e acompanhe solicitações de orçamento.",
  orders: "Teste o fluxo completo de ordens de serviço.",
  customers: "Gerencie clientes, contatos e equipamentos.",
  agenda: "Organize compromissos e atendimentos agendados.",
  fieldTracking: "Acompanhe técnicos, veículos e dispositivos em campo.",
  inventory: "Gerencie produtos, estoque, movimentações e cadastros relacionados.",
  pdv: "Teste vendas rápidas, caixa e pagamentos no PDV.",
  finance: "Acesse contas, lançamentos, recebimentos e rotinas financeiras.",
};

const crmMainIds = new Set([
  "dashboard",
  "quotes",
  "orders",
  "customers",
  "agenda",
  "fieldTracking",
  "inventory",
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
    ...operationItems.map(({ permissionKey: _permissionKey, ...item }) => item),
  ];

  return (
    <AdminHubPage
      title="CRM"
      description="Ambiente completo para a Union World testar os fluxos do CRM como uma empresa operando normalmente."
      items={items}
      onSelect={(id) => onSelect(id as AdminTab)}
    />
  );
}
