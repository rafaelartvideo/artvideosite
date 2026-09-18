import type { PublicTrackedOrder } from "../domain/service-tracking";
import { getPublicOrder } from "../infrastructure/service-tracking.repository";

export async function findPublicServiceOrder(identifier: string): Promise<PublicTrackedOrder | null> {
  const normalizedIdentifier = identifier.trim();
  if (!normalizedIdentifier) return null;

  const { data: order, error } = await getPublicOrder(normalizedIdentifier);
  if (error) throw error;
  if (!order) return null;

  return order as PublicTrackedOrder;
}
