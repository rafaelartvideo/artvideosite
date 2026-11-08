import type { SalesOrderFulfillmentStatus, SalesOrderPaymentStatus, SalesOrderStatus } from "../infrastructure/sales-orders.repository";

export const orderStatusLabels: Record<SalesOrderStatus, string> = {
  confirmed: "Confirmado",
  cancelled: "Cancelado",
};

export const orderPaymentLabels: Record<SalesOrderPaymentStatus, string> = {
  pending: "Pendente",
  partial: "Parcial",
  paid: "Recebido",
  cancelled: "Cancelado",
};

export const orderFulfillmentLabels: Record<SalesOrderFulfillmentStatus, string> = {
  pending: "Aguardando separação",
  separating: "Em separação",
  ready: "Pronto",
  delivered: "Entregue",
};

export function nextFulfillmentStep(value: SalesOrderFulfillmentStatus):
  Exclude<SalesOrderFulfillmentStatus, "pending"> | null {
  if (value === "pending") return "separating";
  if (value === "separating") return "ready";
  if (value === "ready") return "delivered";
  return null;
}

export function formatSalesDate(value: string | null | undefined, includeTime = true): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", includeTime
    ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatSalesDueDate(value: string | null | undefined): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? match[3] + "/" + match[2] + "/" + match[1] : value;
}
