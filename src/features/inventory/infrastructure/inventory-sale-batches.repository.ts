import { supabase } from "@/lib/supabase";

export type InventorySaleBatch = {
  id: string;
  inventory_item_id: string;
  received_at: string;
  sell_by_at: string | null;
  sale_window_days: number | null;
  initial_quantity: number;
  remaining_quantity: number;
};

export type InventorySaleSummary = {
  inventory_item_id: string;
  tracked_quantity: number;
  untracked_quantity: number;
  warning_quantity: number;
  overdue_quantity: number;
  next_deadline: string | null;
  active_batch_count: number;
};

export async function listInventorySaleSummaries(organizationId: string): Promise<InventorySaleSummary[]> {
  const { data, error } = await supabase.rpc("get_inventory_sale_batch_summaries_v1", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(row => ({
    inventory_item_id: String(row.inventory_item_id),
    tracked_quantity: Number(row.tracked_quantity || 0),
    untracked_quantity: Number(row.untracked_quantity || 0),
    warning_quantity: Number(row.warning_quantity || 0),
    overdue_quantity: Number(row.overdue_quantity || 0),
    next_deadline: row.next_deadline ? String(row.next_deadline) : null,
    active_batch_count: Number(row.active_batch_count || 0),
  }));
}

export async function listInventorySaleBatches(organizationId: string, itemId: string): Promise<InventorySaleBatch[]> {
  const { data, error } = await supabase.from("inventory_sale_batches")
    .select("id,inventory_item_id,received_at,sell_by_at,sale_window_days,initial_quantity,remaining_quantity")
    .eq("organization_id", organizationId)
    .eq("inventory_item_id", itemId)
    .gt("remaining_quantity", 0)
    .order("received_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(row => ({
    id: String(row.id), inventory_item_id: String(row.inventory_item_id),
    received_at: String(row.received_at), sell_by_at: row.sell_by_at ? String(row.sell_by_at) : null,
    sale_window_days: row.sale_window_days == null ? null : Number(row.sale_window_days),
    initial_quantity: Number(row.initial_quantity || 0),
    remaining_quantity: Number(row.remaining_quantity || 0),
  }));
}
