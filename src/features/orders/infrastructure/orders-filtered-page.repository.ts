import { supabase } from "@/lib/supabase";

const ORDER_LIST_SELECT = "*, order_status:order_statuses(id,name,color), situation:os_situations(id,name,color,hours), customer:customers(id,customer_type,full_name,phone,whatsapp,document,email,trade_name,legal_name,cnpj,state_registration,birth_date,addresses:customer_addresses(*)), service:services(id,title), assigned_profile:profiles!assigned_to(id,full_name), seller:employees!seller_id(id,full_name), technician:employees!technician_id(id,full_name), technician_links:service_order_technicians(employee_id,employee:employees(id,full_name,function_name,is_active)), seller_links:service_order_sellers(employee_id,employee:employees(id,full_name,function_name,is_active)), service_type:service_types(id,title,forecast_days), general_service:general_services(id,name,price,price_at_completion,max_discount_percentage,max_discount_amount), equipment_type:equipment_types(id,name), equipment_brand:equipment_brands(id,name), equipment_model:equipment_models(id,name)";

export type FilterCity = { name: string; state: string };

export type ExactOrderPageInput = {
  organizationId: string;
  page: number;
  pageSize: number;
  osNumberSearch?: string;
  externalOsSearch?: string;
  customerNameSearch?: string;
  documentSearch?: string;
  serialNumberSearch?: string;
  responsibleId?: string;
  statusId?: string;
  situationId?: string;
  orderType?: string;
  serviceTypeId?: string;
  states?: string[];
  stateNames?: string[];
  cities?: FilterCity[];
  dateFrom?: string;
  dateTo?: string;
  sort?: "" | "asc" | "desc";
  matchOrderNumberOrExternal?: boolean;
};

export type ExactOrderPage = {
  items: any[];
  total: number;
};

type OrderPageIndexRow = {
  id: string;
  total_count: number | string;
};

async function fetchOrderPageIndex(input: ExactOrderPageInput): Promise<OrderPageIndexRow[]> {
  const {
    organizationId,
    page,
    pageSize,
    osNumberSearch = "",
    externalOsSearch = "",
    customerNameSearch = "",
    documentSearch = "",
    serialNumberSearch = "",
    responsibleId = "",
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
  } = input;

  const { data, error } = await supabase.rpc("search_service_order_page_ids_v3", {
    p_organization_id: organizationId,
    p_page: Math.max(1, page),
    p_page_size: Math.max(1, pageSize),
    p_os_number_search: osNumberSearch,
    p_external_os_search: externalOsSearch,
    p_customer_name_search: customerNameSearch,
    p_document_search: documentSearch,
    p_serial_number_search: serialNumberSearch,
    p_responsible_id: responsibleId || null,
    p_status_id: statusId || null,
    p_situation_id: situationId || null,
    p_order_type: orderType,
    p_service_type_id: serviceTypeId || null,
    p_states: states,
    p_state_names: stateNames,
    p_cities: cities,
    p_date_from: dateFrom || null,
    p_date_to: dateTo || null,
    p_sort: sort,
    p_match_order_number_or_external: matchOrderNumberOrExternal,
  });

  if (error) throw error;
  return (data ?? []) as OrderPageIndexRow[];
}

export async function countServiceOrders(organizationId: string) {
  const rows = await fetchOrderPageIndex({
    organizationId,
    page: 1,
    pageSize: 1,
  });
  return Number(rows[0]?.total_count ?? 0);
}

export async function listExactServiceOrdersPage(
  input: ExactOrderPageInput,
): Promise<ExactOrderPage> {
  const rows = await fetchOrderPageIndex(input);
  const ids = rows.map(row => row.id);
  const total = Number(rows[0]?.total_count ?? 0);

  if (ids.length === 0) {
    return { items: [], total };
  }

  const { data, error } = await supabase
    .from("service_orders")
    .select(ORDER_LIST_SELECT)
    .eq("organization_id", input.organizationId)
    .in("id", ids);

  if (error) throw error;

  const byId = new Map((data ?? []).map((order: any) => [order.id, order]));
  return {
    items: ids.map(id => byId.get(id)).filter(Boolean),
    total,
  };
}
