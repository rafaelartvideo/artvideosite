import { supabase } from "@/lib/supabase";

export const loadDashboardOverview = () =>
  Promise.all([
    supabase
      .from("quote_requests")
      .select("id, status_id, request_status:request_statuses(name)"),
    supabase
      .from("service_orders")
      .select("id, os_number, tracking_token, status_id, created_at, updated_at, customer_id, order_status:order_statuses(name,color)"),
    supabase
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("quote_requests")
      .select("id, protocol, created_at, customer_id, service_id, brand_id, request_status:request_statuses(name), customer:customers(full_name), service:services(title), brand:brands(name)")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("service_orders")
      .select("id, os_number, service:services(title), created_at, updated_at, status_id, order_status:order_statuses(name,color), customer:customers(full_name)")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
