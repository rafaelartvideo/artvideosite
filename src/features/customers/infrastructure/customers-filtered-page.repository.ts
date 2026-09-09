import { supabase } from "@/lib/supabase";

const CUSTOMER_INDEX_SELECT = "id,full_name,trade_name,legal_name,document,cnpj,created_at,addresses:customer_addresses(state,city)";

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
  const { data: index, error: indexError } = await supabase
    .from("customers")
    .select(CUSTOMER_INDEX_SELECT)
    .eq("organization_id", organizationId);
  if (indexError) throw indexError;

  const nameNeedle = normalizeText(nameSearch);
  const documentNeedle = normalizeDocument(documentSearch);
  const selectedStates = new Set(states.map(value => String(value).trim().toUpperCase()));
  const selectedCities = new Set(cities.map(value => {
    const separator = value.indexOf(":");
    const state = separator >= 0 ? value.slice(0, separator) : "";
    const city = separator >= 0 ? value.slice(separator + 1) : value;
    return `${state.trim().toUpperCase()}:${normalizeText(city)}`;
  }));

  const filtered = (index ?? []).filter((customer: any) => {
    const matchesName = !nameNeedle || [customer.full_name, customer.trade_name, customer.legal_name].some(value => normalizeText(value).includes(nameNeedle));
    const matchesDocument = !documentNeedle || [customer.document, customer.cnpj].some(value => normalizeDocument(value).includes(documentNeedle));
    const addresses = customer.addresses || [];
    const matchesState = selectedStates.size === 0 || addresses.some((address: any) => selectedStates.has(String(address?.state || "").trim().toUpperCase()));
    const matchesCity = selectedCities.size === 0 || addresses.some((address: any) => selectedCities.has(`${String(address?.state || "").trim().toUpperCase()}:${normalizeText(address?.city)}`));
    return matchesName && matchesDocument && matchesState && matchesCity;
  });

  const sorted = sort ? [...filtered].sort((left: any, right: any) => {
    const leftName = String(left.trade_name || left.full_name || left.legal_name || "");
    const rightName = String(right.trade_name || right.full_name || right.legal_name || "");
    const comparison = leftName.localeCompare(rightName, "pt-BR", { sensitivity: "base", numeric: true });
    return sort === "asc" ? comparison : -comparison;
  }) : [...filtered].sort((left: any, right: any) => String(right.created_at ?? "").localeCompare(String(left.created_at ?? "")));

  const safeSize = Math.max(1, pageSize);
  const start = (Math.max(1, page) - 1) * safeSize;
  const ids = sorted.slice(start, start + safeSize).map((customer: any) => customer.id);
  if (ids.length === 0) return { items: [], total: sorted.length };

  const { data, error } = await supabase
    .from("customers")
    .select("*, addresses:customer_addresses(*)")
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (error) throw error;
  const byId = new Map((data ?? []).map((customer: any) => [customer.id, customer]));
  return { items: ids.map(id => byId.get(id)).filter(Boolean), total: sorted.length };
}
