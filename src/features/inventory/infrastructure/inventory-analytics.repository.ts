import { supabase } from "@/lib/supabase";

export type InventoryPurchaseAnalyticsRow = {
  id: string;
  created_at: string;
  total_cost: number | null;
  supplier_entity_id: string | null;
  supplier: {
    id: string;
    name: string;
    legal_name: string | null;
    trade_name: string | null;
  } | Array<{
    id: string;
    name: string;
    legal_name: string | null;
    trade_name: string | null;
  }> | null;
};

export async function listInventoryPurchaseAnalytics(
  organizationId: string,
  days: number,
): Promise<InventoryPurchaseAnalyticsRow[]> {
  const safeDays = Math.min(365, Math.max(1, Math.trunc(days || 30)));
  const start = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("inventory_movements")
    .select("id,created_at,total_cost,supplier_entity_id,supplier:entities!inventory_movements_supplier_org_fkey(id,name,legal_name,trade_name)")
    .eq("organization_id", organizationId)
    .eq("movement_type", "IN")
    .eq("movement_origin", "purchase")
    .gte("created_at", start)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as InventoryPurchaseAnalyticsRow[];
}
