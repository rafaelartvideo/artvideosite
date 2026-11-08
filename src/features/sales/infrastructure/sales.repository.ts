import { supabase } from "@/lib/supabase";
import type { PdvProduct, PdvCustomer, PdvRelatedProduct } from "@/features/pdv/infrastructure/pdv.repository";

export type SalesProductDetails = {
  product_id: string;
  name: string;
  brand: string | null;
  category: string | null;
  product_model: string | null;
  manufacturer_code: string | null;
  internal_barcode: string | null;
  condition: "new" | "used" | "refurbished" | string | null;
  description: string | null;
  variant_attributes: Record<string, string>;
  site_characteristics: Array<{ label: string; value: string }>;
  gallery_media_ids: string[];
};

export async function getSalesProductDetails(organizationId: string, productId: string): Promise<SalesProductDetails> {
  if (!organizationId || !productId) throw new Error("Produto ou empresa não informados.");
  const { data, error } = await supabase.rpc("get_sales_product_details_v1", {
    p_organization_id: organizationId,
    p_product_id: productId,
  });
  if (error) throw error;
  return data as SalesProductDetails;
}

export type SalesPaymentMethod = {
  id: string;
  name: string;
  method_type: string;
  financial_account_id: string;
  account_name: string;
};
export type SalesCheckoutOptions = { payment_methods: SalesPaymentMethod[]; finance_ready: boolean };

export type CreateCommercialSale = {
  idempotencyKey: string;
  customerId: string | null;
  customerName: string | null;
  customerDocument: string | null;
  discount: number;
  paid: boolean;
  paymentMethodId: string | null;
  dueDate: string | null;
  notes: string;
  items: Array<{ productId: string; quantity: number }>;
};
export type CommercialSaleResult = {
  id: string;
  order_number: number;
  total_amount: number;
  payment_status: "paid" | "pending";
  financial_entry_id: string;
  idempotent_replay: boolean;
};
function organization(value: string) {
  const id = String(value || "").trim();
  if (!id) throw new Error("Selecione uma empresa para continuar.");
  return id;
}

/** Mesmo catálogo empresarial, mas com permissão do módulo Vendas, não do PDV. */
export async function searchSalesProducts(organizationId: string, search: string, limit = 80): Promise<PdvProduct[]> {
  const { data, error } = await supabase.rpc("search_sales_products_v1", {
    p_organization_id: organization(organizationId), p_search: search, p_limit: limit,
  });
  if (error) throw error;
  return (data || []) as PdvProduct[];
}

export async function listSalesProductRelations(organizationId: string, productIds: string[]): Promise<PdvRelatedProduct[]> {
  if (!productIds.length) return [];
  const { data, error } = await supabase.rpc("list_sales_product_relations_v1", {
    p_organization_id: organization(organizationId), p_source_product_ids: [...new Set(productIds)].slice(0, 30),
  });
  if (error) throw error;
  return (data || []) as PdvRelatedProduct[];
}

export async function searchSalesCustomers(organizationId: string, search: string): Promise<PdvCustomer[]> {
  const { data, error } = await supabase.rpc("search_sales_customers_v1", {
    p_organization_id: organization(organizationId), p_search: search.trim(), p_limit: 20,
  });
  if (error) throw error;
  return (data || []) as PdvCustomer[];
}

export async function loadSalesCheckoutOptions(organizationId: string): Promise<SalesCheckoutOptions> {
  const { data, error } = await supabase.rpc("sales_checkout_options_v1", {
    p_organization_id: organization(organizationId),
  });
  if (error) throw error;
  return data as SalesCheckoutOptions;
}

export async function createCommercialSale(organizationId: string, input: CreateCommercialSale): Promise<CommercialSaleResult> {
  const { data, error } = await supabase.rpc("create_sales_order_v1", {
    p_organization_id: organization(organizationId),
    p_idempotency_key: input.idempotencyKey,
    p_payload: {
      items: input.items.map(line => ({ product_id: line.productId, quantity: line.quantity })),
      customer_id: input.customerId,
      customer_name: input.customerName,
      customer_document: input.customerDocument,
      discount: input.discount,
      paid: input.paid,
      payment_method_id: input.paid ? input.paymentMethodId : null,
      due_date: input.paid ? null : input.dueDate,
      notes: input.notes,
    },
  });
  if (error) throw error;
  return data as CommercialSaleResult;
}
