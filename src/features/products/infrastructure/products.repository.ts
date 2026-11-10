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
  const { data, error } = await supabase.rpc("save_inventory_item_unified_v7", {
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


export type RelatedProductCode = {
  code: string;
  relation_type: "previous" | "successor" | "alternate" | "similar" | "generic";
};

export async function listRelatedProductCodes(
  organizationId: string, productId: string,
): Promise<RelatedProductCode[]> {
  const { data, error } = await supabase.rpc("list_product_related_codes", {
    p_organization_id: organizationId,
    p_product_id: productId,
  });
  if (error) throw error;
  return (data || []) as RelatedProductCode[];
}

export async function replaceRelatedProductCodes(
  organizationId: string, productId: string, codes: RelatedProductCode[],
): Promise<number> {
  const { data, error } = await supabase.rpc("replace_product_related_codes", {
    p_organization_id: organizationId,
    p_product_id: productId,
    p_codes: codes.map(item => ({
      code: item.code.trim().toUpperCase(),
      relation_type: item.relation_type,
    })),
  });
  if (error) throw error;
  return Number(data || 0);
}


/** IDs de outros produtos da mesma empresa vinculados como alternativas compatíveis. */
export async function listProductCompatibilityIds(
  organizationId: string, productId: string,
): Promise<string[]> {
  const { data, error } = await supabase.rpc("list_product_compatibility_ids_v1", {
    p_organization_id: organizationId,
    p_product_id: productId,
  });
  if (error) throw error;
  return ((data || []) as Array<{ product_id: string }>).map(entry => entry.product_id);
}

/** A relação é recíproca: vincular A-B também disponibiliza B-A nas buscas. */
export async function replaceProductCompatibilities(
  organizationId: string, productId: string, compatibleIds: string[],
): Promise<number> {
  const { data, error } = await supabase.rpc("replace_product_compatibilities_v1", {
    p_organization_id: organizationId,
    p_product_id: productId,
    p_compatible_ids: compatibleIds,
  });
  if (error) throw error;
  return Number(data || 0);
}

export type ProductCodeCompatibility = {
  product_id: string;
  name: string;
  sku: string | null;
  price: number | null;
  cover_media_id: string | null;
  stock: number;
  unit: string;
  matched_code: string;
};

/** Compatibilidade inferida no banco em tempo real a partir dos códigos cadastrados. */
export async function listProductCodeCompatibilities(
  organizationId: string,
  productId: string,
): Promise<ProductCodeCompatibility[]> {
  const { data, error } = await supabase.rpc("list_product_code_compatibilities_v1", {
    p_organization_id: organizationId,
    p_product_id: productId,
  });
  if (error) throw error;
  return ((data || []) as ProductCodeCompatibility[]).map(row => ({
    ...row,
    stock: Number(row.stock || 0),
    price: row.price == null ? null : Number(row.price),
  }));
}

/** Similares comerciais não implicam compatibilidade técnica. Relações recíprocas por empresa. */
export async function listProductSimilarIds(
  organizationId: string, productId: string,
): Promise<string[]> {
  const { data, error } = await supabase.rpc("list_product_similar_ids_v1", {
    p_organization_id: organizationId, p_product_id: productId,
  });
  if (error?.code === "PGRST202") return []; // migração ainda não aplicada
  if (error) throw error;
  return ((data || []) as Array<{ product_id: string }>).map(row => row.product_id);
}

export async function replaceProductSimilarIds(
  organizationId: string, productId: string, ids: string[],
): Promise<number> {
  const { data, error } = await supabase.rpc("replace_product_similar_ids_v1", {
    p_organization_id: organizationId, p_product_id: productId, p_similar_ids: ids,
  });
  if (error) throw error;
  return Number(data || 0);
}


export type RelatedCatalogProduct = {
  product_id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  manufacturer_code: string | null;
  price: number | null;
  cover_media_id: string | null;
  stock: number;
  unit: string;
  relation_type: string;
  matched_code: string | null;
};

/** A mesma consulta funciona do produto principal para filhos e no sentido inverso. */
export async function listProductRelations(organizationId: string, productId: string): Promise<RelatedCatalogProduct[]> {
  const { data, error } = await supabase.rpc("list_product_relations_v2", {
    p_organization_id: organizationId, p_product_id: productId,
  });
  if (error) throw error;
  return ((data || []) as RelatedCatalogProduct[]).map(row => ({
    ...row, stock: Number(row.stock || 0), price: row.price == null ? null : Number(row.price),
  }));
}


export type InventoryProductSearchRelation = {
  product_id: string;
  relation_type: string | null;
  is_direct: boolean;
};

/** Pesquisa no estoque por nome/código expande variantes e referências nos dois sentidos. */
export async function searchInventoryProductRelations(
  organizationId: string,
  search: string,
): Promise<InventoryProductSearchRelation[]> {
  const { data, error } = await supabase.rpc("search_inventory_product_relations_v2", {
    p_organization_id: organizationId,
    p_search: search.trim(),
    p_limit: 200,
  });
  if (error) throw error;
  return (data || []) as InventoryProductSearchRelation[];
}
