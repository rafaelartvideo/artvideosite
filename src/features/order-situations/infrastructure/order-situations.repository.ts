import { supabase } from "@/lib/supabase";
import { getActiveOrganizationId } from "@/lib/active-organization";

export async function listOrderSituations() {
  const organizationId = await getActiveOrganizationId();
  const { data, error } = await supabase
    .from("os_situations")
    .select("id,name,slug,color,hours,sort_order,is_active,created_at,updated_at,organization_id")
    .eq("organization_id", organizationId)
    .order("sort_order");

  if (error) throw error;
  return data ?? [];
}

export async function createOrderSituation(
  payload: Record<string, unknown>,
): Promise<void> {
  const organizationId = await getActiveOrganizationId();
  const { error } = await supabase
    .from("os_situations")
    .insert({ ...payload, organization_id: organizationId });
  if (error) throw error;
}

export async function updateOrderSituation(
  situationId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const organizationId = await getActiveOrganizationId();
  const { error } = await supabase
    .from("os_situations")
    .update(payload)
    .eq("id", situationId)
    .eq("organization_id", organizationId);

  if (error) throw error;
}

export async function deleteOrderSituation(
  situationId: string,
): Promise<void> {
  const organizationId = await getActiveOrganizationId();
  const { error } = await supabase
    .from("os_situations")
    .delete()
    .eq("id", situationId)
    .eq("organization_id", organizationId);

  if (error) throw error;
}
