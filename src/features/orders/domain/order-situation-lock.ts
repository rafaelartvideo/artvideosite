/** Uma OS encerrada não permite mais movimentação entre situações. */
export function isOrderSituationLocked(order: {
  completed_at?: unknown;
  cancelled_at?: unknown;
  order_status?: { name?: string | null } | null;
} | null | undefined): boolean {
  if (!order) return false;
  const statusName = String(order.order_status?.name || "").trim().toLocaleLowerCase("pt-BR");
  return Boolean(order.completed_at || order.cancelled_at)
    || statusName === "fechada"
    || statusName === "cancelada";
}
