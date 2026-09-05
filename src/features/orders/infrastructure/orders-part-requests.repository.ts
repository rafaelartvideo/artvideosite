import { supabase } from "@/lib/supabase";

type PartRequestItemInput = {
  inventory_item_id: string;
  quantity: number;
};

type PartReviewItemInput = {
  request_item_id: string;
  approved_quantity: number;
};

type TestResultActionInput = {
  request_item_id: string;
  action: "USE_IN_RESOLUTION" | "DAMAGED";
  quantity: number;
  notes: string | null;
};

type PartReturnItemInput = {
  request_item_id: string;
  quantity: number;
};

export const requestServiceOrderParts = ({
  serviceOrderId,
  items,
  notes,
  purpose,
}: {
  serviceOrderId: string;
  items: PartRequestItemInput[];
  notes: string | null;
  purpose: "RESOLUTION" | "TEST";
}) =>
  supabase.rpc("request_service_order_parts", {
    p_service_order_id: serviceOrderId,
    p_items: items,
    p_notes: notes,
    p_purpose: purpose,
  });

export const reviewServiceOrderPartRequest = ({
  requestId,
  decision,
  items,
  reviewNotes,
}: {
  requestId: string;
  decision: "APPROVED" | "REJECTED";
  items: PartReviewItemInput[];
  reviewNotes: string | null;
}) =>
  supabase.rpc("review_service_order_part_request", {
    p_request_id: requestId,
    p_decision: decision,
    p_items: items,
    p_review_notes: reviewNotes,
  });

export const dispatchServiceOrderPartRequest = (requestId: string) =>
  supabase.rpc("dispatch_service_order_part_request", {
    p_request_id: requestId,
  });

export const confirmServiceOrderPartDelivery = (requestId: string) =>
  supabase.rpc("confirm_service_order_part_delivery", {
    p_request_id: requestId,
  });

export const registerServiceOrderPartReturn = ({
  requestId,
  items,
  notes,
}: {
  requestId: string;
  items: PartReturnItemInput[];
  notes: string | null;
}) =>
  supabase.rpc("register_service_order_part_return", {
    p_request_id: requestId,
    p_items: items,
    p_notes: notes,
  });

export const receiveServiceOrderPartReturn = (requestId: string) =>
  supabase.rpc("receive_service_order_part_return", {
    p_request_id: requestId,
  });

// Compatibilidade: a função antiga no banco encaminha para a saída de estoque.
export const deliverServiceOrderTestRequest = dispatchServiceOrderPartRequest;

export const recordServiceOrderTestResults = ({
  requestId,
  actions,
}: {
  requestId: string;
  actions: TestResultActionInput[];
}) =>
  supabase.rpc("record_service_order_test_results", {
    p_request_id: requestId,
    p_actions: actions,
  });

export async function listActivePartInventory() {
  const result = await supabase
    .from("inventory_items")
    .select("id,name,sku,unit,conversion_factor,quantity,is_active")
    .eq("is_active", true)
    .order("name");

  if (result.error) return result;

  return {
    ...result,
    data: (result.data || []).map((item: any) => ({
      ...item,
      package_unit: item.unit || "un",
      unit: "un" as const,
      conversion_factor: Math.max(1, Number(item.conversion_factor ?? 1) || 1),
      quantity: Number(item.quantity ?? 0),
    })),
  };
}

export async function listServiceOrderPartRequests(serviceOrderId: string) {
  const result = await supabase
    .from("service_order_part_requests")
    .select("id,service_order_id,requested_by,purpose,status,notes,reviewed_by,reviewed_at,review_notes,created_at,service_order:service_orders!service_order_id(is_solved,completed_at),requested_by_profile:profiles!requested_by(full_name),reviewed_by_profile:profiles!reviewed_by(full_name),items:service_order_part_request_items(id,inventory_item_id,quantity,approved_quantity,source_test_item_id,delivered_quantity,delivered_at,delivered_by,technician_received_quantity,technician_received_at,technician_received_by,return_pending_quantity,return_registered_at,return_registered_by,returned_quantity,return_received_at,return_received_by,damaged_quantity,inventory_item:inventory_items(id,name,sku,unit,conversion_factor,quantity))")
    .eq("service_order_id", serviceOrderId)
    .order("created_at", { ascending: false });

  if (result.error) return result;

  return {
    ...result,
    data: (result.data || []).map((request: any) => ({
      ...request,
      items: (request.items || []).map((item: any) => ({
        ...item,
        inventory_item: item.inventory_item ? {
          ...item.inventory_item,
          package_unit: item.inventory_item.unit || "un",
          unit: "un" as const,
          conversion_factor: Math.max(1, Number(item.inventory_item.conversion_factor ?? 1) || 1),
          quantity: Number(item.inventory_item.quantity ?? 0),
        } : null,
      })),
    })),
  };
}
