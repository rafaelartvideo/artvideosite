import { supabase } from "@/lib/supabase";

export async function loadProductCatalog(
  organizationId: string,
  options: { loadCategories?: boolean; loadBrands?: boolean } = {},
) {
  const productsPromise = supabase
    .from("products")
    .select("*, product_categories(name), brands(name)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  const categoriesPromise = options.loadCategories
    ? supabase
        .from("product_categories")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("sort_order")
    : Promise.resolve({ data: [], error: null });

  const brandsPromise = options.loadBrands
    ? supabase
        .from("brands")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("sort_order")
    : Promise.resolve({ data: [], error: null });

  const [productsResult, categoriesResult, brandsResult] = await Promise.all([
    productsPromise,
    categoriesPromise,
    brandsPromise,
  ]);

  if (productsResult.error) throw productsResult.error;
  if (categoriesResult.error) throw categoriesResult.error;
  if (brandsResult.error) throw brandsResult.error;

  return {
    products: productsResult.data ?? [],
    categories: categoriesResult.data ?? [],
    brands: brandsResult.data ?? [],
  };
}

export async function saveProduct(
  organizationId: string,
  payload: Record<string, unknown>,
  productId: string | undefined,
  createdBy: string | null,
) {
  const query = productId
    ? supabase.from("products").update(payload).eq("organization_id", organizationId).eq("id", productId)
    : supabase.from("products").insert({ ...payload, organization_id: organizationId, created_by: createdBy });

  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

export async function deleteProduct(organizationId: string, productId: string): Promise<void> {
  const { error } = await supabase
    .from("products")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", productId);

  if (error) throw error;
}

export async function updateProductFlags(
  organizationId: string,
  productId: string,
  flags: { is_active?: boolean; is_featured?: boolean; show_in_catalog?: boolean },
  updatedBy: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("products")
    .update({ ...flags, updated_by: updatedBy })
    .eq("organization_id", organizationId)
    .eq("id", productId);

  if (error) throw error;
}
