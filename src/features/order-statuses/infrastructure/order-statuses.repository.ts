import { supabase } from "@/lib/supabase";
import { getActiveOrganizationId } from "@/lib/active-organization";

export async function listOrderStatuses() {
  const organizationId = await getActiveOrganizationId();
  const { data, error } = await supabase
    .from("order_statuses")
    .select("id,name,color,sort_order,organization_id")
    .eq("organization_id", organizationId)
    .order("sort_order");

  if (error) throw error;
  return data ?? [];
}

export async function saveOrderStatus(
  payload: Record<string, unknown>,
  statusId?: string,
): Promise<void> {
  const organizationId = await getActiveOrganizationId();
  const { error } = statusId
    ? await supabase
        .from("order_statuses")
        .update(payload)
        .eq("id", statusId)
        .eq("organization_id", organizationId)
    : await supabase
        .from("order_statuses")
        .insert({ ...payload, organization_id: organizationId });

  if (error) throw error;
}

export async function deleteOrderStatus(statusId: string): Promise<void> {
  const organizationId = await getActiveOrganizationId();
  const { error } = await supabase
    .from("order_statuses")
    .delete()
    .eq("id", statusId)
    .eq("organization_id", organizationId);

  if (error) throw error;
}
