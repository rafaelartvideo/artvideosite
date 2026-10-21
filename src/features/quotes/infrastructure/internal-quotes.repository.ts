import { supabase } from "@/lib/supabase";

export type QuoteLineDraft = {
  item_type: "service" | "product" | "custom_service";
  general_service_id: string | null;
  inventory_item_id: string | null;
  title_snapshot: string;
  description_snapshot: string;
  quantity: number;
  unit_price: number;
  additional_cost: number;
};

export type InternalQuoteDraft = {
  customer_id: string;
  issue_reported: string;
  diagnosis: string;
  proposed_solution: string;
  internal_notes: string;
  equipment_name: string;
  equipment_brand: string;
  equipment_model: string;
  serial_number: string;
  accessories: string;
  equipment_condition: string;
  valid_until: string;
  discount_type: "amount" | "percentage";
  discount_value: number;
};

export type QuoteCustomerOption = {
  id: string;
  full_name: string;
  trade_name: string | null;
  document: string | null;
  cnpj: string | null;
  whatsapp: string | null;
};

export type QuoteCatalogOption = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  unit: string;
};

export function emptyInternalQuote(): InternalQuoteDraft {
  return {
    customer_id: "",
    issue_reported: "",
    diagnosis: "",
    proposed_solution: "",
    internal_notes: "",
    equipment_name: "",
    equipment_brand: "",
    equipment_model: "",
    serial_number: "",
    accessories: "",
    equipment_condition: "",
    valid_until: "",
    discount_type: "amount",
    discount_value: 0,
  };
}

export async function searchQuoteCustomers(organizationId: string, term: string): Promise<QuoteCustomerOption[]> {
  const value = term.trim();
  if (value.length < 2) return [];
  const digits = value.replace(/\D/g, "");
  const column = digits.length >= 3 && digits.length === value.replace(/[\s.()/-]/g, "").length
    ? (digits.length > 11 ? "cnpj" : "document")
    : "full_name";
  const { data, error } = await supabase.from("customers")
    .select("id,full_name,trade_name,document,cnpj,whatsapp")
    .eq("organization_id", organizationId)
    .ilike(column, "%" + (column === "full_name" ? value : digits) + "%")
    .order("full_name")
    .limit(10);
  if (error) throw error;
  return (data || []) as QuoteCustomerOption[];
}

export async function searchQuoteCatalog(
  organizationId: string,
  category: "service" | "product",
  term: string,
): Promise<QuoteCatalogOption[]> {
  const value = term.trim();
  if (value.length < 2) return [];
  if (category === "service") {
    const { data, error } = await supabase.from("general_services")
      .select("id,name,price")
      .eq("organization_id", organizationId).eq("is_active", true)
      .ilike("name", "%" + value + "%").order("name").limit(15);
    if (error) throw error;
    return (data || []).map(item => ({
      id: item.id, name: item.name, description: null, price: Number(item.price || 0), unit: "un",
    }));
  }
  const { data, error } = await supabase.from("inventory_items")
    .select("id,name,description,sale_price,unit")
    .eq("organization_id", organizationId).eq("is_active", true).is("archived_at", null)
    .ilike("name", "%" + value + "%").order("name").limit(15);
  if (error) throw error;
  return (data || []).map(item => ({
    id: item.id, name: item.name, description: item.description, price: Number(item.sale_price || 0),
    unit: item.unit || "un",
  }));
}

export async function listInternalQuoteItems(organizationId: string, quoteId: string): Promise<QuoteLineDraft[]> {
  const { data, error } = await supabase.from("quote_commercial_items")
    .select("item_type,general_service_id,inventory_item_id,title_snapshot,description_snapshot,quantity,unit_price,additional_cost")
    .eq("organization_id", organizationId).eq("quote_request_id", quoteId).order("created_at");
  if (error) throw error;
  return (data || []).map(item => ({
    item_type: item.item_type as QuoteLineDraft["item_type"],
    general_service_id: item.general_service_id,
    inventory_item_id: item.inventory_item_id,
    title_snapshot: item.title_snapshot,
    description_snapshot: item.description_snapshot || "",
    quantity: Number(item.quantity || 1),
    unit_price: Number(item.unit_price || 0),
    additional_cost: Number(item.additional_cost || 0),
  }));
}

export async function listQuoteComments(organizationId: string, quoteId: string) {
  const { data, error } = await supabase.from("quote_comments")
    .select("id,body,created_at,author:profiles!quote_comments_author_id_fkey(full_name)")
    .eq("organization_id", organizationId).eq("quote_request_id", quoteId)
    .order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return data || [];
}

export async function addQuoteComment(organizationId: string, quoteId: string, authorId: string, body: string) {
  const { error } = await supabase.from("quote_comments")
    .insert({ organization_id: organizationId, quote_request_id: quoteId, author_id: authorId, body: body.trim() });
  if (error) throw error;
}

export async function saveInternalQuote(input: {
  organizationId: string;
  quoteId: string | null;
  draft: InternalQuoteDraft;
  items: QuoteLineDraft[];
  comment: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("save_internal_quote_v1", {
    p_organization_id: input.organizationId,
    p_quote_id: input.quoteId,
    p_payload: input.draft,
    p_items: input.items,
    p_comment: input.comment.trim() || null,
  });
  if (error) throw error;
  if (!data) throw new Error("O orçamento não retornou um identificador.");
  return String(data);
}
