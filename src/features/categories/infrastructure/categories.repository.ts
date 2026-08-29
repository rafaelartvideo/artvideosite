import { supabase } from "@/lib/supabase";

export async function listCategories() {
  const { data, error } = await supabase
    .from("service_categories")
    .select("*")
    .order("sort_order");

  if (error) throw error;
  return data ?? [];
}

export async function saveCategory(
  payload: Record<string, unknown>,
  categoryId?: string,
) {
  const query = categoryId
    ? supabase.from("service_categories").update(payload).eq("id", categoryId)
    : supabase.from("service_categories").insert(payload);

  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

export async function deleteCategory(categoryId: string): Promise<void> {
  const { error } = await supabase
    .from("service_categories")
    .delete()
    .eq("id", categoryId);

  if (error) throw error;
}

export async function setCategoryActive(
  categoryId: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("service_categories")
    .update({ is_active: isActive })
    .eq("id", categoryId);

  if (error) throw error;
}
