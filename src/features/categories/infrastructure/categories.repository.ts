import { supabase } from "@/lib/supabase";
import { getActiveOrganizationId } from "@/lib/active-organization";

export async function listCategories() {
  const organizationId = await getActiveOrganizationId();
  const { data, error } = await supabase
    .from("service_categories")
    .select("*")
    .eq("organization_id", organizationId)
    .order("sort_order");

  if (error) throw error;
  return data ?? [];
}

export async function saveCategory(
  payload: Record<string, unknown>,
  categoryId?: string,
) {
  const organizationId = await getActiveOrganizationId();
  const query = categoryId
    ? supabase.from("service_categories").update(payload).eq("organization_id", organizationId).eq("id", categoryId)
    : supabase.from("service_categories").insert({ ...payload, organization_id: organizationId });

  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

export async function deleteCategory(categoryId: string): Promise<void> {
  const organizationId = await getActiveOrganizationId();
  const { error } = await supabase
    .from("service_categories")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", categoryId);

  if (error) throw error;
}

export async function setCategoryActive(
  categoryId: string,
  isActive: boolean,
): Promise<void> {
  const organizationId = await getActiveOrganizationId();
  const { error } = await supabase
    .from("service_categories")
    .update({ is_active: isActive })
    .eq("organization_id", organizationId)
    .eq("id", categoryId);

  if (error) throw error;
}
