import { supabase } from "@/lib/supabase";

export async function listInventoryItems() {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("*")
    .order("name");

  if (error) throw error;
  return data ?? [];
}

export async function saveInventoryItem(
  payload: Record<string, unknown>,
  itemId?: string,
): Promise<void> {
  const { error } = itemId
    ? await supabase.from("inventory_items").update(payload).eq("id", itemId)
    : await supabase.from("inventory_items").insert(payload);

  if (error) throw error;
}

export async function setInventoryItemActive(
  itemId: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("inventory_items")
    .update({ is_active: isActive })
    .eq("id", itemId);

  if (error) throw error;
}

export async function deleteInventoryItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .from("inventory_items")
    .delete()
    .eq("id", itemId);

  if (error) throw error;
}

export async function listInventoryMovements(itemId: string) {
  const [movementsResult, usedItemsResult] = await Promise.all([
    supabase
      .from("inventory_movements")
      .select("*, created_by_profile:profiles(full_name), service_order:service_orders(os_number)")
      .eq("inventory_item_id", itemId)
      .order("created_at", { ascending: false }),
    supabase
      .from("service_order_used_items")
      .select("id,inventory_item_id,service_order_id,quantity,created_by,created_at,created_by_profile:profiles(full_name),service_order:service_orders(os_number)")
      .eq("inventory_item_id", itemId)
      .order("created_at", { ascending: false }),
  ]);

  if (movementsResult.error) throw movementsResult.error;
  if (usedItemsResult.error) throw usedItemsResult.error;

  const physicalMovements = (movementsResult.data ?? []).map((movement: any) => ({
    ...movement,
    movement_type: String(movement.movement_type || "").toLowerCase(),
  }));
  const resolutionUsage = (usedItemsResult.data ?? []).map((item: any) => ({
    id: `resolution-use-${item.id}`,
    inventory_item_id: item.inventory_item_id,
    service_order_id: item.service_order_id,
    movement_type: "use",
    quantity: item.quantity,
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

export async function getInventoryItem(itemId: string) {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("id,name,quantity,is_active")
    .eq("id", itemId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function recordInventoryMovement(
  movement: Record<string, unknown>,
  itemId: string,
  nextQuantity: number,
): Promise<void> {
  const { error: movementError } = await supabase
    .from("inventory_movements")
    .insert(movement);

  if (movementError) throw movementError;

  const { error: itemError } = await supabase
    .from("inventory_items")
    .update({ quantity: nextQuantity })
    .eq("id", itemId);

  if (itemError) throw itemError;
}
