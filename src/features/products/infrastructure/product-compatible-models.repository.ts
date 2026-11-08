import { supabase } from "@/lib/supabase";

export type CompatibleDeviceModel = {
  device_type: string;
  brand: string;
  model: string;
  product_id?: string;
  inherited_from_parent?: boolean;
};

export type CompatibleDeviceModelConfiguration = {
  parent_product_id: string | null;
  inherited: boolean;
  models: CompatibleDeviceModel[];
};

export async function listCompatibleModelsForProducts(
  organizationId: string,
  productIds: string[],
): Promise<CompatibleDeviceModel[]> {
  const ids = [...new Set(productIds.filter(Boolean))].slice(0, 100);
  if (!organizationId || ids.length === 0) return [];
  const { data, error } = await supabase.rpc("list_product_device_compatible_models_v1", {
    p_organization_id: organizationId,
    p_product_ids: ids,
  });
  if (error) throw error;
  return (data || []) as CompatibleDeviceModel[];
}

export async function getProductCompatibleModels(
  organizationId: string,
  productId: string,
): Promise<CompatibleDeviceModelConfiguration> {
  if (!organizationId || !productId) throw new Error("Empresa e produto são obrigatórios.");
  const { data, error } = await supabase.rpc("get_product_device_compatible_models_v1", {
    p_organization_id: organizationId,
    p_product_id: productId,
  });
  if (error) throw error;
  const result = data as CompatibleDeviceModelConfiguration | null;
  return {
    parent_product_id: result?.parent_product_id || null,
    inherited: result?.inherited === true,
    models: Array.isArray(result?.models) ? result.models : [],
  };
}

export async function replaceProductCompatibleModels(
  organizationId: string,
  productId: string,
  models: CompatibleDeviceModel[],
  inheritParent = false,
): Promise<number> {
  if (!organizationId || !productId) throw new Error("Empresa e produto são obrigatórios.");
  const { data, error } = await supabase.rpc("replace_product_device_compatible_models_v1", {
    p_organization_id: organizationId,
    p_product_id: productId,
    p_models: models.map(({ device_type, brand, model }) => ({
      device_type: device_type.trim(),
      brand: brand.trim(),
      model: model.trim(),
    })),
    p_inherit_parent: inheritParent,
  });
  if (error) throw error;
  return Number(data || 0);
}
