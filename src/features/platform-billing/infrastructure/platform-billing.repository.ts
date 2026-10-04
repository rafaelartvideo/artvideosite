import { supabase } from "@/lib/supabase";

export type UnionPlatformDashboardData = {
  metrics: {
    companies_total: number;
    companies_active: number;
    companies_suspended: number;
    monitored_companies: number;
    monitored_orders_total: number;
    monitored_orders_open: number;
    subscriptions_active: number;
    subscriptions_past_due: number;
    mrr: number;
    receivable_month: number;
    received_month: number;
    overdue_total: number;
  };
  recent_companies: Array<{
    id: string;
    name: string;
    status: string;
    created_at: string;
  }>;
  recent_orders: Array<{
    id: string;
    os_number: string;
    external_os_number?: string | null;
    updated_at: string;
    organization_name: string;
    situation_name?: string | null;
    situation_color?: string | null;
  }>;
};

export type PlatformBillingPlan = {
  id: string;
  name: string;
  description?: string | null;
  amount: number;
  interval_months: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PlatformSubscription = {
  id: string;
  organization_id: string;
  organization_name: string;
  plan_id: string;
  plan_name: string;
  status: "trial" | "active" | "past_due" | "suspended" | "cancelled";
  start_date: string;
  next_due_date?: string | null;
  amount: number;
  discount_amount: number;
  net_amount: number;
  billing_day?: number | null;
  notes?: string | null;
  updated_at: string;
};

export type PlatformCharge = {
  id: string;
  subscription_id: string;
  organization_id: string;
  organization_name: string;
  plan_name: string;
  reference_month: string;
  due_date: string;
  amount: number;
  status: "pending" | "paid" | "overdue" | "cancelled";
  paid_at?: string | null;
  payment_method?: string | null;
  notes?: string | null;
  updated_at: string;
};

export type PlatformCompanyOption = { id: string; name: string };

export type UnionPlatformFinanceData = {
  metrics: {
    active_subscriptions: number;
    past_due_subscriptions: number;
    mrr: number;
    open_receivables: number;
    overdue_receivables: number;
    received_month: number;
  };
  plans: PlatformBillingPlan[];
  subscriptions: PlatformSubscription[];
  charges: PlatformCharge[];
  companies: PlatformCompanyOption[];
};

function asNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizeDashboard(data: any): UnionPlatformDashboardData {
  return {
    metrics: {
      companies_total: asNumber(data?.metrics?.companies_total),
      companies_active: asNumber(data?.metrics?.companies_active),
      companies_suspended: asNumber(data?.metrics?.companies_suspended),
      monitored_companies: asNumber(data?.metrics?.monitored_companies),
      monitored_orders_total: asNumber(data?.metrics?.monitored_orders_total),
      monitored_orders_open: asNumber(data?.metrics?.monitored_orders_open),
      subscriptions_active: asNumber(data?.metrics?.subscriptions_active),
      subscriptions_past_due: asNumber(data?.metrics?.subscriptions_past_due),
      mrr: asNumber(data?.metrics?.mrr),
      receivable_month: asNumber(data?.metrics?.receivable_month),
      received_month: asNumber(data?.metrics?.received_month),
      overdue_total: asNumber(data?.metrics?.overdue_total),
    },
    recent_companies: Array.isArray(data?.recent_companies) ? data.recent_companies : [],
    recent_orders: Array.isArray(data?.recent_orders) ? data.recent_orders : [],
  };
}

export async function loadUnionPlatformDashboard(): Promise<UnionPlatformDashboardData> {
  const { data, error } = await supabase.rpc("load_union_platform_dashboard_v2");
  if (error) throw error;
  return normalizeDashboard(data);
}

export async function loadUnionPlatformFinance(): Promise<UnionPlatformFinanceData> {
  const { data, error } = await supabase.rpc("load_union_platform_finance_v2");
  if (error) throw error;
  return {
    metrics: {
      active_subscriptions: asNumber((data as any)?.metrics?.active_subscriptions),
      past_due_subscriptions: asNumber((data as any)?.metrics?.past_due_subscriptions),
      mrr: asNumber((data as any)?.metrics?.mrr),
      open_receivables: asNumber((data as any)?.metrics?.open_receivables),
      overdue_receivables: asNumber((data as any)?.metrics?.overdue_receivables),
      received_month: asNumber((data as any)?.metrics?.received_month),
    },
    plans: (Array.isArray((data as any)?.plans) ? (data as any).plans : []).map((item: any) => ({
      ...item,
      amount: asNumber(item.amount),
      interval_months: asNumber(item.interval_months) || 1,
    })),
    subscriptions: (Array.isArray((data as any)?.subscriptions) ? (data as any).subscriptions : []).map((item: any) => ({
      ...item,
      amount: asNumber(item.amount),
      discount_amount: asNumber(item.discount_amount),
      net_amount: asNumber(item.net_amount),
    })),
    charges: (Array.isArray((data as any)?.charges) ? (data as any).charges : []).map((item: any) => ({
      ...item,
      amount: asNumber(item.amount),
    })),
    companies: Array.isArray((data as any)?.companies) ? (data as any).companies : [],
  };
}

export async function savePlatformBillingPlan(input: {
  id?: string | null;
  name: string;
  description?: string | null;
  amount: number;
  intervalMonths: number;
  isActive: boolean;
}) {
  const { data, error } = await supabase.rpc("save_union_platform_billing_plan", {
    p_id: input.id || null,
    p_name: input.name,
    p_description: input.description || null,
    p_amount: input.amount,
    p_interval_months: input.intervalMonths,
    p_is_active: input.isActive,
  });
  if (error) throw error;
  return String(data);
}

export async function savePlatformSubscription(input: {
  id?: string | null;
  organizationId: string;
  planId: string;
  status: PlatformSubscription["status"];
  startDate: string;
  nextDueDate?: string | null;
  amount: number;
  discountAmount: number;
  billingDay?: number | null;
  notes?: string | null;
}) {
  const { data, error } = await supabase.rpc("save_union_platform_subscription", {
    p_id: input.id || null,
    p_organization_id: input.organizationId,
    p_plan_id: input.planId,
    p_status: input.status,
    p_start_date: input.startDate,
    p_next_due_date: input.nextDueDate || null,
    p_amount: input.amount,
    p_discount_amount: input.discountAmount,
    p_billing_day: input.billingDay ?? null,
    p_notes: input.notes || null,
  });
  if (error) throw error;
  return String(data);
}

export async function generatePlatformCharge(subscriptionId: string, dueDate: string) {
  const { data, error } = await supabase.rpc("generate_union_platform_charge", {
    p_subscription_id: subscriptionId,
    p_due_date: dueDate,
  });
  if (error) throw error;
  return String(data);
}

export async function settlePlatformCharge(chargeId: string, paymentMethod?: string, notes?: string) {
  const { error } = await supabase.rpc("settle_union_platform_charge", {
    p_charge_id: chargeId,
    p_payment_method: paymentMethod || null,
    p_notes: notes || null,
  });
  if (error) throw error;
}
