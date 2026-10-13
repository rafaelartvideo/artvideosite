import {
  getServiceOrderResolutionState,
  listOrderStatusOptions,
} from "../infrastructure/orders.repository";

const selectOpenOrderStatus = (statuses: any[]) => {
  const ordered = [...statuses].sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0));
  return ordered.find(status => String(status.name || "").trim().toLocaleLowerCase("pt-BR") === "aberta") || ordered[0] || null;
};

export const getOrderEditState = (orderId: string) => getServiceOrderResolutionState(orderId);

export async function getOrderSubmissionStatus({
  organizationId,
  editingOrder,
  availableStatuses,
}: {
  organizationId: string;
  editingOrder?: any;
  statusId?: string;
  availableStatuses?: any[];
}) {
  // A abertura do módulo já traz os status no RPC consolidado. Não executar
  // o mesmo GET novamente em todo salvamento; consulta avulsa é fallback.
  const statuses = availableStatuses?.length
    ? availableStatuses
    : null;
  const result = statuses
    ? { data: statuses, error: null }
    : await listOrderStatusOptions(organizationId);
  const { data, error } = result;
  if (error) return { status: null, error };

  // Em edição o valor atual é preservado internamente; na criação a preferência
  // é sempre Aberta. O fallback só mantém compatibilidade até a migração ser aplicada.
  if (editingOrder?.status_id) {
    const current = (data || []).find(item => item.id === editingOrder.status_id);
    if (current) return { status: current, error: null };
  }
  return { status: selectOpenOrderStatus(data || []), error: null };
}
