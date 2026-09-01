import { supabase } from "@/lib/supabase";

export async function listOrderStatuses() {
  const { data, error } = await supabase
    .from("order_statuses")
    .select("id,name,color,sort_order")
    .order("sort_order");

  if (error) throw error;
  return data ?? [];
}

export async function saveOrderStatus(
  payload: Record<string, unknown>,
  statusId?: string,
): Promise<void> {
  const { error } = statusId
    ? await supabase.from("order_statuses").update(payload).eq("id", statusId)
    : await supabase.from("order_statuses").insert(payload);

  if (error) throw error;
}

export async function deleteOrderStatus(statusId: string): Promise<void> {
  const { error } = await supabase
    .from("order_statuses")
    .delete()
    .eq("id", statusId);

  if (error) throw error;
}
