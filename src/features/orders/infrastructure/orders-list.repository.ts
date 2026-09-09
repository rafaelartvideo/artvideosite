import { supabase } from "@/lib/supabase";

const ORDER_LIST_SELECT = "*, order_status:order_statuses(id,name,color), situation:os_situations(id,name,color,hours), customer:customers(id,customer_type,full_name,phone,whatsapp,document,email,trade_name,legal_name,cnpj,state_registration,birth_date,addresses:customer_addresses(*)), service:services(id,title), assigned_profile:profiles!assigned_to(id,full_name), seller:employees!seller_id(id,full_name), technician:employees!technician_id(id,full_name), technician_links:service_order_technicians(employee_id,employee:employees(id,full_name,function_name,is_active)), seller_links:service_order_sellers(employee_id,employee:employees(id,full_name,function_name,is_active)), service_type:service_types(id,title,forecast_days), general_service:general_services(id,name,price,max_discount_percentage), equipment_type:equipment_types(id,name), equipment_brand:equipment_brands(id,name), equipment_model:equipment_models(id,name)";

export type OrderListCityFilter = { name: string; state: string };

export type ServiceOrderPageInput = {
  organizationId: string;
  page: number;
  pageSize: number;
  osNumberSearch?: string;
  externalOsSearch?: string;
  documentSearch?: string;
  statusId?: string;
  situationId?: string;
  orderType?: string;
  serviceTypeId?: string;
  states?: string[];
  stateNames?: string[];
  cities?: OrderListCityFilter[];
  dateFrom?: string;
  dateTo?: string;
  sort?: "" | "asc" | "desc";
  matchOrderNumberOrExternal?: boolean;
};

export type ServiceOrderPage = {
  items: any[];
  total: number;
};

function safeFilterValue(value: string) {
  return value.trim().replace(/[%(),]/g, "");
}

function normalizeIdentifier(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeOrderSearch(value: string) {
  return normalizeIdentifier(value).replace(/^os(?=\d)/, "");
}

function normalizeDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function looseIdentifierPattern(value: string, stripOsPrefix = false) {
  let normalized = normalizeIdentifier(value);
  if (stripOsPrefix) normalized = normalized.replace(/^os(?=\d)/, "");
  return normalized ? `%${normalized.split("").join("%")} %`.replace("% ", "%") : "%";
}

function looseDigitsPattern(value: string) {
  const digits = normalizeDigits(value);
  return digits ? `%${digits.split("").join("%")} %`.replace("% ", "%") : "%";
}

function intersectIds(current: string[] | null, next: string[]) {
  if (current == null) return next;
  const nextSet = new Set(next);
  return current.filter(id => nextSet.has(id));
}

async function findMatchingCustomerIds(organizationId: string, search: string) {
  const normalizedSearch = normalizeDigits(search);
  if (!normalizedSearch) return null;

  const { data, error } = await supabase
    .from("customers")
    .select("id,document,cnpj")
    .eq("organization_id", organizationId)
    .or(`document.ilike.${looseDigitsPattern(search)},cnpj.ilike.${looseDigitsPattern(search)}`)
    .limit(5000);

  if (error) throw error;
  return (data ?? [])
    .filter(customer =>
      normalizeDigits(customer.document).includes(normalizedSearch)
      || normalizeDigits(customer.cnpj).includes(normalizedSearch),
    )
    .map(customer => customer.id);
}

async function findMatchingOrderIds({
  organizationId,
  search,
  field,
  includeExternal,
}: {
  organizationId: string;
  search: string;
  field: "os" | "external";
  includeExternal?: boolean;
}) {
  const normalizedSearch = field === "os"
    ? normalizeOrderSearch(search)
    : normalizeIdentifier(search);
  if (!normalizedSearch) return null;

  const pattern = looseIdentifierPattern(search, field === "os");
  let query = supabase
    .from("service_orders")
    .select("id,os_number,external_os_number")
    .eq("organization_id", organizationId);

  if (field === "external") {
    query = query.ilike("external_os_number", pattern);
  } else if (includeExternal) {
    query = query.or(`os_number.ilike.${pattern},external_os_number.ilike.${pattern}`);
  } else {
    query = query.ilike("os_number", pattern);
  }

  const { data, error } = await query.limit(5000);
  if (error) throw error;

  return (data ?? [])
    .filter(order => {
      const osNumber = normalizeIdentifier(order.os_number);
      const externalNumber = normalizeIdentifier(order.external_os_number);
      if (field === "external") return externalNumber.includes(normalizedSearch);
      const matchesInternal = osNumber.includes(normalizedSearch);
      return includeExternal ? matchesInternal || externalNumber.includes(normalizedSearch) : matchesInternal;
    })
    .map(order => order.id);
}

export async function listServiceOrdersPage({
  organizationId,
  page,
  pageSize,
  osNumberSearch = "",
  externalOsSearch = "",
  documentSearch = "",
  statusId = "",
  situationId = "",
  orderType = "",
  serviceTypeId = "",
  states = [],
  stateNames = [],
  cities = [],
  dateFrom = "",
  dateTo = "",
  sort = "",
  matchOrderNumberOrExternal = false,
}: ServiceOrderPageInput): Promise<ServiceOrderPage> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  let matchingOrderIds: string[] | null = null;

  if (osNumberSearch.trim()) {
    const ids = await findMatchingOrderIds({
      organizationId,
      search: osNumberSearch,
      field: "os",
      includeExternal: matchOrderNumberOrExternal,
    });
    matchingOrderIds = intersectIds(matchingOrderIds, ids ?? []);
    if (matchingOrderIds.length === 0) return { items: [], total: 0 };
  }

  if (!matchOrderNumberOrExternal && externalOsSearch.trim()) {
    const ids = await findMatchingOrderIds({
      organizationId,
      search: externalOsSearch,
      field: "external",
    });
    matchingOrderIds = intersectIds(matchingOrderIds, ids ?? []);
    if (matchingOrderIds.length === 0) return { items: [], total: 0 };
  }

  const customerIds = documentSearch.trim()
    ? await findMatchingCustomerIds(organizationId, documentSearch)
    : null;
  if (customerIds && customerIds.length === 0) return { items: [], total: 0 };

  let query = supabase
    .from("service_orders")
    .select(ORDER_LIST_SELECT, { count: "exact" })
    .eq("organization_id", organizationId);

  if (matchingOrderIds) query = query.in("id", matchingOrderIds);
  if (customerIds) query = query.in("customer_id", customerIds);
  if (statusId) query = query.eq("status_id", statusId);
  if (situationId) query = query.eq("situation_id", situationId);
  if (orderType) query = query.eq("order_type", orderType);
  if (serviceTypeId) query = query.eq("service_type_id", serviceTypeId);

  const stateValues = [...new Set([...states, ...stateNames].map(safeFilterValue).filter(Boolean))];
  if (stateValues.length) {
    query = query.or(stateValues.map(value => `service_state.ilike.${value}`).join(","));
  }
  if (cities.length) {
    const cityNames = [...new Set(cities.map(city => safeFilterValue(city.name)).filter(Boolean))];
    if (cityNames.length) {
      query = query.or(cityNames.map(value => `service_city.ilike.${value}`).join(","));
    }
  }

  if (dateFrom) query = query.gte("created_at", `${dateFrom}T00:00:00`);
  if (dateTo) {
    const end = new Date(`${dateTo}T00:00:00`);
    end.setDate(end.getDate() + 1);
    query = query.lt("created_at", end.toISOString());
  }

  if (sort) query = query.order("os_number", { ascending: sort === "asc" }).order("created_at", { ascending: false });
  else query = query.order("created_at", { ascending: false });

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  return { items: data ?? [], total: count ?? 0 };
}

export async function getServiceOrderForRoute(organizationId: string, serviceOrderId: string) {
  const { data, error } = await supabase
    .from("service_orders")
    .select(ORDER_LIST_SELECT)
    .eq("organization_id", organizationId)
    .eq("id", serviceOrderId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
