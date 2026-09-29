import { supabase } from "@/lib/supabase";

export type UnionOrderMonitorListInput = {
  search?: string;
  organizationId?: string;
  serviceTypeId?: string;
  statusId?: string;
  situationId?: string;
  page: number;
  pageSize: number;
};

export type UnionOrderMonitorRow = {
  id: string;
  organization_id: string;
  organization_name: string;
  os_number: string;
  external_os_number: string | null;
  created_at: string;
  updated_at: string;
  scheduled_at: string | null;
  serial_number: string | null;
  model: string | null;
  priority: string | null;
  order_type: string | null;
  service_type_id: string;
  service_type_title: string;
  status_id: string | null;
  status_name: string | null;
  status_color: string | null;
  situation_id: string | null;
  situation_name: string | null;
  situation_color: string | null;
  customer_id: string | null;
  customer_name: string;
  equipment_type_name: string;
  equipment_brand_name: string;
  equipment_model_name: string;
  technician_name: string | null;
  seller_name: string | null;
};

export type UnionOrderMonitorPage = {
  total: number;
  items: UnionOrderMonitorRow[];
};

export type UnionOrderMonitorOptions = {
  companies: Array<{ id: string; name: string }>;
  serviceTypes: Array<{ id: string; organization_id: string; organization_name: string; title: string }>;
  statuses: Array<{ id: string; organization_id: string; organization_name: string; name: string; color: string | null }>;
  situations: Array<{ id: string; organization_id: string; organization_name: string; name: string; color: string | null }>;
};

export async function listUnionMonitoredOrders(input: UnionOrderMonitorListInput): Promise<UnionOrderMonitorPage> {
  const { data, error } = await supabase.rpc("list_union_monitored_orders", {
    p_search: input.search?.trim() || null,
    p_organization_id: input.organizationId || null,
    p_service_type_id: input.serviceTypeId || null,
    p_status_id: input.statusId || null,
    p_situation_id: input.situationId || null,
    p_page: input.page,
    p_page_size: input.pageSize,
  });
  if (error) throw error;
  const parsed = (data ?? {}) as Partial<UnionOrderMonitorPage>;
  return {
    total: Number(parsed.total ?? 0),
    items: Array.isArray(parsed.items) ? parsed.items : [],
  };
}

export async function getUnionOrderMonitorOptions(): Promise<UnionOrderMonitorOptions> {
  const { data, error } = await supabase.rpc("get_union_order_monitor_options");
  if (error) throw error;
  const parsed = (data ?? {}) as Partial<UnionOrderMonitorOptions>;
  return {
    companies: Array.isArray(parsed.companies) ? parsed.companies : [],
    serviceTypes: Array.isArray(parsed.serviceTypes) ? parsed.serviceTypes : [],
    statuses: Array.isArray(parsed.statuses) ? parsed.statuses : [],
    situations: Array.isArray(parsed.situations) ? parsed.situations : [],
  };
}

export async function getUnionMonitoredOrder(serviceOrderId: string): Promise<any> {
  const { data, error } = await supabase.rpc("get_union_monitored_order", {
    p_service_order_id: serviceOrderId,
  });
  if (error) throw error;
  return data;
}
