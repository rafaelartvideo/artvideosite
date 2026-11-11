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

const DASHBOARD_PAGE_SIZE = 60;
const DASHBOARD_MAX_ROWS = 2000;
type DashboardCursor = { id: string; created_at: string };

export async function loadDashboardOverview({ organizationId, periodDays, access }: DashboardQueryInput): Promise<DashboardOverview> {
  const safePeriod = Math.max(1, Math.trunc(periodDays || 30));

  // Fetch pages before joining their JSON rows. Each request stays below the
  // PostgREST statement timeout without dropping older records from totals.
  const readPage = async (
    flags: Pick<DashboardAccess, "orders" | "registrations" | "inventory" | "inventoryCosts" | "agenda" | "quotes">,
    ordersBefore: DashboardCursor | null = null,
    registrationsBefore: DashboardCursor | null = null,
    pageSize = DASHBOARD_PAGE_SIZE,
  ): Promise<DashboardOverview> => {
    const { data, error } = await supabase.rpc("load_admin_dashboard_overview_v3", {
      p_organization_id: organizationId,
      p_period_days: safePeriod,
      p_orders: flags.orders,
      p_registrations: flags.registrations,
      p_inventory: flags.inventory,
      p_inventory_costs: flags.inventoryCosts,
      p_agenda: flags.agenda,
      p_quotes: flags.quotes,
      p_order_before_at: ordersBefore?.created_at ?? null,
      p_order_before_id: ordersBefore?.id ?? null,
      p_registration_before_at: registrationsBefore?.created_at ?? null,
      p_registration_before_id: registrationsBefore?.id ?? null,
      p_page_size: pageSize,
    });
    if (error) throw error;
    const result = (data || {}) as Record<string, unknown>;
    return {
      orders: Array.isArray(result.orders) ? result.orders as DashboardOverview["orders"] : [],
      registrations: Array.isArray(result.registrations) ? result.registrations as DashboardOverview["registrations"] : [],
      inventory: Array.isArray(result.inventory) ? result.inventory as DashboardOverview["inventory"] : [],
      appointments: Array.isArray(result.appointments) ? result.appointments as DashboardOverview["appointments"] : [],
      quotes: Array.isArray(result.quotes) ? result.quotes as DashboardOverview["quotes"] : [],
    };
  };

  const loadCompleteList = async <K extends "orders" | "registrations">(key: K): Promise<DashboardOverview[K]> => {
    const all: Array<DashboardOverview["orders"][number] | DashboardOverview["registrations"][number]> = [];
    let cursor: DashboardCursor | null = null;
    let iterations = 0;
    while (all.length < DASHBOARD_MAX_ROWS) {
      if (++iterations > Math.ceil(DASHBOARD_MAX_ROWS / DASHBOARD_PAGE_SIZE)) {
        throw new Error("Paginação do dashboard não avançou.");
      }
      const batchSize = Math.min(DASHBOARD_PAGE_SIZE, DASHBOARD_MAX_ROWS - all.length);
      const flags = {
        orders: key === "orders",
        registrations: key === "registrations",
        inventory: false,
        inventoryCosts: false,
        agenda: false,
        quotes: false,
      };
      const page = await readPage(flags, key === "orders" ? cursor : null, key === "registrations" ? cursor : null, batchSize);
      const rows = page[key];
      all.push(...rows);
      if (rows.length < batchSize || all.length >= DASHBOARD_MAX_ROWS) break;
      const last = rows[rows.length - 1];
      if (!last?.id || !last.created_at || (cursor && last.id === cursor.id)) {
        throw new Error("Cursor inválido na paginação do dashboard.");
      }
      cursor = { id: last.id, created_at: last.created_at };
    }
    return all as DashboardOverview[K];
  };

  const otherFlags = {
    orders: false,
    registrations: false,
    inventory: access.inventory,
    inventoryCosts: access.inventoryCosts,
    agenda: access.agenda,
    quotes: access.quotes,
  };
  const [orders, registrations, additional] = await Promise.all([
    access.orders ? loadCompleteList("orders") : Promise.resolve([] as DashboardOverview["orders"]),
    access.registrations ? loadCompleteList("registrations") : Promise.resolve([] as DashboardOverview["registrations"]),
    (access.inventory || access.agenda || access.quotes)
      ? readPage(otherFlags)
      : Promise.resolve({ inventory: [], appointments: [], quotes: [] } as Pick<DashboardOverview, "inventory" | "appointments" | "quotes">),
  ]);

  return {
    orders,
    registrations,
    inventory: additional.inventory,
    appointments: additional.appointments,
    quotes: additional.quotes,
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
