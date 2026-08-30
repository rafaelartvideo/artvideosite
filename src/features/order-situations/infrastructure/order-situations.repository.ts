import { supabase } from "@/lib/supabase";

export async function listOrderSituations() {
  const { data, error } = await supabase
    .from("os_situations")
    .select("id,name,slug,color,hours,sort_order,is_active,created_at,updated_at")
    .order("sort_order");

  if (error) throw error;
  return data ?? [];
}

export async function createOrderSituation(
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("os_situations").insert(payload);
  if (error) throw error;
}

export async function updateOrderSituation(
  situationId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from("os_situations")
    .update(payload)
    .eq("id", situationId);

  if (error) throw error;
}

export async function deleteOrderSituation(
  situationId: string,
): Promise<void> {
  const { error } = await supabase
    .from("os_situations")
    .delete()
    .eq("id", situationId);

  if (error) throw error;
}
