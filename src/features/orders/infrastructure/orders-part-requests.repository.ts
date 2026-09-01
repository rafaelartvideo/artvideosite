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
  action: "RETURN" | "USE_IN_RESOLUTION" | "DAMAGED";
  quantity: number;
  notes: string | null;
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

export const deliverServiceOrderTestRequest = (requestId: string) =>
  supabase.rpc("deliver_service_order_test_request", {
    p_request_id: requestId,
  });

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

export const listActivePartInventory = () =>
  supabase
    .from("inventory_items")
    .select("id,name,sku,unit,quantity,is_active")
    .eq("is_active", true)
    .order("name");

export const listServiceOrderPartRequests = (serviceOrderId: string) =>
  supabase
    .from("service_order_part_requests")
    .select("id,service_order_id,requested_by,purpose,status,notes,reviewed_by,reviewed_at,review_notes,created_at,requested_by_profile:profiles!requested_by(full_name),reviewed_by_profile:profiles!reviewed_by(full_name),items:service_order_part_request_items(id,inventory_item_id,quantity,approved_quantity,source_test_item_id,delivered_quantity,delivered_at,delivered_by,returned_quantity,damaged_quantity,inventory_item:inventory_items(id,name,sku,unit,quantity))")
    .eq("service_order_id", serviceOrderId)
    .order("created_at", { ascending: false });
