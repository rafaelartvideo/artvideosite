import { getActiveOrganizationId } from "@/lib/active-organization";
import { supabase } from "@/lib/supabase";

const factorOf = (item: any) => Math.max(1, Number(item?.conversion_factor ?? 1) || 1);
const isBox = (item: any) => String(item?.unit || "un").toLowerCase() === "cx";

async function resolveOrganizationId(organizationIdOverride?: string | null) {
  const normalizedOverride = typeof organizationIdOverride === "string"
    ? organizationIdOverride.trim()
    : "";

  return normalizedOverride || await getActiveOrganizationId();
}

function toDisplayItem(item: any) {
  if (!item) return item;
  const factor = factorOf(item);
  if (!isBox(item) || factor === 1) return { ...item, conversion_factor: factor };
  return {
    ...item,
    conversion_factor: factor,
    quantity: Number(item.quantity ?? 0) / factor,
    min_quantity: item.min_quantity == null ? item.min_quantity : Number(item.min_quantity) / factor,
    purchase_price: item.purchase_price == null ? null : Number(item.purchase_price) * factor,
    sale_price: item.sale_price == null ? null : Number(item.sale_price) * factor,
  };
}

function toBasePayload(payload: Record<string, unknown>) {
  const unit = String(payload.unit || "un").toLowerCase() === "cx" ? "cx" : "un";
  const factor = unit === "cx" ? Math.max(1, Number(payload.conversion_factor ?? 1) || 1) : 1;
  const base: Record<string, unknown> = { ...payload, unit, conversion_factor: factor };

  if (payload.quantity != null) base.quantity = Number(payload.quantity || 0) * factor;
  if (payload.min_quantity != null) base.min_quantity = Number(payload.min_quantity || 0) * factor;
  if (payload.purchase_price != null) base.purchase_price = Number(payload.purchase_price) / factor;
  if (payload.sale_price != null) base.sale_price = Number(payload.sale_price) / factor;

  return base;
}

export async function listInventoryItems(organizationIdOverride?: string | null) {
  const organizationId = await resolveOrganizationId(organizationIdOverride);
  const { data, error } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name");

  if (error) throw error;
  return (data ?? []).map(toDisplayItem);
}

export async function saveInventoryItem(
  payload: Record<string, unknown>,
  itemId?: string,
  organizationIdOverride?: string | null,
): Promise<void> {
  const organizationId = await resolveOrganizationId(organizationIdOverride);
  const basePayload = toBasePayload(payload);
  const { error } = itemId
    ? await supabase
        .from("inventory_items")
        .update(basePayload)
        .eq("id", itemId)
        .eq("organization_id", organizationId)
    : await supabase
        .from("inventory_items")
        .insert({ ...basePayload, organization_id: organizationId });

  if (error) throw error;
}

export async function setInventoryItemActive(
  itemId: string,
  isActive: boolean,
  organizationIdOverride?: string | null,
): Promise<void> {
  const organizationId = await resolveOrganizationId(organizationIdOverride);
  const { error } = await supabase
    .from("inventory_items")
    .update({ is_active: isActive })
    .eq("id", itemId)
    .eq("organization_id", organizationId);

  if (error) throw error;
}

export async function deleteInventoryItem(itemId: string, organizationIdOverride?: string | null): Promise<void> {
  const organizationId = await resolveOrganizationId(organizationIdOverride);
  const { error } = await supabase
    .from("inventory_items")
    .delete()
    .eq("id", itemId)
    .eq("organization_id", organizationId);

  if (error) throw error;
}

export async function listInventoryMovements(itemId: string, organizationIdOverride?: string | null) {
  const organizationId = await resolveOrganizationId(organizationIdOverride);
  const [movementsResult, usedItemsResult, itemResult] = await Promise.all([
    supabase
      .from("inventory_movements")
      .select("*, created_by_profile:profiles(full_name), service_order:service_orders(os_number)")
      .eq("inventory_item_id", itemId)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("service_order_used_items")
      .select("id,inventory_item_id,service_order_id,quantity,created_by,created_at,created_by_profile:profiles(full_name),service_order:service_orders(os_number)")
      .eq("inventory_item_id", itemId)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("inventory_items")
      .select("id,unit,conversion_factor")
      .eq("id", itemId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  if (movementsResult.error) throw movementsResult.error;
  if (usedItemsResult.error) throw usedItemsResult.error;
  if (itemResult.error) throw itemResult.error;

  const factor = factorOf(itemResult.data);

  const physicalMovements = (movementsResult.data ?? []).map((movement: any) => {
    const baseQuantity = Number(movement.quantity || 0);
    const inputUnit = movement.input_unit === "cx" ? "cx" : "un";
    const displayQuantity = movement.input_quantity != null
      ? Number(movement.input_quantity)
      : inputUnit === "cx" ? baseQuantity / factor : baseQuantity;
    return {
      ...movement,
      movement_type: String(movement.movement_type || "").toLowerCase(),
      quantity: displayQuantity,
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
    is_resolution_usage: true,
  }));

  return [...physicalMovements, ...resolutionUsage].sort((a: any, b: any) =>
    new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
  );
}

export async function getInventoryItem(itemId: string, organizationIdOverride?: string | null) {
  const organizationId = await resolveOrganizationId(organizationIdOverride);
  const { data, error } = await supabase
    .from("inventory_items")
    .select("id,name,unit,conversion_factor,quantity,is_active")
    .eq("id", itemId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  return toDisplayItem(data);
}

export async function recordInventoryMovement(
  movement: Record<string, unknown>,
  itemId: string,
  nextQuantity: number,
  organizationIdOverride?: string | null,
): Promise<void> {
  const organizationId = await resolveOrganizationId(organizationIdOverride);
  const { data: item, error: itemLoadError } = await supabase
    .from("inventory_items")
    .select("id,unit,conversion_factor")
    .eq("id", itemId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (itemLoadError) throw itemLoadError;
  if (!item) throw new Error("Item do estoque não encontrado nesta empresa.");

  const factor = factorOf(item);
  const inputQuantity = Number(movement.quantity || 0);
  const baseQuantity = isBox(item) ? inputQuantity * factor : inputQuantity;
  const baseNextQuantity = isBox(item) ? Number(nextQuantity) * factor : Number(nextQuantity);
  const movementPayload = {
    ...movement,
    organization_id: organizationId,
    quantity: baseQuantity,
    input_unit: isBox(item) ? "cx" : "un",
    input_quantity: inputQuantity,
    conversion_factor_snapshot: factor,
  };

  const { error: movementError } = await supabase
    .from("inventory_movements")
    .insert(movementPayload);

  if (movementError) throw movementError;

  const { error: itemError } = await supabase
    .from("inventory_items")
    .update({ quantity: baseNextQuantity })
    .eq("id", itemId)
    .eq("organization_id", organizationId);

  if (itemError) throw itemError;
}
