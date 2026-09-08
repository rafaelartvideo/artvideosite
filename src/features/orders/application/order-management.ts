import {
  getServiceOrderResolutionState,
  listOrderStatusOptions,
} from "../infrastructure/orders.repository";

const selectInitialOrderStatus = (statuses: any[]) => {
  const ordered = [...statuses].sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0));
  return ordered.find(status => /abert|novo|recebid|pendente/i.test(status.name || "")) || ordered[0] || null;
};

export const getOrderEditState = (orderId: string) => getServiceOrderResolutionState(orderId);

export async function getOrderSubmissionStatus({
  organizationId,
  editingOrder,
  statusId,
}: {
  organizationId: string;
  editingOrder: any;
  statusId: string;
}) {
  const { data, error } = await listOrderStatusOptions(organizationId);
  const status = editingOrder ? (data || []).find(item => item.id === statusId) || null : selectInitialOrderStatus(data || []);
  return { status, error };
}
