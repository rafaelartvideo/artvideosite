import type { PublicTrackedOrder } from "../domain/service-tracking";
import { getPublicOrder, listPublicOrderHistory } from "../infrastructure/service-tracking.repository";

export async function findPublicServiceOrder(identifier: string): Promise<PublicTrackedOrder | null> {
  const normalizedIdentifier = identifier.trim();
  if (!normalizedIdentifier) return null;

  const { data: order, error } = await getPublicOrder(normalizedIdentifier);
  if (error) throw error;
  if (!order) return null;

  const { data: history, error: historyError } = await listPublicOrderHistory(order.id);
  if (historyError) throw historyError;

  return {
    ...order,
    status: (order.order_status as { name?: string | null } | null)?.name || "Em andamento",
    history: history || [],
  } as PublicTrackedOrder;
}
