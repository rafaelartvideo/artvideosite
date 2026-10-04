import { supabase } from "@/lib/supabase";

export type ProductInventorySettingsInput = {
  unit: "un" | "cx";
  conversion_factor: number;
  min_quantity: number;
  storage_shelf?: string | null;
  storage_level?: string | null;
  storage_compartment?: string | null;
  supplier_entity_ids?: string[];
  supplier_links?: Array<{ entity_id: string; supplier_reference?: string | null }>;
  initial_supplier_entity_id?: string | null;
  initial_reference?: string | null;
};

export async function loadProductCatalog(
  organizationId: string,
  options: { loadCategories?: boolean; loadBrands?: boolean } = {},
) {
  const { data, error } = await supabase.rpc("load_product_catalog_admin_v1", {
    p_organization_id: organizationId,
    p_load_categories: options.loadCategories !== false,
    p_load_brands: options.loadBrands !== false,
  });
  if (error) throw error;

  const catalog = (data || {}) as Record<string, unknown>;
  return {
    products: Array.isArray(catalog.products) ? catalog.products : [],
    categories: Array.isArray(catalog.categories) ? catalog.categories : [],
    brands: Array.isArray(catalog.brands) ? catalog.brands : [],
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
  const { data, error } = await supabase.rpc("save_inventory_item_unified_v5", {
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
    .eq("id", productId)
    .select("id")
    .single();

  if (error) throw error;
}

