import { supabase } from "@/lib/supabase";

export async function listBrands() {
  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .order("sort_order");

  if (error) throw error;
  return data ?? [];
}

export async function saveBrand(
  payload: Record<string, unknown>,
  brandId?: string,
) {
  const query = brandId
    ? supabase.from("brands").update(payload).eq("id", brandId)
    : supabase.from("brands").insert(payload);

  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

export async function deleteBrand(brandId: string): Promise<void> {
  const { error } = await supabase.from("brands").delete().eq("id", brandId);
  if (error) throw error;
}

export async function setBrandActive(
  brandId: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("brands")
    .update({ is_active: isActive })
    .eq("id", brandId);

  if (error) throw error;
}
