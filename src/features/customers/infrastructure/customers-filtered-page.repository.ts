import { supabase } from "@/lib/supabase";

export type ExactCustomerPageInput = {
  organizationId: string;
  page: number;
  pageSize: number;
  nameSearch?: string;
  documentSearch?: string;
  states?: string[];
  cities?: string[];
  sort?: "" | "asc" | "desc";
};
export type ExactCustomerPage = { items: any[]; total: number };

const normalizeDocument = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const normalizeText = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("pt-BR");

export async function listExactCustomersPage(input: ExactCustomerPageInput): Promise<ExactCustomerPage> {
  const { organizationId, page, pageSize, nameSearch = "", documentSearch = "", states = [], cities = [], sort = "" } = input;
  // Filtering, exact count and ordering must happen before the API row limit.
  const { data: result, error: pageError } = await supabase.rpc("list_exact_customers_page", {
    p_organization_id: organizationId,
    p_page: Math.max(1, Math.trunc(page) || 1),
    p_page_size: Math.min(100, Math.max(1, Math.trunc(pageSize) || 1)),
    p_name_search: normalizeText(nameSearch),
    p_document_search: normalizeDocument(documentSearch),
    p_states: states.map(value => String(value).trim().toUpperCase()),
    p_cities: cities.map(value => {
      const separator = value.indexOf(":");
      const state = separator >= 0 ? value.slice(0, separator) : "";
      const city = separator >= 0 ? value.slice(separator + 1) : value;
      return `${state.trim().toUpperCase()}:${normalizeText(city)}`;
    }),
    p_sort: sort,
  });
  if (pageError) throw pageError;
  const ids: string[] = result?.ids ?? [];
  const total = Number(result?.total ?? 0);
  if (ids.length === 0) return { items: [], total };

  const { data, error } = await supabase
    .from("customers")
    .select("*, addresses:customer_addresses(*)")
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (error) throw error;
  const byId = new Map((data ?? []).map((customer: any) => [customer.id, customer]));
  return { items: ids.map(id => byId.get(id)).filter(Boolean), total };
}
