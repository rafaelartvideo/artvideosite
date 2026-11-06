import { supabase } from "@/lib/supabase";

export type OrderCommercialItemType = "service" | "product" | "custom_service";

export type OrderCommercialItem = {
  id: string;
  service_order_id: string;
  organization_id: string;
  item_type: OrderCommercialItemType;
  general_service_id: string | null;
  inventory_item_id: string | null;
  title_snapshot: string;
  description_snapshot: string | null;
  quantity: number;
  unit_price: number | null;
  unit_snapshot: string | null;
  additional_cost: number;
  subtotal: number | null;
  created_at: string;
  updated_at: string;
  quote_proposal_id?: string | null;
  is_pinned: boolean;
};

export type OrderCatalogOption = {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  price: number | null;
  stock: number | null;
  price_at_completion: boolean;
};

export type OrderCommercialPricing = {
  service_price: number;
  parts_total: number;
  commercial_products_total?: number;
  resolution_products_total?: number;
  subtotal: number;
  discount_type: "percentage" | "amount";
  discount_percentage: number;
  discount_amount: number;
  final_total: number;
  commercial_pricing_enabled: boolean;
};

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePricing(value: any): OrderCommercialPricing {
  const source = value?.pricing || value || {};
  return {
    service_price: numberValue(source.service_price),
    parts_total: numberValue(source.parts_total),
    commercial_products_total: source.commercial_products_total == null ? undefined : numberValue(source.commercial_products_total),
    resolution_products_total: source.resolution_products_total == null ? undefined : numberValue(source.resolution_products_total),
    subtotal: numberValue(source.subtotal),
    discount_type: source.discount_type === "amount" ? "amount" : "percentage",
    discount_percentage: numberValue(source.discount_percentage),
    discount_amount: numberValue(source.discount_amount),
    final_total: numberValue(source.final_total),
    commercial_pricing_enabled: source.commercial_pricing_enabled !== false,
  };
}

export async function listOrderCommercialItems(serviceOrderId: string): Promise<OrderCommercialItem[]> {
  const { data, error } = await supabase
    .from("service_order_items")
    .select("id,service_order_id,organization_id,item_type,general_service_id,inventory_item_id,title_snapshot,description_snapshot,quantity,unit_price,unit_snapshot,additional_cost,subtotal,created_at,updated_at,quote_proposal_id,is_pinned")
    .eq("service_order_id", serviceOrderId)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((item: any) => ({
    ...item,
    quantity: numberValue(item.quantity),
    is_pinned: Boolean(item.is_pinned),
    unit_price: item.unit_price == null ? null : numberValue(item.unit_price),
    additional_cost: numberValue(item.additional_cost),
    subtotal: item.subtotal == null ? null : numberValue(item.subtotal),
  })) as OrderCommercialItem[];
}

async function searchCatalog(
  rpc: "search_service_order_services_v1" | "search_service_order_products_v1",
  serviceOrderId: string,
  search: string,
): Promise<OrderCatalogOption[]> {
  const { data, error } = await supabase.rpc(rpc, {
    p_service_order_id: serviceOrderId,
    p_search: search.trim(),
    p_limit: 20,
  });
  if (error) throw error;
  return (data || []).map((item: any) => ({
    id: String(item.id),
    name: String(item.name || ""),
    description: item.description == null ? null : String(item.description),
    unit: String(item.unit || "un"),
    price: item.price == null ? null : numberValue(item.price),
    stock: item.stock == null ? null : numberValue(item.stock),
    price_at_completion: Boolean(item.price_at_completion),
  }));
}

export type OrderCompatibleProduct = {
  source_inventory_item_id: string;
  inventory_item_id: string;
  product_id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number | null;
  cover_media_id: string | null;
  stock: number;
  unit: string;
};

/** Compatibilidade automática por códigos: consulta agrupada para OS, orçamentos e solicitações. */
export async function listOrderProductCompatibilities(
  serviceOrderId: string,
  sourceInventoryItemIds: string[],
): Promise<OrderCompatibleProduct[]> {
  if (!serviceOrderId || !sourceInventoryItemIds.length) return [];
  const { data, error } = await supabase.rpc("list_service_order_product_compatibilities_v1", {
    p_service_order_id: serviceOrderId,
    p_source_inventory_ids: [...new Set(sourceInventoryItemIds)].slice(0, 30),
  });
  if (error) throw error;
  return ((data || []) as OrderCompatibleProduct[]).map(item => ({
    ...item,
    stock: numberValue(item.stock),
    price: item.price == null ? null : numberValue(item.price),
  }));
}

/** Similaridade comercial explícita. Não equivale à compatibilidade técnica. */
export async function listOrderProductSimilars(
  serviceOrderId: string,
  sourceInventoryItemIds: string[],
): Promise<OrderCompatibleProduct[]> {
  if (!serviceOrderId || !sourceInventoryItemIds.length) return [];
  const { data, error } = await supabase.rpc("list_service_order_product_similars_v1", {
    p_service_order_id: serviceOrderId,
    p_source_inventory_ids: [...new Set(sourceInventoryItemIds)].slice(0, 30),
  });
  if (error) throw error;
  return ((data || []) as OrderCompatibleProduct[]).map(item => ({
    ...item,
    stock: numberValue(item.stock),
    price: item.price == null ? null : numberValue(item.price),
  }));
}

export function searchOrderServices(serviceOrderId: string, search: string) {
  return searchCatalog("search_service_order_services_v1", serviceOrderId, search);
}

export function searchOrderProducts(serviceOrderId: string, search: string) {
  return searchCatalog("search_service_order_products_v1", serviceOrderId, search);
}

export async function addOrderCatalogItem(input: {
  serviceOrderId: string;
  itemType: "service" | "product";
  catalogId: string;
  quantity: number;
  unitPrice: number | null;
  technicianIds?: string[];
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
}) {
  const withTechnician = input.itemType === "service" && Boolean(input.technicianIds?.length);
  const scheduled = withTechnician && Boolean(input.scheduledStartAt && input.scheduledEndAt);
  const { data, error } = await supabase.rpc(
    scheduled ? "add_service_order_catalog_item_scheduled_v1"
      : withTechnician ? "add_service_order_catalog_item_with_technicians_v1"
        : "add_service_order_catalog_item_v1",
    withTechnician ? {
      p_service_order_id: input.serviceOrderId,
      p_catalog_id: input.catalogId,
      p_employee_ids: input.technicianIds,
      p_quantity: input.quantity,
      ...(scheduled ? { p_start_at: input.scheduledStartAt, p_end_at: input.scheduledEndAt } : {}),
    } : {
      p_service_order_id: input.serviceOrderId,
      p_item_type: input.itemType,
      p_catalog_id: input.catalogId,
      p_quantity: input.quantity,
      p_unit_price: input.unitPrice,
    },
  );
  if (error) throw error;
  return normalizePricing(data);
}

export async function addOrderCustomService(input: {
  serviceOrderId: string;
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  technicianIds?: string[];
}) {
  const withTechnician = Boolean(input.technicianIds?.length);
  const { data, error } = await supabase.rpc(
    withTechnician ? "add_service_order_custom_service_with_technicians_v1" : "add_service_order_custom_service_v1",
    {
      p_service_order_id: input.serviceOrderId,
      p_name: input.name.trim(),
      p_description: input.description.trim() || null,
      p_quantity: input.quantity,
      p_unit_price: input.unitPrice,
      ...(withTechnician ? { p_employee_ids: input.technicianIds } : {}),
    },
  );
  if (error) throw error;
  return normalizePricing(data);
}

export async function updateOrderCommercialItem(input: {
  itemId: string;
  quantity: number;
  unitPrice: number;
  additionalCost: number;
  description: string;
}) {
  const { data, error } = await supabase.rpc("update_service_order_commercial_item_v1", {
    p_item_id: input.itemId,
    p_quantity: input.quantity,
    p_unit_price: input.unitPrice,
    p_additional_cost: input.additionalCost,
    p_description: input.description.trim() || null,
  });
  if (error) throw error;
  return normalizePricing(data);
}

export async function deleteOrderCommercialItem(itemId: string) {
  const { data, error } = await supabase.rpc("delete_service_order_commercial_item_v1", {
    p_item_id: itemId,
  });
  if (error) throw error;
  return normalizePricing(data);
}

/** Reordenação visual: pode ser feita após aprovação sem modificar o contrato comercial. */
export async function setOrderCommercialItemPinned(input: {
  itemId: string;
  serviceOrderId: string;
  pinned: boolean;
}): Promise<boolean> {
  const { data, error } = await supabase
    .from("service_order_items")
    .update({ is_pinned: input.pinned })
    .eq("id", input.itemId)
    .eq("service_order_id", input.serviceOrderId)
    .select("id,is_pinned")
    .single();
  if (error) throw error;
  return Boolean(data.is_pinned);
}

/** Edição limitada ao título e à descrição de um serviço avulso ainda não aprovado. */
export async function updateOrderCustomServiceDetails(input: {
  itemId: string;
  serviceOrderId: string;
  title: string;
  description: string;
}): Promise<void> {
  const title = input.title.trim();
  if (!title || title.length > 120) throw new Error("Informe um nome com até 120 caracteres.");
  if (input.description.trim().length > 2000) throw new Error("A descrição deve ter até 2000 caracteres.");
  const { data, error } = await supabase
    .from("service_order_items")
    .update({
      title_snapshot: title,
      description_snapshot: input.description.trim(),
    })
    .eq("id", input.itemId)
    .eq("service_order_id", input.serviceOrderId)
    .eq("item_type", "custom_service")
    .select("id")
    .single();
  if (error) throw error;
  if (!data?.id) throw new Error("O serviço avulso não está disponível para edição.");
}

export async function setOrderCommercialDiscount(
  serviceOrderId: string,
  discountType: "percentage" | "amount",
  discountValue: number,
) {
  const { data, error } = await supabase.rpc("set_service_order_discount_v1", {
    p_service_order_id: serviceOrderId,
    p_discount_type: discountType,
    p_discount_value: discountValue,
  });
  if (error) throw error;
  return normalizePricing(data);
}
