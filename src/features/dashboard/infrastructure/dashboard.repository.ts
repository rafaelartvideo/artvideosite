import { supabase } from "@/lib/supabase";
import type { DashboardAccess, DashboardOverview } from "../domain/dashboard";

type DashboardQueryInput = {
  periodDays: number;
  access: DashboardAccess;
};

const emptyRows = () => Promise.resolve({ data: [], error: null });

function dashboardDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function loadDashboardOverview({ periodDays, access }: DashboardQueryInput): Promise<DashboardOverview> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const agendaEnd = new Date(today);
  agendaEnd.setDate(agendaEnd.getDate() + Math.max(7, periodDays));

  const [ordersResult, registrationsResult, inventoryResult, appointmentsResult, quotesResult] = await Promise.all([
    access.orders
      ? supabase
          .from("service_orders")
          .select("id,os_number,customer_id,quote_request_id,technician_id,created_at,updated_at,completed_at,solved_at,final_total,discount_amount,order_status:order_statuses(name,color),situation:os_situations(name,color),customer:customers(full_name),technician:employees!technician_id(id,full_name),technician_links:service_order_technicians(employee_id,employee:employees(id,full_name))")
          .order("created_at", { ascending: false })
          .limit(2000)
      : emptyRows(),
    access.registrations
      ? supabase
          .from("entities")
          .select("id,name,person_type,is_active,created_at,roles:entity_roles(role,is_active)")
          .order("created_at", { ascending: false })
          .limit(2000)
      : emptyRows(),
    access.inventory
      ? supabase.from("inventory_items").select("id,name,sku,unit,quantity,min_quantity,purchase_price,sale_price,is_active").order("name").limit(2000)
      : emptyRows(),
    access.agenda
      ? supabase
          .from("appointments")
          .select("id,appointment_date,period,start_time,is_return,customer:customers(full_name),situation:appointment_situations(name,color)")
          .gte("appointment_date", dashboardDate(today))
          .lte("appointment_date", dashboardDate(agendaEnd))
          .order("appointment_date")
          .limit(1000)
      : emptyRows(),
    access.quotes
      ? supabase
          .from("quote_requests")
          .select("id,protocol,customer_id,created_at,estimated_price,final_price,request_status:request_statuses(name,color),customer:customers(full_name),service:services(title),brand:brands(name)")
          .order("created_at", { ascending: false })
          .limit(2000)
      : emptyRows(),
  ]);

  const error = ordersResult.error || registrationsResult.error || inventoryResult.error || appointmentsResult.error || quotesResult.error;
  if (error) throw error;

  return {
    orders: (ordersResult.data ?? []) as unknown as DashboardOverview["orders"],
    registrations: (registrationsResult.data ?? []) as unknown as DashboardOverview["registrations"],
    inventory: (inventoryResult.data ?? []) as unknown as DashboardOverview["inventory"],
    appointments: (appointmentsResult.data ?? []) as unknown as DashboardOverview["appointments"],
    quotes: (quotesResult.data ?? []) as unknown as DashboardOverview["quotes"],
  };
}
