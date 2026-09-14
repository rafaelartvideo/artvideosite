import { getActiveOrganizationId } from "@/lib/active-organization";
import { supabase } from "@/lib/supabase";

export type InventorySupplier = {
  id: string;
  name: string;
  legal_name: string | null;
  trade_name: string | null;
  document: string | null;
  person_type: "PF" | "PJ";
  is_active: boolean;
};

export type InventoryMovementInput = {
  inventory_item_id: string;
  movement_type: "IN" | "OUT" | "ADJUST";
  input_quantity: number;
  supplier_entity_id?: string | null;
  input_unit_cost?: number | null;
  reason?: string | null;
  purchase_reference?: string | null;
  service_order_id?: string | null;
  movement_origin?: "purchase" | "manual" | "initial_balance" | "service_order" | "return";
  notes?: string | null;
};

const SAFE_ITEM_COLUMNS = [
  "id",
  "organization_id",
  "name",
  "sku",
  "description",
  "unit",
  "quantity",
  "min_quantity",
  "is_active",
  "sale_price",
  "conversion_factor",
  "storage_shelf",
  "storage_level",
  "storage_compartment",
  "created_at",
  "updated_at",
].join(",");

const COST_ITEM_COLUMNS = [
  "purchase_price",
  "average_cost",
  "last_supplier_entity_id",
  "last_purchase_at",
  "last_supplier:entities!inventory_items_last_supplier_org_fkey(id,name,legal_name,trade_name,document,person_type,is_active)",
].join(",");

const factorOf = (item: any) => Math.max(1, Number(item?.conversion_factor ?? 1) || 1);
const isBox = (item: any) => String(item?.unit || "un").toLowerCase() === "cx";

async function resolveOrganizationId(organizationIdOverride?: string | null) {
  const normalizedOverride = typeof organizationIdOverride === "string" ? organizationIdOverride.trim() : "";
  return normalizedOverride || await getActiveOrganizationId();
}

function toDisplayItem(item: any) {
  if (!item) return item;
  const factor = factorOf(item);
  const baseQuantity = Number(item.quantity ?? 0);
  const averageCostBase = item.average_cost == null ? null : Number(item.average_cost);
  const display: Record<string, unknown> = {
    ...item,
    conversion_factor: factor,
    base_quantity: baseQuantity,
    stock_value: averageCostBase == null ? null : baseQuantity * averageCostBase,
  };

  if (!isBox(item) || factor === 1) return display;
  return {
    ...display,
    quantity: baseQuantity / factor,
    min_quantity: item.min_quantity == null ? item.min_quantity : Number(item.min_quantity) / factor,
    purchase_price: item.purchase_price == null ? null : Number(item.purchase_price) * factor,
    average_cost: item.average_cost == null ? null : Number(item.average_cost) * factor,
    sale_price: item.sale_price == null ? null : Number(item.sale_price) * factor,
  };
}

function toBaseUpdatePayload(payload: Record<string, unknown>) {
  const unit = String(payload.unit || "un").toLowerCase() === "cx" ? "cx" : "un";
  const factor = unit === "cx" ? Math.max(1, Number(payload.conversion_factor ?? 1) || 1) : 1;
  const base: Record<string, unknown> = {
    name: String(payload.name || "").trim(),
    sku: String(payload.sku || "").trim() || null,
    description: String(payload.description || "").trim() || null,
    unit,
    conversion_factor: factor,
    is_active: payload.is_active !== false,
    storage_shelf: String(payload.storage_shelf || "").trim() || null,
    storage_level: String(payload.storage_level || "").trim() || null,
    storage_compartment: String(payload.storage_compartment || "").trim() || null,
  };
  if (payload.min_quantity != null) base.min_quantity = Number(payload.min_quantity || 0) * factor;
  if (payload.sale_price !== undefined) {
    base.sale_price = payload.sale_price == null || payload.sale_price === "" ? null : Number(payload.sale_price) / factor;
  }
  return base;
}

export async function listInventoryItems(organizationIdOverride?: string | null, includeCosts = false) {
  const organizationId = await resolveOrganizationId(organizationIdOverride);
  const columns = includeCosts ? `${SAFE_ITEM_COLUMNS},${COST_ITEM_COLUMNS}` : SAFE_ITEM_COLUMNS;
  const { data, error } = await supabase
    .from("inventory_items")
    .select(columns)
    .eq("organization_id", organizationId)
    .order("name");
  if (error) throw error;
  return (data ?? []).map(toDisplayItem);
}

export async function createInventoryItem(payload: Record<string, unknown>, organizationIdOverride?: string | null): Promise<string> {
  const organizationId = await resolveOrganizationId(organizationIdOverride);
  const { data, error } = await supabase.rpc("create_inventory_item", {
    p_organization_id: organizationId,
    p_name: String(payload.name || "").trim(),
    p_sku: String(payload.sku || "").trim() || null,
    p_description: String(payload.description || "").trim() || null,
    p_unit: String(payload.unit || "un"),
    p_conversion_factor: Number(payload.conversion_factor || 1),
    p_min_quantity: Number(payload.min_quantity || 0),
    p_sale_price: payload.sale_price == null || payload.sale_price === "" ? null : Number(payload.sale_price),
    p_storage_shelf: String(payload.storage_shelf || "").trim() || null,
    p_storage_level: String(payload.storage_level || "").trim() || null,
    p_storage_compartment: String(payload.storage_compartment || "").trim() || null,
    p_is_active: payload.is_active !== false,
    p_supplier_entity_ids: Array.isArray(payload.supplier_entity_ids) ? payload.supplier_entity_ids : [],
    p_initial_quantity: Number(payload.initial_quantity ?? payload.quantity ?? 0),
    p_initial_supplier_entity_id: String(payload.initial_supplier_entity_id || "") || null,
    p_initial_unit_cost: payload.initial_unit_cost == null || payload.initial_unit_cost === "" ? null : Number(payload.initial_unit_cost),
    p_initial_reference: String(payload.initial_reference || "").trim() || null,
  });
  if (error) throw error;
  if (!data) throw new Error("O item foi criado sem retornar seu identificador.");
  return String(data);
}

export async function saveInventoryItem(payload: Record<string, unknown>, itemId?: string, organizationIdOverride?: string | null): Promise<void> {
  if (!itemId) {
    await createInventoryItem(payload, organizationIdOverride);
    return;
  }
  const organizationId = await resolveOrganizationId(organizationIdOverride);
  const { error } = await supabase
    .from("inventory_items")
    .update(toBaseUpdatePayload(payload))
    .eq("id", itemId)
    .eq("organization_id", organizationId);
  if (error) throw error;
}

export async function setInventoryItemActive(itemId: string, isActive: boolean, organizationIdOverride?: string | null): Promise<void> {
  const organizationId = await resolveOrganizationId(organizationIdOverride);
  const { error } = await supabase
    .from("inventory_items")
    .update({ is_active: isActive })
    .eq("id", itemId)
    .eq("organization_id", organizationId);
  if (error) throw error;
}

export async function listAvailableInventorySuppliers(organizationIdOverride?: string | null): Promise<InventorySupplier[]> {
  const organizationId = await resolveOrganizationId(organizationIdOverride);
  const { data, error } = await supabase
    .from("entities")
    .select("id,name,legal_name,trade_name,document,person_type,is_active,roles:entity_roles!inner(role,is_active)")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .eq("roles.role", "supplier")
    .eq("roles.is_active", true)
    .order("name");
  if (error) throw error;
  return (data || []).map((item: any) => ({
    id: String(item.id),
    name: String(item.name || item.trade_name || item.legal_name || "Fornecedor"),
    legal_name: item.legal_name || null,
    trade_name: item.trade_name || null,
    document: item.document || null,
    person_type: item.person_type === "PJ" ? "PJ" : "PF",
    is_active: item.is_active !== false,
  }));
}

export async function listInventoryItemSuppliers(itemId: string, organizationIdOverride?: string | null): Promise<InventorySupplier[]> {
  const organizationId = await resolveOrganizationId(organizationIdOverride);
  const { data: links, error: linksError } = await supabase
    .from("entity_supplier_items")
    .select("entity_id")
    .eq("organization_id", organizationId)
    .eq("inventory_item_id", itemId);
  if (linksError) throw linksError;
  const ids = (links || []).map((link: any) => String(link.entity_id));
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("entities")
    .select("id,name,legal_name,trade_name,document,person_type,is_active")
    .eq("organization_id", organizationId)
    .in("id", ids)
    .order("name");
  if (error) throw error;
  return (data || []) as InventorySupplier[];
}

export async function syncInventoryItemSuppliers(itemId: string, supplierEntityIds: string[], organizationIdOverride?: string | null): Promise<void> {
  const organizationId = await resolveOrganizationId(organizationIdOverride);
  const { error } = await supabase.rpc("sync_inventory_item_suppliers", {
    p_organization_id: organizationId,
    p_inventory_item_id: itemId,
    p_supplier_entity_ids: Array.from(new Set(supplierEntityIds)),
  });
  if (error) throw error;
}

export async function listInventoryMovements(itemId: string, organizationIdOverride?: string | null, includeCosts = false) {
  const organizationId = await resolveOrganizationId(organizationIdOverride);
  const movementColumns = [
    "id", "inventory_item_id", "service_order_id", "movement_type", "quantity", "reason", "created_by", "created_at",
    "request_item_id", "input_unit", "input_quantity", "conversion_factor_snapshot", "supplier_entity_id", "previous_quantity",
    "resulting_quantity", "purchase_reference", "notes", "movement_origin",
    includeCosts ? "unit_cost,input_unit_cost,total_cost,average_cost_before,average_cost_after" : "",
    "created_by_profile:profiles(full_name)", "service_order:service_orders(os_number)",
    "supplier:entities!inventory_movements_supplier_org_fkey(id,name,legal_name,trade_name,document,person_type,is_active)",
  ].filter(Boolean).join(",");

  const [movementsResult, usedItemsResult, itemResult] = await Promise.all([
    supabase.from("inventory_movements").select(movementColumns).eq("inventory_item_id", itemId).eq("organization_id", organizationId).order("created_at", { ascending: false }),
    supabase.from("service_order_used_items").select("id,inventory_item_id,service_order_id,quantity,created_by,created_at,created_by_profile:profiles(full_name),service_order:service_orders(os_number)").eq("inventory_item_id", itemId).eq("organization_id", organizationId).order("created_at", { ascending: false }),
    supabase.from("inventory_items").select("id,unit,conversion_factor").eq("id", itemId).eq("organization_id", organizationId).maybeSingle(),
  ]);
  if (movementsResult.error) throw movementsResult.error;
  if (usedItemsResult.error) throw usedItemsResult.error;
  if (itemResult.error) throw itemResult.error;

  const factor = factorOf(itemResult.data);
  const physicalMovements = (movementsResult.data ?? []).map((movement: any) => {
    const baseQuantity = Number(movement.quantity || 0);
    const inputUnit = movement.input_unit === "cx" ? "cx" : "un";
    return {
      ...movement,
      movement_type: String(movement.movement_type || "").toLowerCase(),
      quantity: movement.input_quantity != null ? Number(movement.input_quantity) : inputUnit === "cx" ? baseQuantity / factor : baseQuantity,
      display_unit: inputUnit,
      base_quantity: baseQuantity,
    };
  });

  const resolutionUsage = (usedItemsResult.data ?? []).map((item: any) => ({
    id: `resolution-use-${item.id}`,
    inventory_item_id: item.inventory_item_id,
    service_order_id: item.service_order_id,
    movement_type: "use",
    quantity: Number(item.quantity || 0),
    display_unit: "un",
    base_quantity: Number(item.quantity || 0),
    reason: "Uso da peça na resolução da OS (sem nova movimentação de saldo)",
    created_by: item.created_by,
    created_at: item.created_at,
    created_by_profile: item.created_by_profile,
    service_order: item.service_order,
    movement_origin: "service_order",
    is_resolution_usage: true,
  }));

  return [...physicalMovements, ...resolutionUsage].sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

export async function getInventoryItem(itemId: string, organizationIdOverride?: string | null, includeCosts = false) {
  const organizationId = await resolveOrganizationId(organizationIdOverride);
  const columns = includeCosts
    ? "id,name,unit,conversion_factor,quantity,min_quantity,is_active,purchase_price,average_cost,last_supplier_entity_id,last_purchase_at,sale_price,last_supplier:entities!inventory_items_last_supplier_org_fkey(id,name,legal_name,trade_name,document,person_type,is_active)"
    : "id,name,unit,conversion_factor,quantity,min_quantity,is_active,sale_price";
  const { data, error } = await supabase.from("inventory_items").select(columns).eq("id", itemId).eq("organization_id", organizationId).maybeSingle();
  if (error) throw error;
  return toDisplayItem(data);
}

export async function recordInventoryMovement(movement: InventoryMovementInput, organizationIdOverride?: string | null): Promise<string> {
  const organizationId = await resolveOrganizationId(organizationIdOverride);
  const { data, error } = await supabase.rpc("record_inventory_movement", {
    p_organization_id: organizationId,
    p_inventory_item_id: movement.inventory_item_id,
    p_movement_type: movement.movement_type,
    p_input_quantity: movement.input_quantity,
    p_supplier_entity_id: movement.supplier_entity_id || null,
    p_input_unit_cost: movement.input_unit_cost ?? null,
    p_reason: movement.reason?.trim() || null,
    p_purchase_reference: movement.purchase_reference?.trim() || null,
    p_service_order_id: movement.service_order_id || null,
    p_movement_origin: movement.movement_origin || "manual",
    p_notes: movement.notes?.trim() || null,
  });
  if (error) throw error;
  return String(data);
}
