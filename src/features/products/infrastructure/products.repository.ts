import { supabase } from "@/lib/supabase";

export type ProductInventorySettingsInput = {
  unit: "un" | "cx";
  conversion_factor: number;
  min_quantity: number;
  storage_shelf?: string | null;
  storage_level?: string | null;
  storage_compartment?: string | null;
  supplier_entity_ids?: string[];
  initial_supplier_entity_id?: string | null;
  initial_reference?: string | null;
};

export async function loadProductCatalog(
  organizationId: string,
  options: { loadCategories?: boolean; loadBrands?: boolean } = {},
) {
  const productsPromise = supabase
    .from("products")
    .select("*, product_categories(name), brands(name)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  const inventoryPromise = supabase.rpc("get_product_inventory_management", {
    p_organization_id: organizationId,
  });

  const inventoryIdentityPromise = supabase
    .from("inventory_items")
    .select("product_id,sku")
    .eq("organization_id", organizationId)
    .not("product_id", "is", null);

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

  const [productsResult, inventoryResult, inventoryIdentityResult, categoriesResult, brandsResult] = await Promise.all([
    productsPromise,
    inventoryPromise,
    inventoryIdentityPromise,
    categoriesPromise,
    brandsPromise,
  ]);

  if (productsResult.error) throw productsResult.error;
  if (inventoryResult.error) throw inventoryResult.error;
  if (inventoryIdentityResult.error) throw inventoryIdentityResult.error;
  if (categoriesResult.error) throw categoriesResult.error;
  if (brandsResult.error) throw brandsResult.error;

  const inventoryIdentityByProductId = new Map(
    (inventoryIdentityResult.data ?? []).map((item: any) => [String(item.product_id), item]),
  );
  const inventoryByProductId = new Map(
    (inventoryResult.data ?? []).map((item: any) => {
      const identity = inventoryIdentityByProductId.get(String(item.product_id));
      return [String(item.product_id), { ...item, sku: identity?.sku ?? null }];
    }),
  );

  return {
    products: (productsResult.data ?? []).map((product: any) => ({
      ...product,
      inventory: inventoryByProductId.get(String(product.id)) ?? null,
    })),
    categories: categoriesResult.data ?? [],
    brands: brandsResult.data ?? [],
  };
}

export async function saveCompleteProduct(
  organizationId: string,
  productId: string | undefined,
  product: Record<string, unknown>,
  inventory: ProductInventorySettingsInput,
  initialQuantity: number,
  initialUnitCost: number | null,
) {
  const { data, error } = await supabase.rpc("save_inventory_item_unified_v3", {
    p_organization_id: organizationId,
    p_product_id: productId ?? null,
    p_product: product,
    p_inventory: inventory,
    p_initial_quantity: initialQuantity,
    p_initial_unit_cost: initialUnitCost,
  });
  if (error) throw error;
  if (!data) throw new Error("O item foi salvo sem retornar seu identificador.");
  return String(data);
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

