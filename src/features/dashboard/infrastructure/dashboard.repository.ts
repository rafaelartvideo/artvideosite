import { supabase } from "@/lib/supabase";
import type {
  DashboardAccess,
  DashboardOrderGroupItem,
  DashboardOrdersSummary,
  DashboardOverview,
} from "../domain/dashboard";

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


export async function loadDashboardOrdersSummary({
  organizationId,
  periodDays,
}: {
  organizationId: string;
  periodDays: number;
}): Promise<DashboardOrdersSummary> {
  const { data, error } = await supabase.rpc("load_dashboard_orders_summary_v2", {
    p_organization_id: organizationId,
    p_period_days: Math.max(1, Math.trunc(periodDays || 30)),
  });
  if (error) throw error;

  const summary = (data || {}) as Partial<DashboardOrdersSummary>;
  return {
    total_orders: Number(summary.total_orders || 0),
    orders_in_period: Number(summary.orders_in_period || 0),
    active_orders: Number(summary.active_orders || 0),
    waiting_orders: Number(summary.waiting_orders || 0),
    completed_in_period: Number(summary.completed_in_period || 0),
    situations: Array.isArray(summary.situations) ? summary.situations : [],
    statuses: Array.isArray(summary.statuses) ? summary.statuses : [],
  };
}

export async function loadDashboardOrderGroupPage({
  organizationId,
  kind,
  groupId,
  slaState = null,
  page,
  pageSize = 10,
}: {
  organizationId: string;
  kind: "situation" | "status";
  groupId: string | null;
  slaState?: "success" | "warning" | "danger" | "neutral" | null;
  page: number;
  pageSize?: number;
}): Promise<DashboardOrderGroupItem[]> {
  const { data, error } = await supabase.rpc("load_dashboard_order_group_page_v2", {
    p_organization_id: organizationId,
    p_kind: kind,
    p_group_id: groupId,
    p_sla_state: kind === "situation" ? slaState : null,
    p_page: Math.max(1, Math.trunc(page || 1)),
    p_page_size: Math.min(50, Math.max(1, Math.trunc(pageSize || 10))),
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as DashboardOrderGroupItem[];
}
