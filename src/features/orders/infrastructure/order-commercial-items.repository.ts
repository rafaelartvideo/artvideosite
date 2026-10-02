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
    .select("id,service_order_id,organization_id,item_type,general_service_id,inventory_item_id,title_snapshot,description_snapshot,quantity,unit_price,unit_snapshot,additional_cost,subtotal,created_at,updated_at")
    .eq("service_order_id", serviceOrderId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((item: any) => ({
    ...item,
    quantity: numberValue(item.quantity),
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
}) {
  const { data, error } = await supabase.rpc("add_service_order_catalog_item_v1", {
    p_service_order_id: input.serviceOrderId,
    p_item_type: input.itemType,
    p_catalog_id: input.catalogId,
    p_quantity: input.quantity,
    p_unit_price: input.unitPrice,
  });
  if (error) throw error;
  return normalizePricing(data);
}

export async function addOrderCustomService(input: {
  serviceOrderId: string;
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
}) {
  const { data, error } = await supabase.rpc("add_service_order_custom_service_v1", {
    p_service_order_id: input.serviceOrderId,
    p_name: input.name.trim(),
    p_description: input.description.trim() || null,
    p_quantity: input.quantity,
    p_unit_price: input.unitPrice,
  });
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
