import { supabase } from "@/lib/supabase";

export const getServiceOrderDetail = (serviceOrderId: string) =>
  supabase
    .from("service_orders")
    .select("is_solved,solved_at,completed_at,completed_by,situation_started_at,service_price,parts_total,discount_percentage,discount_amount,final_total,cannot_be_solved,cannot_be_solved_reason,assigned_profile:profiles!assigned_to(id,full_name),technician_links:service_order_technicians(employee_id,employee:employees(id,full_name,function_name,is_active)),seller_links:service_order_sellers(employee_id,employee:employees(id,full_name,function_name,is_active))")
    .eq("id", serviceOrderId)
    .maybeSingle();

export const listServiceOrderStatusHistory = (serviceOrderId: string) =>
  supabase
    .from("service_order_status_history")
    .select("*, order_status:order_statuses(name)")
    .eq("service_order_id", serviceOrderId)
    .order("created_at", { ascending: false });

export const listServiceOrderHistoryNotes = (serviceOrderId: string) =>
  supabase
    .from("service_order_history_notes")
    .select("id,service_order_id,author_id,content,created_at")
    .eq("service_order_id", serviceOrderId)
    .order("created_at", { ascending: false });

export const createServiceOrderHistoryNote = ({
  serviceOrderId,
  authorId,
  content,
}: {
  serviceOrderId: string;
  authorId: string;
  content: string;
}) =>
  supabase
    .from("service_order_history_notes")
    .insert({ service_order_id: serviceOrderId, author_id: authorId, content })
    .select("id,service_order_id,author_id,content,created_at")
    .single();

export const listServiceOrderMedia = (serviceOrderId: string) =>
  supabase
    .from("service_order_media")
    .select("id,media_id,sort_order,media:media(id,file_name,bucket_id,storage_path)")
    .eq("service_order_id", serviceOrderId)
    .order("sort_order");

export const listServiceOrderUsedItems = (serviceOrderId: string) =>
  supabase
    .from("service_order_used_items")
    .select("*, inventory_item:inventory_items(id,name,sku,unit)")
    .eq("service_order_id", serviceOrderId)
    .order("created_at", { ascending: false });

export const loadOrdersWorkspace = () =>
  Promise.all([
    supabase
      .from("service_orders")
      .select("*, order_status:order_statuses(id,name,color), situation:os_situations(id,name,color,hours), customer:customers(id,customer_type,full_name,phone,whatsapp,document,email,trade_name,legal_name,cnpj,state_registration,birth_date,addresses:customer_addresses(*)), service:services(id,title), assigned_profile:profiles!assigned_to(id,full_name), seller:employees!seller_id(id,full_name), technician:employees!technician_id(id,full_name), technician_links:service_order_technicians(employee_id,employee:employees(id,full_name,function_name,is_active)), seller_links:service_order_sellers(employee_id,employee:employees(id,full_name,function_name,is_active)), service_type:service_types(id,title), general_service:general_services(id,name,price,max_discount_percentage), equipment_type:equipment_types(id,name), equipment_brand:equipment_brands(id,name), equipment_model:equipment_models(id,name)")
      .order("created_at", { ascending: false }),
    supabase.from("order_statuses").select("id,name,color,sort_order").order("sort_order"),
    supabase.from("os_situations").select("id,name,color,hours,sort_order").eq("is_active", true).order("sort_order"),
    supabase.from("profiles").select("id,full_name").order("full_name"),
    supabase.from("services").select("id,title").eq("is_active", true).order("title"),
    supabase.from("brands").select("id,name").eq("is_active", true).order("name"),
    supabase.from("products").select("id,name").eq("is_active", true).order("name"),
    supabase.from("equipment_types").select("id,name").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("equipment_brands").select("id,name,equipment_type_id").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("equipment_models").select("id,name,equipment_brand_id").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("employees").select("id,full_name,is_active").eq("is_active", true).order("full_name"),
    supabase.from("general_services").select("id,name,price,max_discount_percentage,is_active,sort_order").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("service_types").select("id,title,description,forecast_days,is_active,sort_order").eq("is_active", true).order("sort_order").order("title"),
    supabase.from("service_type_situations").select("service_type_id,situation_id,use_default_hours,sla_hours,sort_order,situation:os_situations(id,name,color,hours,is_active)").order("sort_order"),
  ]);

export const getServiceOrderResolutionState = (serviceOrderId: string) =>
  supabase
    .from("service_orders")
    .select("is_solved,diagnosis,solution,cannot_be_solved,cannot_be_solved_reason")
    .eq("id", serviceOrderId)
    .maybeSingle();

export const markServiceOrderSolvable = (serviceOrderId: string) =>
  supabase
    .from("service_orders")
    .update({ cannot_be_solved: false, cannot_be_solved_reason: null })
    .eq("id", serviceOrderId);

export const markServiceOrderUnsolvable = (
  serviceOrderId: string,
  reason: string,
) =>
  supabase
    .from("service_orders")
    .update({ cannot_be_solved: true, cannot_be_solved_reason: reason })
    .eq("id", serviceOrderId);

export const listOrderStatusOptions = () =>
  supabase.from("order_statuses").select("id,name,sort_order").order("sort_order");

export const deleteServiceOrder = (serviceOrderId: string) =>
  supabase.from("service_orders").delete().eq("id", serviceOrderId);

export const updateServiceOrderStatus = (
  serviceOrderId: string,
  statusId: string,
) =>
  supabase.from("service_orders").update({ status_id: statusId }).eq("id", serviceOrderId);

export const insertServiceOrderStatusHistory = (
  serviceOrderId: string,
  statusId: string,
  createdBy: string | null,
) =>
  supabase.from("service_order_status_history").insert({
    service_order_id: serviceOrderId,
    status_id: statusId,
    notes: null,
    is_visible_to_customer: false,
    created_by: createdBy,
  });

export const updateServiceOrderSituation = (
  serviceOrderId: string,
  situationId: string | null,
) =>
  supabase
    .from("service_orders")
    .update({ situation_id: situationId })
    .eq("id", serviceOrderId)
    .select("situation_id")
    .maybeSingle();

export const createServiceOrder = (payload: Record<string, unknown>) =>
  supabase
    .from("service_orders")
    .insert(payload)
    .select("id,os_number,external_os_number")
    .single();

export const updateServiceOrder = (
  serviceOrderId: string,
  payload: Record<string, unknown>,
) => supabase.from("service_orders").update(payload).eq("id", serviceOrderId);

export const clearServiceOrderTechnicians = (serviceOrderId: string) =>
  supabase
    .from("service_order_technicians")
    .delete()
    .eq("service_order_id", serviceOrderId);

export const clearServiceOrderSellers = (serviceOrderId: string) =>
  supabase
    .from("service_order_sellers")
    .delete()
    .eq("service_order_id", serviceOrderId);

export const insertServiceOrderTechnicians = (
  serviceOrderId: string,
  employeeIds: string[],
) =>
  supabase.from("service_order_technicians").insert(
    employeeIds.map((employeeId) => ({
      service_order_id: serviceOrderId,
      employee_id: employeeId,
    })),
  );

export const insertServiceOrderSellers = (
  serviceOrderId: string,
  employeeIds: string[],
) =>
  supabase.from("service_order_sellers").insert(
    employeeIds.map((employeeId) => ({
      service_order_id: serviceOrderId,
      employee_id: employeeId,
    })),
  );

export const listServiceOrderMediaLinks = (serviceOrderId: string) =>
  supabase
    .from("service_order_media")
    .select("id,media_id")
    .eq("service_order_id", serviceOrderId);

export const deleteServiceOrderMediaLink = (linkId: string) =>
  supabase.from("service_order_media").delete().eq("id", linkId);

export const updateServiceOrderMediaSortOrder = (
  linkId: string,
  sortOrder: number,
) =>
  supabase
    .from("service_order_media")
    .update({ sort_order: sortOrder })
    .eq("id", linkId);

export const insertServiceOrderMedia = (
  serviceOrderId: string,
  mediaId: string,
  sortOrder: number,
) =>
  supabase.from("service_order_media").insert({
    service_order_id: serviceOrderId,
    media_id: mediaId,
    sort_order: sortOrder,
  });

type ResolutionUsedItem = {
  inventory_item_id: string;
  quantity: number;
};

export const resolveServiceOrder = ({
  serviceOrderId,
  diagnosis,
  solution,
  usedItems,
}: {
  serviceOrderId: string;
  diagnosis: string;
  solution: string;
  usedItems: ResolutionUsedItem[];
}) =>
  supabase.rpc("resolve_service_order", {
    p_service_order_id: serviceOrderId,
    p_diagnosis: diagnosis,
    p_solution: solution,
    p_used_items: usedItems,
  });

export const getFullServiceOrder = (serviceOrderId: string) =>
  supabase
    .from("service_orders")
    .select("*, order_status:order_statuses(id,name,color), situation:os_situations(id,name,color,hours), customer:customers(id,customer_type,full_name,phone,whatsapp,document,email,trade_name,legal_name,cnpj,state_registration,birth_date,addresses:customer_addresses(*)), service:services(id,title), assigned_profile:profiles!assigned_to(id,full_name), seller:employees!seller_id(id,full_name), technician:employees!technician_id(id,full_name), service_type:service_types(id,title), general_service:general_services(id,name,price,max_discount_percentage), equipment_type:equipment_types(id,name), equipment_brand:equipment_brands(id,name), equipment_model:equipment_models(id,name)")
    .eq("id", serviceOrderId)
    .maybeSingle();

export const listApprovedResolutionPartRequests = (serviceOrderId: string) =>
  supabase
    .from("service_order_part_requests")
    .select("id,purpose,status,items:service_order_part_request_items(id,inventory_item_id,approved_quantity,source_test_item_id,inventory_item:inventory_items(id,name,sku,unit,quantity))")
    .eq("service_order_id", serviceOrderId)
    .eq("status", "APPROVED")
    .eq("purpose", "RESOLUTION");
