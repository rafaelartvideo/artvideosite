import { supabase } from "@/lib/supabase";

const ORDER_LIST_SELECT = "*, order_status:order_statuses(id,name,color), situation:os_situations(id,name,color,hours), customer:customers(id,customer_type,full_name,phone,whatsapp,document,email,trade_name,legal_name,cnpj,state_registration,birth_date,addresses:customer_addresses(*)), service:services(id,title), assigned_profile:profiles!assigned_to(id,full_name), seller:employees!seller_id(id,full_name), technician:employees!technician_id(id,full_name), technician_links:service_order_technicians(employee_id,employee:employees(id,full_name,function_name,is_active)), seller_links:service_order_sellers(employee_id,employee:employees(id,full_name,function_name,is_active)), service_type:service_types(id,title,forecast_days), general_service:general_services(id,name,price,max_discount_percentage), equipment_type:equipment_types(id,name), equipment_brand:equipment_brands(id,name), equipment_model:equipment_models(id,name)";
const FILTER_SELECT = "id,os_number,external_os_number,serial_number,status_id,situation_id,order_type,service_type_id,service_state,service_city,created_at,order_status:order_statuses(id,name),customer:customers(id,document,cnpj)";

export type FilterCity = { name: string; state: string };
export type ExactOrderPageInput = {
  organizationId: string;
  page: number;
  pageSize: number;
  osNumberSearch?: string;
  externalOsSearch?: string;
  documentSearch?: string;
  serialNumberSearch?: string;
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
export type ExactOrderPage = { items: any[]; total: number };

const normalizeIdentifier = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const normalizeDigits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const normalizeText = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");

const orderStatusPriority = (order: any) => {
  const statusName = normalizeText(order.order_status?.name);
  if (statusName === "aberta") return 0;
  if (statusName === "fechada") return 1;
  if (statusName === "cancelada") return 2;
  return 3;
};

export async function listExactServiceOrdersPage(input: ExactOrderPageInput): Promise<ExactOrderPage> {
  const {
    organizationId, page, pageSize, osNumberSearch = "", externalOsSearch = "", documentSearch = "", serialNumberSearch = "",
    statusId = "", situationId = "", orderType = "", serviceTypeId = "", states = [], stateNames = [], cities = [],
    dateFrom = "", dateTo = "", sort = "", matchOrderNumberOrExternal = false,
  } = input;

  const { data: index, error: indexError } = await supabase
    .from("service_orders")
    .select(FILTER_SELECT)
    .eq("organization_id", organizationId);
  if (indexError) throw indexError;

  const rawOsNeedle = normalizeIdentifier(osNumberSearch);
  const osNeedles = [...new Set([rawOsNeedle, rawOsNeedle.replace(/^os(?=\d)/, "")].filter(Boolean))];
  const externalNeedle = normalizeIdentifier(externalOsSearch);
  const documentNeedle = normalizeDigits(documentSearch);
  const serialNeedle = normalizeIdentifier(serialNumberSearch);
  const selectedStates = new Set([...states, ...stateNames].map(normalizeText).filter(Boolean));
  const cityFilters = cities.map(city => {
    const stateIndex = states.findIndex(state => normalizeText(state) === normalizeText(city.state));
    return {
      name: normalizeText(city.name),
      stateAliases: new Set([normalizeText(city.state), normalizeText(stateNames[stateIndex] || "")].filter(Boolean)),
    };
  });
  const fromDate = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
  const toDate = dateTo ? new Date(`${dateTo}T00:00:00`) : null;
  if (toDate) toDate.setDate(toDate.getDate() + 1);

  const filtered = (index ?? []).filter((order: any) => {
    const internalNumber = normalizeIdentifier(order.os_number);
    const externalNumber = normalizeIdentifier(order.external_os_number);
    const matchesNumber = osNeedles.length === 0 || osNeedles.some(needle => internalNumber.includes(needle) || (matchOrderNumberOrExternal && externalNumber.includes(needle)));
    const matchesExternal = matchOrderNumberOrExternal || !externalNeedle || externalNumber.includes(externalNeedle);
    const matchesSerial = !serialNeedle || normalizeIdentifier(order.serial_number).includes(serialNeedle);
    const customer = order.customer || {};
    const matchesDocument = !documentNeedle || [customer.document, customer.cnpj].some(value => normalizeDigits(value).includes(documentNeedle));
    const orderState = normalizeText(order.service_state);
    const orderCity = normalizeText(order.service_city);
    const matchesState = selectedStates.size === 0 || selectedStates.has(orderState);
    const matchesCity = cityFilters.length === 0 || cityFilters.some(city => city.name === orderCity && city.stateAliases.has(orderState));
    const createdAt = order.created_at ? new Date(order.created_at) : null;
    const matchesPeriod = !fromDate && !toDate ? true : !!createdAt && (!fromDate || createdAt >= fromDate) && (!toDate || createdAt < toDate);
    return matchesNumber && matchesExternal && matchesSerial && matchesDocument && (!statusId || order.status_id === statusId) && (!situationId || order.situation_id === situationId) && (!orderType || order.order_type === orderType) && (!serviceTypeId || order.service_type_id === serviceTypeId) && matchesState && matchesCity && matchesPeriod;
  });

  const sorted = sort ? [...filtered].sort((left: any, right: any) => {
    const leftNumber = Number(String(left.os_number ?? "").match(/\d+/)?.[0] ?? Number.POSITIVE_INFINITY);
    const rightNumber = Number(String(right.os_number ?? "").match(/\d+/)?.[0] ?? Number.POSITIVE_INFINITY);
    const numberComparison = leftNumber - rightNumber;
    if (numberComparison !== 0) return sort === "asc" ? numberComparison : -numberComparison;
    const dateComparison = String(left.created_at ?? "").localeCompare(String(right.created_at ?? ""));
    return sort === "asc" ? dateComparison : -dateComparison;
  }) : [...filtered].sort((left: any, right: any) => {
    const statusComparison = orderStatusPriority(left) - orderStatusPriority(right);
    if (statusComparison !== 0) return statusComparison;
    return String(right.created_at ?? "").localeCompare(String(left.created_at ?? ""));
  });

  const safeSize = Math.max(1, pageSize);
  const start = (Math.max(1, page) - 1) * safeSize;
  const ids = sorted.slice(start, start + safeSize).map((order: any) => order.id);
  if (ids.length === 0) return { items: [], total: sorted.length };

  const { data, error } = await supabase
    .from("service_orders")
    .select(ORDER_LIST_SELECT)
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (error) throw error;
  const byId = new Map((data ?? []).map((order: any) => [order.id, order]));
  return { items: ids.map(id => byId.get(id)).filter(Boolean), total: sorted.length };
}
