import { supabase } from "@/lib/supabase";

export const getServiceOrderDetail = (serviceOrderId: string) =>
  supabase
    .from("service_orders")
    .select("is_solved,solved_at,cannot_be_solved,cannot_be_solved_reason,assigned_profile:profiles!assigned_to(id,full_name),technician_links:service_order_technicians(employee_id,employee:employees(id,full_name,function_name,is_active)),seller_links:service_order_sellers(employee_id,employee:employees(id,full_name,function_name,is_active))")
    .eq("id", serviceOrderId)
    .maybeSingle();

export const listServiceOrderStatusHistory = (serviceOrderId: string) =>
  supabase
    .from("service_order_status_history")
    .select("*, order_status:order_statuses(name)")
    .eq("service_order_id", serviceOrderId)
    .order("created_at", { ascending: false });

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
      .select("*, order_status:order_statuses(id,name,color), situation:os_situations(id,name,color,hours), customer:customers(id,customer_type,full_name,phone,whatsapp,document,email,trade_name,legal_name,cnpj,state_registration,birth_date,addresses:customer_addresses(*)), service:services(id,title), assigned_profile:profiles!assigned_to(id,full_name), seller:employees!seller_id(id,full_name), technician:employees!technician_id(id,full_name), technician_links:service_order_technicians(employee_id,employee:employees(id,full_name,function_name,is_active)), seller_links:service_order_sellers(employee_id,employee:employees(id,full_name,function_name,is_active)), service_type:service_types(id,title), general_service:general_services(id,name), equipment_type:equipment_types(id,name), equipment_brand:equipment_brands(id,name), equipment_model:equipment_models(id,name)")
      .order("created_at", { ascending: false }),
    supabase.from("order_statuses").select("id,name,color,sort_order").order("sort_order"),
    supabase.from("os_situations").select("id,name,color,sort_order").eq("is_active", true).order("sort_order"),
    supabase.from("profiles").select("id,full_name").order("full_name"),
    supabase.from("services").select("id,title").eq("is_active", true).order("title"),
    supabase.from("brands").select("id,name").eq("is_active", true).order("name"),
    supabase.from("products").select("id,name").eq("is_active", true).order("name"),
    supabase.from("equipment_types").select("id,name").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("equipment_brands").select("id,name,equipment_type_id").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("equipment_models").select("id,name,equipment_brand_id").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("employees").select("id,full_name,is_active").eq("is_active", true).order("full_name"),
    supabase.from("general_services").select("id,name,is_active,sort_order").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("service_types").select("id,title,description,forecast_days,is_active,sort_order").eq("is_active", true).order("sort_order").order("title"),
    supabase.from("service_type_situations").select("service_type_id,situation_id,use_default_hours,sla_hours,sort_order,situation:os_situations(id,name,color,hours,is_active)").order("sort_order"),
  ]);
