import { supabase } from "@/lib/supabase";
import type { DashboardAccess, DashboardOverview } from "../domain/dashboard";

type DashboardQueryInput = {
  organizationId: string;
  periodDays: number;
  access: DashboardAccess;
};

export async function loadDashboardOverview({ organizationId, periodDays, access }: DashboardQueryInput): Promise<DashboardOverview> {
  const { data, error } = await supabase.rpc("load_admin_dashboard_overview_v2", {
    p_organization_id: organizationId,
    p_period_days: Math.max(1, Math.trunc(periodDays || 30)),
    p_orders: access.orders,
    p_registrations: access.registrations,
    p_inventory: access.inventory,
    p_inventory_costs: access.inventoryCosts,
    p_agenda: access.agenda,
    p_quotes: access.quotes,
  });
  if (error) throw error;

  const overview = (data || {}) as Record<string, unknown>;
  return {
    orders: (Array.isArray(overview.orders) ? overview.orders : []) as DashboardOverview["orders"],
    registrations: (Array.isArray(overview.registrations) ? overview.registrations : []) as DashboardOverview["registrations"],
    inventory: (Array.isArray(overview.inventory) ? overview.inventory : []) as DashboardOverview["inventory"],
    appointments: (Array.isArray(overview.appointments) ? overview.appointments : []) as DashboardOverview["appointments"],
    quotes: (Array.isArray(overview.quotes) ? overview.quotes : []) as DashboardOverview["quotes"],
  };
}
