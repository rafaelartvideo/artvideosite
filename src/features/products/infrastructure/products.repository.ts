import { supabase } from "@/lib/supabase";
import { PLATFORM_ORGANIZATION_ID } from "@/lib/organization.constants";

export async function loadProductCatalog() {
  const organizationId = PLATFORM_ORGANIZATION_ID;
  const [productsResult, categoriesResult] = await Promise.all([
    supabase
      .from("products")
      .select("*, product_categories(name)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("product_categories")
      .select("id, name")
      .eq("organization_id", organizationId)
      .order("sort_order"),
  ]);

  if (productsResult.error) throw productsResult.error;
  if (categoriesResult.error) throw categoriesResult.error;

  return {
    products: productsResult.data ?? [],
    categories: categoriesResult.data ?? [],
  };
}

export async function saveProduct(
  payload: Record<string, unknown>,
  productId: string | undefined,
  createdBy: string | null,
) {
  const organizationId = PLATFORM_ORGANIZATION_ID;
  const query = productId
    ? supabase.from("products").update(payload).eq("organization_id", organizationId).eq("id", productId)
    : supabase.from("products").insert({ ...payload, organization_id: organizationId, created_by: createdBy });

  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

export async function deleteProduct(productId: string): Promise<void> {
  const organizationId = PLATFORM_ORGANIZATION_ID;
  const { error } = await supabase.from("products").delete().eq("organization_id", organizationId).eq("id", productId);
  if (error) throw error;
}

export async function updateProductFlags(
  productId: string,
  flags: { is_active?: boolean; is_featured?: boolean },
  updatedBy: string | null,
): Promise<void> {
  const organizationId = PLATFORM_ORGANIZATION_ID;
  const { error } = await supabase
    .from("products")
    .update({ ...flags, updated_by: updatedBy })
    .eq("organization_id", organizationId)
    .eq("id", productId);

  if (error) throw error;
}
