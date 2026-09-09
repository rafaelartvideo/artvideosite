import { supabase } from "@/lib/supabase";

const QUOTE_SELECT = "id, protocol, created_at, updated_at, requested_at, assigned_to, status_id, customer_id, service_id, brand_id, product_id, customer_message, estimated_price, final_price, request_status:request_statuses(id,name,color), customer:customers(id,customer_type,full_name,whatsapp,email,document,phone,trade_name,legal_name,cnpj,state_registration,foundation_date,addresses:customer_addresses(*)), service:services(title), brand:brands(name), product:products(name)";
const QUOTE_FILTER_SELECT = "id,protocol,created_at,status_id,customer_id,customer:customers(id,full_name,trade_name,document,cnpj,whatsapp)";

export type QuotePageInput = {
  page: number;
  pageSize: number;
  search?: string;
  customerSearch?: string;
  documentSearch?: string;
  whatsappSearch?: string;
  protocolSearch?: string;
  statusId?: string;
  sort?: "" | "asc" | "desc";
};

export type QuotePage = { items: any[]; total: number };

const normalizeDocument = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const normalizeText = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("pt-BR");

export async function listQuotesPage(input: QuotePageInput): Promise<QuotePage> {
  const {
    page,
    pageSize,
    search = "",
    customerSearch = "",
    documentSearch = "",
    whatsappSearch = "",
    protocolSearch = "",
    statusId = "",
    sort = "",
  } = input;

  const { data: index, error: indexError } = await supabase
    .from("quote_requests")
    .select(QUOTE_FILTER_SELECT);
  if (indexError) throw indexError;

  const desktopNeedle = normalizeText(search);
  const desktopDigits = normalizeDocument(search);
  const customerNeedle = normalizeText(customerSearch);
  const documentNeedle = normalizeDocument(documentSearch);
  const whatsappNeedle = normalizeDocument(whatsappSearch);
  const protocolNeedle = normalizeText(protocolSearch);

  const filtered = (index ?? []).filter((quote: any) => {
    const customer = quote.customer || {};
    const customerName = String(customer.full_name || "");
    const customerTradeName = String(customer.trade_name || "");
    const customerWa = String(customer.whatsapp || "");
    const customerDocument = customer.document || customer.cnpj || "";
    const protocol = String(quote.protocol || "");

    const desktopMatch = !desktopNeedle
      || normalizeText(customerName).includes(desktopNeedle)
      || normalizeText(customerTradeName).includes(desktopNeedle)
      || customerWa.includes(search)
      || (desktopDigits && normalizeDocument(customerDocument).includes(desktopDigits))
      || normalizeText(protocol).includes(desktopNeedle);
    const matchCustomer = !customerNeedle
      || normalizeText(customerName).includes(customerNeedle)
      || normalizeText(customerTradeName).includes(customerNeedle);
    const matchDocument = !documentNeedle || normalizeDocument(customerDocument).includes(documentNeedle);
    const matchWhatsapp = !whatsappNeedle || normalizeDocument(customerWa).includes(whatsappNeedle);
    const matchProtocol = !protocolNeedle || normalizeText(protocol).includes(protocolNeedle);

    return desktopMatch && matchCustomer && matchDocument && matchWhatsapp && matchProtocol && (!statusId || quote.status_id === statusId);
  });

  const sorted = sort ? [...filtered].sort((left: any, right: any) => {
    const leftProtocol = String(left.protocol || left.id || "");
    const rightProtocol = String(right.protocol || right.id || "");
    const comparison = leftProtocol.localeCompare(rightProtocol, "pt-BR", { numeric: true, sensitivity: "base" });
    return sort === "asc" ? comparison : -comparison;
  }) : [...filtered].sort((left: any, right: any) => String(right.created_at ?? "").localeCompare(String(left.created_at ?? "")));

  const safeSize = Math.max(1, pageSize);
  const start = (Math.max(1, page) - 1) * safeSize;
  const ids = sorted.slice(start, start + safeSize).map((quote: any) => quote.id);
  if (ids.length === 0) return { items: [], total: sorted.length };

  const { data, error } = await supabase.from("quote_requests").select(QUOTE_SELECT).in("id", ids);
  if (error) throw error;
  const byId = new Map((data ?? []).map((quote: any) => [quote.id, { ...quote, statusName: quote.request_status?.name || "Sem status" }]));
  return { items: ids.map(id => byId.get(id)).filter(Boolean), total: sorted.length };
}

export async function getQuote(quoteId: string) {
  const { data, error } = await supabase.from("quote_requests").select(QUOTE_SELECT).eq("id", quoteId).maybeSingle();
  if (error) throw error;
  return data ? { ...data, statusName: (data.request_status as any)?.name || "Sem status" } : null;
}

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
