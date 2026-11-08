import { supabase } from "@/lib/supabase";

export type SalesOrderStatus = "confirmed" | "cancelled";
export type SalesOrderPaymentStatus = "pending" | "partial" | "paid" | "cancelled";
export type SalesOrderFulfillmentStatus = "pending" | "separating" | "ready" | "delivered";

export type SalesOrderListRow = {
  id: string;
  order_number: number;
  created_at: string;
  updated_at: string;
  status: SalesOrderStatus;
  payment_status: SalesOrderPaymentStatus;
  fulfillment_status: SalesOrderFulfillmentStatus;
  customer_name_snapshot: string | null;
  customer_document_snapshot: string | null;
  seller_name: string;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  received_amount: number;
  open_amount: number;
  due_date: string | null;
  financial_entry_id: string | null;
};

export type SalesOrderPage = {
  total: number;
  pending: number;
  paid: number;
  gross_total: number;
  open_total: number;
  page: number;
  page_size: number;
  items: SalesOrderListRow[];
};

export type SalesOrderFilters = {
  search?: string;
  status?: "all" | SalesOrderStatus;
  payment?: "all" | SalesOrderPaymentStatus;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export type SalesOrderItem = {
  id: string;
  product_id: string;
  inventory_item_id: string;
  name: string;
  sku: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
  base_quantity: number;
};

export type SalesOrderHistoryEvent = {
  id: string;
  type: "created" | "fulfillment_changed" | "cancelled";
  data: Record<string, unknown>;
  at: string;
  by: string;
};

export type SalesOrderSettlement = {
  id: string;
  method: string;
  amount: number;
  status: "scheduled" | "posted" | "reversed";
  at: string;
  reversed_at: string | null;
};

export type SalesOrderInstallment = {
  id: string;
  number: number;
  total_installments: number;
  amount: number;
  settled_amount: number;
  due_date: string;
  status: "pending" | "partial" | "paid" | "overdue" | "cancelled";
};

export type SalesOrderDetail = {
  id: string;
  order_number: number;
  status: SalesOrderStatus;
  fulfillment_status: SalesOrderFulfillmentStatus;
  payment_status: SalesOrderPaymentStatus;
  created_at: string;
  updated_at: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_document: string | null;
  seller_name: string;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  received_amount: number;
  open_amount: number;
  financial_entry_id: string;
  financial_entry_status: string;
  due_date: string | null;
  notes: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  fulfilled_at: string | null;
  items: SalesOrderItem[];
  events: SalesOrderHistoryEvent[];
  settlements: SalesOrderSettlement[];
  installments: SalesOrderInstallment[];
};

function requireOrg(value: string) {
  if (!value) throw new Error("Selecione uma empresa.");
  return value;
}

/** Listagem paginada no servidor; pagamento derivado das baixas do Financeiro. */
export async function listSalesOrders(organizationId: string, filters: SalesOrderFilters): Promise<SalesOrderPage> {
  const { data, error } = await supabase.rpc("list_sales_orders_v1", {
    p_organization_id: requireOrg(organizationId),
    p_search: (filters.search || "").trim(),
    p_status: filters.status || "all",
    p_payment: filters.payment || "all",
    p_from: filters.from || null,
    p_to: filters.to || null,
    p_page: filters.page || 1,
    p_page_size: filters.pageSize || 15,
  });
  if (error) throw error;
  const result = data as SalesOrderPage | null;
  return {
    total: Number(result?.total || 0),
    pending: Number(result?.pending || 0),
    paid: Number(result?.paid || 0),
    gross_total: Number(result?.gross_total || 0),
    open_total: Number(result?.open_total || 0),
    page: Number(result?.page || 1),
    page_size: Number(result?.page_size || 15),
    items: Array.isArray(result?.items) ? result.items : [],
  };
}

export async function getSalesOrderDetail(organizationId: string, orderId: string): Promise<SalesOrderDetail> {
  const { data, error } = await supabase.rpc("get_sales_order_detail_v1", {
    p_organization_id: requireOrg(organizationId),
    p_order_id: orderId,
  });
  if (error) throw error;
  return data as SalesOrderDetail;
}

export async function updateSalesOrderFulfillment(
  organizationId: string, orderId: string, status: Exclude<SalesOrderFulfillmentStatus, "pending">,
): Promise<void> {
  const { error } = await supabase.rpc("update_sales_order_fulfillment_v1", {
    p_organization_id: requireOrg(organizationId), p_order_id: orderId, p_next_status: status,
  });
  if (error) throw error;
}

export async function cancelSalesOrder(
  organizationId: string, orderId: string, reason: string,
): Promise<void> {
  const { error } = await supabase.rpc("cancel_sales_order_v1", {
    p_organization_id: requireOrg(organizationId), p_order_id: orderId, p_reason: reason.trim(),
  });
  if (error) throw error;
}
