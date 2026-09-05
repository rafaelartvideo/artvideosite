export type PartRequestInventoryItem = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  conversion_factor: number;
  quantity: number;
  is_active: boolean;
};

export type SelectedPartRequestItem = {
  inventory_item_id: string;
  name: string;
  sku: string | null;
  package_unit: string;
  conversion_factor: number;
  available_quantity: number;
  quantity: string;
};

export type ReviewPartRequestItem = {
  id: string;
  inventory_item_id: string;
  quantity: number;
  approved_quantity: number | null;
  source_test_item_id?: string | null;
  delivered_quantity?: number;
  delivered_at?: string | null;
  delivered_by?: string | null;
  technician_received_quantity?: number;
  technician_received_at?: string | null;
  technician_received_by?: string | null;
  return_pending_quantity?: number;
  return_registered_at?: string | null;
  return_registered_by?: string | null;
  returned_quantity?: number;
  return_received_at?: string | null;
  return_received_by?: string | null;
  damaged_quantity?: number;
  request_status?: string;
  inventory_item?: {
    id: string;
    name: string;
    sku: string | null;
    unit: string | null;
    conversion_factor: number;
    quantity: number;
  } | null;
};

export type PartRequestItemForReview = ReviewPartRequestItem;

export type PartRequestForReview = {
  id: string;
  service_order_id: string;
  purpose?: "TEST" | "RESOLUTION" | null;
  status: string;
  notes: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  created_at: string;
  requester?: { full_name: string | null } | null;
  requested_by_profile?: { full_name: string | null } | null;
  reviewed_by_profile?: { full_name: string | null } | null;
  service_order?: { is_solved?: boolean | null; completed_at?: string | null } | null;
  items: PartRequestItemForReview[];
};

export type TestResultRow = {
  id: string;
  requestItemId: string;
  action: "USE_IN_RESOLUTION" | "DAMAGED";
  quantity: string;
  notes: string;
};

export type CustodyAction = "DISPATCH" | "CONFIRM_DELIVERY" | "REGISTER_RETURN" | "RECEIVE_RETURN";
