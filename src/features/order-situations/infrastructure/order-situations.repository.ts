import { supabase } from "@/lib/supabase";

export const listOrderSituations = () =>
  supabase
    .from("os_situations")
    .select("id,name,slug,color,hours,sort_order,is_active,created_at,updated_at")
    .order("sort_order");

export const createOrderSituation = (payload: Record<string, unknown>) =>
  supabase.from("os_situations").insert(payload);

export const updateOrderSituation = (
  situationId: string,
  payload: Record<string, unknown>,
) => supabase.from("os_situations").update(payload).eq("id", situationId);

export const deleteOrderSituation = (situationId: string) =>
  supabase.from("os_situations").delete().eq("id", situationId);
