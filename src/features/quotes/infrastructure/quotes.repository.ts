import { supabase } from "@/lib/supabase";

export const listQuotes = () =>
  supabase
    .from("quote_requests")
    .select("id, protocol, created_at, updated_at, requested_at, assigned_to, status_id, customer_id, service_id, brand_id, product_id, customer_message, estimated_price, final_price, request_status:request_statuses(id,name,color), customer:customers(id,customer_type,full_name,whatsapp,email,document,phone,trade_name,legal_name,cnpj,state_registration,foundation_date,addresses:customer_addresses(*)), service:services(title), brand:brands(name), product:products(name)")
    .order("created_at", { ascending: false });

export const listRequestStatuses = () =>
  supabase
    .from("request_statuses")
    .select("id, name, color, sort_order")
    .order("sort_order");

export const updateQuoteStatus = (quoteId: string, statusId: string) =>
  supabase.from("quote_requests").update({ status_id: statusId }).eq("id", quoteId);

export const insertQuoteStatusHistory = (
  quoteId: string,
  statusId: string,
  createdBy: string | null,
) =>
  supabase.from("quote_status_history").insert({
    quote_request_id: quoteId,
    status_id: statusId,
    created_by: createdBy,
  });

export const deleteQuote = (quoteId: string) =>
  supabase.from("quote_requests").delete().eq("id", quoteId);

export const findServiceOrderByQuote = (quoteId: string) =>
  supabase
    .from("service_orders")
    .select("id, os_number")
    .eq("quote_request_id", quoteId)
    .maybeSingle();

export const listOrderStatuses = () =>
  supabase.from("order_statuses").select("id,name,sort_order").order("sort_order");

export const createServiceOrderFromQuote = (
  order: Record<string, unknown>,
) => supabase.from("service_orders").insert(order);
