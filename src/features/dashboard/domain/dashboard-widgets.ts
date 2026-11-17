import type { DashboardModule } from "./dashboard";

export type DashboardWidgetOption = { id: string; label: string };

export const DASHBOARD_WIDGET_OPTIONS: Record<DashboardModule, DashboardWidgetOption[]> = {
  overview: [
    { id: "metrics", label: "Indicadores gerais" },
    { id: "movement", label: "Movimentação do período" },
    { id: "alerts", label: "Atenção agora" },
  ],
  orders: [
    { id: "metrics", label: "Indicadores de OS" },
    { id: "situation", label: "Situação" },
    { id: "status", label: "Status" },
    { id: "opened", label: "Data de abertura da OS" },
    { id: "service_type", label: "Tipo de atendimento" },
    { id: "equipment_type", label: "Tipo de equipamentos" },
    { id: "equipment_model", label: "Modelo do equipamento" },
    { id: "quote_approved", label: "Orçamento aprovado" },
    { id: "quote_rejected", label: "Orçamento reprovado" },
    { id: "selection", label: "OS do grupo selecionado" },
  ],
  registrations: [
    { id: "metrics", label: "Indicadores de cadastros" },
    { id: "registration_trend", label: "Novos cadastros" },
    { id: "registration_recent", label: "Cadastros recentes" },
  ],
  inventory: [
    { id: "metrics", label: "Indicadores de estoque" },
    { id: "inventory_top", label: "Compras por fornecedor / Maiores saldos" },
    { id: "inventory_low", label: "Reposição necessária" },
  ],
  agenda: [
    { id: "metrics", label: "Indicadores da agenda" },
    { id: "agenda_situation", label: "Agenda por situação" },
    { id: "agenda_next", label: "Próximos atendimentos" },
  ],
  quotes: [
    { id: "metrics", label: "Indicadores de orçamentos" },
    { id: "quotes_status", label: "Orçamentos por status" },
    { id: "quotes_recent", label: "Solicitações recentes" },
  ],
  finance: [
    { id: "metrics", label: "Indicadores financeiros" },
    { id: "finance_trend", label: "Faturamento por período" },
    { id: "finance_recent", label: "Conclusões recentes" },
  ],
};

export function widgetDefaults(module: DashboardModule): string[] {
  return DASHBOARD_WIDGET_OPTIONS[module].map(item => item.id);
}

export function validVisibleWidgets(module: DashboardModule, keys: unknown): string[] {
  if (!Array.isArray(keys)) return widgetDefaults(module);
  const allowed = new Set(widgetDefaults(module));
  return [...new Set(keys.filter((value): value is string => typeof value === "string" && allowed.has(value)))];
}

export function toggleDashboardWidget(module: DashboardModule, current: string[], id: string): string[] {
  const allowed = new Set(widgetDefaults(module));
  if (!allowed.has(id)) return validVisibleWidgets(module, current);
  const set = new Set(validVisibleWidgets(module, current));
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return widgetDefaults(module).filter(key => set.has(key));
}
