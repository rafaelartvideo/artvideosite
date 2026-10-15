import { supabase } from "@/lib/supabase";

export type RequestKind = "product" | "service";
export type RequestStatus = "pending" | "fulfilled" | "cancelled";
export type RequestSort = "newest" | "oldest";

export type RequestCustomer = {
  id: string;
  full_name: string | null;
  trade_name: string | null;
  legal_name: string | null;
  phone?: string | null;
  whatsapp?: string | null;
};

export type CustomerRequest = {
  id: string;
  organization_id: string;
  customer_id: string;
  request_kind: RequestKind;
  description: string;
  status: RequestStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customer: RequestCustomer | null;
  creatorName: string;
};

export function requestCustomerName(customer: RequestCustomer | null | undefined) {
  return customer?.trade_name || customer?.full_name || customer?.legal_name || "Cliente";
}

// CPF/CNPJ e telefones são persistidos sem máscara. Remover a pontuação
// antes da consulta garante que o número digitado encontre o cadastro.
function customerSearchPattern(value: string) {
  const term = value.trim();
  const digits = term.replace(/\D/g, "");
  if (/^[\d\s()./\-]+$/.test(term) && digits.length >= 2) return "%" + digits + "%";
  const safe = term.replace(/[,().%\\]/g, " ").trim().replace(/\s+/g, "%");
  return safe ? "%" + safe + "%" : null;
}

function customerSearchOr(pattern: string) {
  return [
    "full_name", "trade_name", "legal_name", "document",
    "cnpj", "phone", "whatsapp",
  ].map(field => field + ".ilike." + pattern).join(",");
}

export async function listCustomerRequests(input: {
  organizationId: string;
  page: number;
  pageSize: number;
  kind: RequestKind | "all";
  status: RequestStatus | "all";
  search: string;
  customerSearch: string;
  sort: RequestSort;
}): Promise<{ items: CustomerRequest[]; total: number }> {
  const { organizationId, page, pageSize, kind, status, search, customerSearch, sort } = input;

  // Busca de nome/CPF separada da descrição e sempre limitada à empresa.
  let customerIds: string[] | null = null;
  if (customerSearch.trim()) {
    const pattern = customerSearchPattern(customerSearch);
    if (!pattern) return { items: [], total: 0 };
    const { data, error } = await supabase.from("customers")
      .select("id").eq("organization_id", organizationId)
      .or(customerSearchOr(pattern)).limit(500);
    if (error) throw error;
    customerIds = (data || []).map(customer => customer.id);
    if (!customerIds.length) return { items: [], total: 0 };
  }

  let query = supabase.from("customer_requests")
    .select("id,organization_id,customer_id,request_kind,description,status,created_by,created_at,updated_at,customer:customers!customer_id(id,full_name,trade_name,legal_name,phone,whatsapp)", { count: "exact" })
    .eq("organization_id", organizationId);

  if (customerIds) query = query.in("customer_id", customerIds);
  if (kind !== "all") query = query.eq("request_kind", kind);
  if (status !== "all") query = query.eq("status", status);
  if (search.trim()) {
    const clean = search.trim().replace(/[%_\\]/g, "");
    if (clean) query = query.ilike("description", "%" + clean + "%");
  }
  const first = (Math.max(1, page) - 1) * pageSize;
  const { data, error, count } = await query
    .order("created_at", { ascending: sort === "oldest" })
    .order("id", { ascending: sort === "oldest" })
    .range(first, first + pageSize - 1);
  if (error) throw error;

  const raw = (data ?? []) as unknown as Array<Omit<CustomerRequest, "creatorName"> & { customer: RequestCustomer | RequestCustomer[] | null }>;
  const creators = [...new Set(raw.map(item => item.created_by).filter((id): id is string => Boolean(id)))];
  const profileNames = new Map<string, string>();
  if (creators.length) {
    const result = await supabase.from("profiles").select("id,full_name").in("id", creators);
    if (!result.error) for (const person of result.data ?? []) profileNames.set(person.id, person.full_name || "Atendente");
  }
  return {
    items: raw.map(item => ({
      ...item,
      customer: Array.isArray(item.customer) ? item.customer[0] ?? null : item.customer,
      creatorName: item.created_by ? profileNames.get(item.created_by) || "Atendente" : "Atendente",
    })),
    total: count ?? 0,
  };
}

export async function findRequestCustomers(organizationId: string, search: string): Promise<RequestCustomer[]> {
  const pattern = customerSearchPattern(search);
  if (!pattern) return [];
  const { data, error } = await supabase.from("customers")
    .select("id,full_name,trade_name,legal_name,phone,whatsapp")
    .eq("organization_id", organizationId)
    .or(customerSearchOr(pattern))
    .order("full_name", { ascending: true })
    .limit(6);
  if (error) throw error;
  return (data ?? []) as RequestCustomer[];
}

export async function createCustomerRequest(input: {
  organizationId: string;
  customerId: string;
  kind: RequestKind;
  description: string;
}) {
  const { error } = await supabase.from("customer_requests").insert({
    organization_id: input.organizationId,
    customer_id: input.customerId,
    request_kind: input.kind,
    description: input.description.trim(),
  });
  if (error) throw error;
}

export async function updateCustomerRequestStatus(organizationId: string, id: string, status: RequestStatus) {
  const { data, error } = await supabase.from("customer_requests")
    .update({ status })
    .eq("organization_id", organizationId)
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Pedido não encontrado ou não autorizado.");
}
