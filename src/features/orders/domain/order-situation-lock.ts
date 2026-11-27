/** Uma OS encerrada não permite mais movimentação entre situações. */
export function isOrderSituationLocked(order: {
  situation?: { name?: string | null; slug?: string | null } | null;
  completed_at?: unknown;
  cancelled_at?: unknown;
  order_status?: { name?: string | null } | null;
} | null | undefined): boolean {
  if (!order) return false;
  const statusName = String(order.order_status?.name || "").trim().toLocaleLowerCase("pt-BR");
  return Boolean(order.completed_at || order.cancelled_at)
    || order.situation?.slug === "aguardando-retirada-sem-reparo"
    || String(order.situation?.name || "").trim().toLocaleLowerCase("pt-BR") === "aguardando retirada sem reparo"
    || statusName === "fechada"
    || statusName === "cancelada";
}
