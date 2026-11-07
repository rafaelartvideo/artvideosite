import { supabase } from "@/lib/supabase";

export type ProductVariation = {
  product_id: string;
  parent_product_id: string;
  is_parent: boolean;
  variation_label: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number | null;
  cover_media_id: string | null;
  quantity: number;
  unit: string;
  conversion_factor: number;
  is_active: boolean;
};

export type ProductVariationInput = {
  product_id: string;
  label: string;
};

export async function listProductVariations(
  organizationId: string,
  productId: string,
): Promise<ProductVariation[]> {
  const { data, error } = await supabase.rpc("list_product_variations_v1", {
    p_organization_id: organizationId,
    p_product_id: productId,
  });
  if (error) throw error;
  return ((data || []) as ProductVariation[]).map(item => ({
    ...item,
    quantity: Number(item.quantity || 0),
    conversion_factor: Math.max(1, Number(item.conversion_factor || 1)),
    price: item.price == null ? null : Number(item.price),
  }));
}

/** Salva apenas o agrupamento: não modifica estoque, preço, SKU nem movimentações. */
export async function replaceProductVariations(
  organizationId: string,
  parentProductId: string,
  variations: ProductVariationInput[],
): Promise<void> {
  const { error } = await supabase.rpc("replace_product_variations_v1", {
    p_organization_id: organizationId,
    p_parent_product_id: parentProductId,
    p_variations: variations,
  });
  if (error) throw error;
}

export type NewProductVariation = {
  label: string;
  attributes: Record<string, string>;
  sku: string;
  barcode: string | null;
  product_condition?: "new" | "used" | "refurbished";
  supplier_mode?: "inherit" | "custom";
  supplier_links?: Array<{ entity_id: string; supplier_reference: string | null }>;
  price: number | null;
  quantity: number;
};

/** Creates every variation and its inventory atomically in the database. */
export async function createProductVariationCombinations(
  organizationId: string,
  parentProductId: string,
  combinations: NewProductVariation[],
): Promise<Array<{ product_id: string; variation_label: string }>> {
  const { data, error } = await supabase.rpc("create_product_variation_combinations_v1", {
    p_organization_id: organizationId,
    p_parent_product_id: parentProductId,
    p_combinations: combinations,
  });
  if (error) throw error;
  return (data || []) as Array<{ product_id: string; variation_label: string }>;
}

export type ProductVariantOption = { name: string; values: string };

/** Atributos do produto principal persistem mesmo quando só existe uma opção. */
export async function listProductVariationOptions(
  organizationId: string,
  productId: string,
): Promise<ProductVariantOption[]> {
  const { data, error } = await supabase.rpc("list_product_variation_options_v1", {
    p_organization_id: organizationId,
    p_product_id: productId,
  });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("Formato inválido dos atributos do produto.");
  return data as ProductVariantOption[];
}

/** Guarda a configuração sem criar produtos/estoques artificiais. */
export async function replaceProductVariationOptions(
  organizationId: string,
  productId: string,
  options: ProductVariantOption[],
): Promise<void> {
  const { error } = await supabase.rpc("replace_product_variation_options_v1", {
    p_organization_id: organizationId,
    p_parent_product_id: productId,
    p_options: options,
  });
  if (error) throw error;
}
