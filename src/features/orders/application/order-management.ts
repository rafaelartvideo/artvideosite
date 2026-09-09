import {
  getServiceOrderResolutionState,
  listOrderStatusOptions,
} from "../infrastructure/orders.repository";

const selectOpenOrderStatus = (statuses: any[]) =>
  statuses.find(status => String(status.name || "").trim().toLocaleLowerCase("pt-BR") === "aberta") || null;

export const getOrderEditState = (orderId: string) => getServiceOrderResolutionState(orderId);

export async function getOrderSubmissionStatus({
  organizationId,
  editingOrder,
}: {
  organizationId: string;
  editingOrder?: any;
  statusId?: string;
}) {
  const { data, error } = await listOrderStatusOptions(organizationId);
  if (error) return { status: null, error };

  // Em edição o valor atual é preservado internamente; na criação toda OS nasce
  // Aberta. O banco também impõe o ciclo de vida, portanto a UI nunca escolhe status.
  if (editingOrder?.status_id) {
    const current = (data || []).find(item => item.id === editingOrder.status_id);
    if (current) return { status: current, error: null };
  }
  return { status: selectOpenOrderStatus(data || []), error: null };
}
