import { supabase } from "@/lib/supabase";

export type OrderQuoteItem = {
  item_type: "product" | "service" | "custom_service";
  inventory_item_id: string | null;
  general_service_id: string | null;
  title_snapshot: string;
  description_snapshot: string;
  quantity: number;
  unit_price: number;
  additional_cost: number;
  /** Price fixed by the current service or product catalog when added. */
  catalog_price_fixed?: boolean;
};
export type OrderQuoteProposal = {
  id: string;
  status: "draft" | "awaiting_approval" | "approved" | "rejected" | "renegotiation";
  version: number;
  diagnosis: string;
  proposed_solution: string;
  commercial_conditions: string;
  valid_until: string | null;
  items: OrderQuoteItem[];
  discount_type: "amount" | "percentage";
  discount_value: number;
  versions: Array<Record<string, any>>;
  rejection_reason: string | null;
  approved_at: string | null;
  updated_at: string;
};

export type OrderQuoteDraft = Pick<OrderQuoteProposal,
  "diagnosis" | "proposed_solution" | "commercial_conditions" | "valid_until" | "items" | "discount_type" | "discount_value">;

export function emptyOrderQuoteDraft(): OrderQuoteDraft {
  return {
    diagnosis: "", proposed_solution: "", commercial_conditions: "", valid_until: null,
    items: [], discount_type: "amount", discount_value: 0,
  };
}
export async function readOrderQuote(organizationId: string, serviceOrderId: string): Promise<OrderQuoteProposal | null> {
  const started = Date.now();
  try {
    const { data, error } = await supabase.from("service_order_quote_proposals")
      .select("id,status,version,diagnosis,proposed_solution,commercial_conditions,valid_until,items,discount_type,discount_value,versions,rejection_reason,approved_at,updated_at")
      .eq("organization_id",organizationId).eq("service_order_id",serviceOrderId).maybeSingle();
    if (error) throw error;
    return data ? data as OrderQuoteProposal : null;
  } finally {
    const elapsed = Date.now() - started;
    if (elapsed >= 3000) console.warn("[PERF][OS] Consulta do orçamento lenta", { duration_ms: elapsed });
  }
}
export async function changeOrderQuote(
  organizationId: string, serviceOrderId: string,
  action: "save" | "submit" | "approve" | "reject" | "renegotiate",
  payload: Record<string,unknown> = {},
): Promise<OrderQuoteProposal> {
  const { data, error } = await supabase.rpc("manage_service_order_quote_v1", {
    p_organization_id: organizationId, p_order_id: serviceOrderId,
    p_action: action, p_payload: payload,
  });
  if (error) throw error;
  return data as OrderQuoteProposal;
}
export async function listOrderQuoteComments(organizationId: string, orderId: string) {
  const { data,error } = await supabase.from("service_order_quote_comments")
    .select("id,author_id,body,created_at,author:profiles!service_order_quote_comments_author_id_fkey(full_name)")
    .eq("organization_id",organizationId).eq("service_order_id",orderId)
    .order("created_at",{ascending:false}).limit(100);
  if (error) throw error;
  return data || [];
}
export async function addOrderQuoteComment(organizationId: string, orderId: string, authorId: string, body: string) {
  const {error} = await supabase.from("service_order_quote_comments")
    .insert({ organization_id:organizationId,service_order_id:orderId,author_id:authorId,body:body.trim() });
  if(error) throw error;
}

export async function readOrderPricingAfterApproval(organizationId: string, orderId: string) {
  const {data,error}=await supabase.from("service_orders")
    .select("service_price,parts_total,subtotal,discount_type,discount_percentage,discount_amount,final_total,commercial_pricing_enabled")
    .eq("organization_id",organizationId).eq("id",orderId).single();
  if(error) throw error;
  return data;
}
