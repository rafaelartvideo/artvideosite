import { supabase } from "@/lib/supabase";

export type PdvSettings = {
  organization_id: string;
  default_cash_account_id: string | null;
  require_open_cash: boolean;
  allow_sale_without_customer: boolean;
  allow_negative_stock: boolean;
};

export type PdvCashAccount = {
  id: string;
  name: string;
  balance: number;
  allows_cash_session: boolean;
};

export type PdvCashSession = {
  id: string;
  status: "open";
  opening_expected_amount: number;
  opening_counted_amount: number;
  opening_difference: number;
  opening_note: string | null;
  opened_at: string;
  opened_by: string | null;
};

export type PdvPaymentMethod = {
  id: string;
  name: string;
  method_type: "cash" | "pix" | "debit_card" | "credit_card" | "boleto" | "transfer" | "other" | string;
  percentage_fee: number;
  fixed_fee: number;
  settlement_days: number;
  creates_future_settlement: boolean;
  financial_account_id: string | null;
  financial_account_name: string | null;
  available_for_pdv: boolean;
};

export type PdvBootstrap = {
  configured: boolean;
  cash_session_enabled: boolean;
  settings: PdvSettings | null;
  cash_accounts: PdvCashAccount[];
  cash_account: Pick<PdvCashAccount, "id" | "name" | "balance"> | null;
  open_session: PdvCashSession | null;
  payment_methods: PdvPaymentMethod[];
  readiness: {
    active_products: number;
    active_payment_methods: number;
    ready_payment_methods: number;
  };
};

export type PdvProduct = {
  product_id: string;
  inventory_item_id: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number | null;
  cover_media_id: string | null;
  quantity: number;
  min_quantity: number;
  unit: "un" | "cx" | string;
  conversion_factor: number;
};

export type PdvCustomer = {
  id: string;
  name: string;
  document: string | null;
  whatsapp: string | null;
  phone: string | null;
};

export type PdvSaleResult = {
  id: string;
  sale_number: number;
  subtotal: number;
  discount_amount: number;
  surcharge_amount: number;
  total_amount: number;
  change_amount: number;
  customer_name: string | null;
  customer_document: string | null;
  sold_at: string;
  financial_entry_id?: string | null;
  idempotent_replay?: boolean;
};

export type PdvSaleListItem = {
  id: string;
  sale_number: number;
  status: "completed" | "cancelled";
  customer_name: string | null;
  customer_document: string | null;
  total_amount: number;
  change_amount: number;
  sold_at: string;
  sold_by_name: string | null;
  cancelled_at: string | null;
  cancelled_by_name: string | null;
  cancellation_reason: string | null;
  payment_methods: string[];
};

export type PdvSalePage = {
  items: PdvSaleListItem[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type PdvSaleDetail = PdvSaleResult & {
  status: "completed" | "cancelled";
  customer_id: string | null;
  notes: string | null;
  sold_by_name: string | null;
  cancelled_at: string | null;
  cancelled_by_name: string | null;
  cancellation_reason: string | null;
  items: Array<{
    id: string;
    product_id: string;
    product_name: string;
    sku: string | null;
    barcode: string | null;
    quantity: number;
    unit: string;
    unit_price: number;
    line_subtotal: number;
  }>;
  payments: Array<{
    id: string;
    payment_method_id: string;
    payment_method_name: string;
    method_type: string;
    financial_account_name: string;
    amount: number;
    tendered_amount: number | null;
    change_amount: number;
    fee_amount: number;
    settlement_status: "scheduled" | "posted" | "reversed" | string;
  }>;
};

export type FinalizePdvSaleInput = {
  idempotencyKey: string;
  customerId?: string | null;
  discountAmount?: number;
  surchargeAmount?: number;
  note?: string | null;
  items: Array<{ productId: string; quantity: number }>;
  payments: Array<{ paymentMethodId: string; amount: number; tenderedAmount?: number | null }>;
};

function requiredOrganizationId(value: string) {
  const organizationId = String(value || "").trim();
  if (!organizationId) throw new Error("Empresa ativa não encontrada.");
  return organizationId;
}

export async function loadPdvBootstrap(organizationId: string): Promise<PdvBootstrap> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("get_pdv_bootstrap_v1", {
    p_organization_id: org,
  });
  if (error) throw error;
  return data as PdvBootstrap;
}

export async function configurePdvQuickSetup(organizationId: string): Promise<PdvBootstrap> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("configure_pdv_quick_setup", {
    p_organization_id: org,
  });
  if (error) throw error;
  return data as PdvBootstrap;
}

export async function savePdvSettings(
  organizationId: string,
  input: Omit<PdvSettings, "organization_id">,
  userId?: string | null,
): Promise<PdvSettings> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase
    .from("pdv_settings")
    .update({
      default_cash_account_id: input.default_cash_account_id,
      require_open_cash: input.require_open_cash,
      allow_sale_without_customer: input.allow_sale_without_customer,
      allow_negative_stock: input.allow_negative_stock,
      updated_by: userId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", org)
    .select("organization_id,default_cash_account_id,require_open_cash,allow_sale_without_customer,allow_negative_stock")
    .single();
  if (error) throw error;
  return data as PdvSettings;
}

export async function searchPdvProducts(
  organizationId: string,
  search = "",
  limit = 30,
): Promise<PdvProduct[]> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("search_pdv_products_v1", {
    p_organization_id: org,
    p_search: search,
    p_limit: limit,
  });
  if (error) throw error;
  return (data || []) as PdvProduct[];
}


export async function searchPdvCustomers(
  organizationId: string,
  search = "",
  limit = 20,
): Promise<PdvCustomer[]> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("search_pdv_customers_v1", {
    p_organization_id: org,
    p_search: search,
    p_limit: limit,
  });
  if (error) throw error;
  return (data || []) as PdvCustomer[];
}

export async function finalizePdvSale(
  organizationId: string,
  input: FinalizePdvSaleInput,
): Promise<PdvSaleResult> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("finalize_pdv_sale_v1", {
    p_organization_id: org,
    p_idempotency_key: input.idempotencyKey,
    p_payload: {
      customer_id: input.customerId || null,
      discount_amount: Number(input.discountAmount || 0),
      surcharge_amount: Number(input.surchargeAmount || 0),
      note: String(input.note || "").trim() || null,
      items: input.items.map(item => ({
        product_id: item.productId,
        quantity: Number(item.quantity),
      })),
      payments: input.payments.map(payment => ({
        payment_method_id: payment.paymentMethodId,
        amount: Number(payment.amount),
        tendered_amount: payment.tenderedAmount == null ? null : Number(payment.tenderedAmount),
      })),
    },
  });
  if (error) throw error;
  return data as PdvSaleResult;
}


export async function loadPdvSalesPage(
  organizationId: string,
  options: { page?: number; pageSize?: number; search?: string; status?: "" | "completed" | "cancelled" } = {},
): Promise<PdvSalePage> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("get_pdv_sales_page_v1", {
    p_organization_id: org,
    p_page: options.page || 1,
    p_page_size: options.pageSize || 20,
    p_search: options.search || "",
    p_status: options.status || null,
  });
  if (error) throw error;
  return data as PdvSalePage;
}

export async function loadPdvSaleDetail(
  organizationId: string,
  saleId: string,
): Promise<PdvSaleDetail> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("get_pdv_sale_detail_v1", {
    p_organization_id: org,
    p_sale_id: saleId,
  });
  if (error) throw error;
  return data as PdvSaleDetail;
}

export async function cancelPdvSale(
  organizationId: string,
  saleId: string,
  reason: string,
): Promise<{ id: string; sale_number: number; status: "cancelled"; cancelled_at: string; reason: string }> {
  const org = requiredOrganizationId(organizationId);
  const normalizedReason = String(reason || "").trim();
  if (!normalizedReason) throw new Error("Informe o motivo do cancelamento.");
  const { data, error } = await supabase.rpc("cancel_pdv_sale_v1", {
    p_organization_id: org,
    p_sale_id: saleId,
    p_reason: normalizedReason,
  });
  if (error) throw error;
  return data as { id: string; sale_number: number; status: "cancelled"; cancelled_at: string; reason: string };
}
