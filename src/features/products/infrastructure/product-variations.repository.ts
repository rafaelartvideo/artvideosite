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
