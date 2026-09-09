import { supabase } from "@/lib/supabase";

const QUOTE_SELECT = "id, protocol, created_at, updated_at, requested_at, assigned_to, status_id, customer_id, service_id, brand_id, product_id, customer_message, estimated_price, final_price, request_status:request_statuses(id,name,color), customer:customers(id,customer_type,full_name,whatsapp,email,document,phone,trade_name,legal_name,cnpj,state_registration,foundation_date,addresses:customer_addresses(*)), service:services(title), brand:brands(name), product:products(name)";

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

function clean(value: string) {
  return value.trim().replace(/[%(),]/g, " ").replace(/\s+/g, " ");
}

function textPattern(value: string) {
  const normalized = clean(value);
  return normalized ? `%${normalized.split(/\s+/).join("%")} %`.replace("% ", "%") : "%";
}

function digitsPattern(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? `%${digits.split("").join("%")} %`.replace("% ", "%") : "%";
}

async function findCustomerIds({ search = "", customerSearch = "", documentSearch = "", whatsappSearch = "" }: Pick<QuotePageInput, "search" | "customerSearch" | "documentSearch" | "whatsappSearch">) {
  const hasSpecific = Boolean(customerSearch.trim() || documentSearch.trim() || whatsappSearch.trim());
  const hasGeneric = Boolean(search.trim());
  if (!hasSpecific && !hasGeneric) return { specific: null as string[] | null, generic: null as string[] | null };

  const runSpecific = async () => {
    if (!hasSpecific) return null;
    let query = supabase.from("customers").select("id");
    if (customerSearch.trim()) {
      const pattern = textPattern(customerSearch);
      query = query.or(`full_name.ilike.${pattern},trade_name.ilike.${pattern},legal_name.ilike.${pattern}`);
    }
    if (documentSearch.trim()) {
      const pattern = digitsPattern(documentSearch);
      query = query.or(`document.ilike.${pattern},cnpj.ilike.${pattern}`);
    }
    if (whatsappSearch.trim()) {
      const pattern = digitsPattern(whatsappSearch);
      query = query.or(`whatsapp.ilike.${pattern},phone.ilike.${pattern}`);
    }
    const { data, error } = await query.limit(1000);
    if (error) throw error;
    return (data ?? []).map(row => row.id);
  };

  const runGeneric = async () => {
    if (!hasGeneric) return null;
    const text = textPattern(search);
    const digits = digitsPattern(search);
    const { data, error } = await supabase
      .from("customers")
      .select("id")
      .or(`full_name.ilike.${text},trade_name.ilike.${text},legal_name.ilike.${text},document.ilike.${digits},cnpj.ilike.${digits},whatsapp.ilike.${digits},phone.ilike.${digits}`)
      .limit(1000);
    if (error) throw error;
    return (data ?? []).map(row => row.id);
  };

  const [specific, generic] = await Promise.all([runSpecific(), runGeneric()]);
  return { specific, generic };
}

export async function listQuotesPage(input: QuotePageInput): Promise<QuotePage> {
  const { page, pageSize, search = "", customerSearch = "", documentSearch = "", whatsappSearch = "", protocolSearch = "", statusId = "", sort = "" } = input;
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  const customerIds = await findCustomerIds({ search, customerSearch, documentSearch, whatsappSearch });
  if (customerIds.specific && customerIds.specific.length === 0) return { items: [], total: 0 };

  let query = supabase.from("quote_requests").select(QUOTE_SELECT, { count: "exact" });
  if (customerIds.specific) query = query.in("customer_id", customerIds.specific);
  if (statusId) query = query.eq("status_id", statusId);
  if (protocolSearch.trim()) query = query.ilike("protocol", textPattern(protocolSearch));

  if (search.trim()) {
    const protocolPattern = textPattern(search);
    if (customerIds.generic?.length) {
      query = query.or(`protocol.ilike.${protocolPattern},customer_id.in.(${customerIds.generic.join(",")})`);
    } else {
      query = query.ilike("protocol", protocolPattern);
    }
  }

  if (sort) query = query.order("protocol", { ascending: sort === "asc" }).order("created_at", { ascending: false });
  else query = query.order("created_at", { ascending: false });

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  return {
    items: (data ?? []).map((quote: any) => ({ ...quote, statusName: quote.request_status?.name || "Sem status" })),
    total: count ?? 0,
  };
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
