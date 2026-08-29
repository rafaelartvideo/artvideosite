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
