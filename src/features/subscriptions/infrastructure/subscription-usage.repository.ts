import { supabase } from "@/lib/supabase";

export type OrganizationSubscriptionStatus = "trial" | "active" | "past_due" | "suspended" | "cancelled";

export type OrganizationPlanUsageData = {
  organization_id: string;
  organization_name: string;
  subscription: null | {
    id: string;
    plan_id: string;
    plan_name: string;
    status: OrganizationSubscriptionStatus;
    start_date: string;
    next_due_date?: string | null;
    amount: number;
    discount_amount: number;
    net_amount: number;
    billing_day?: number | null;
  };
  limits: Record<string, number>;
  usage: Record<string, number>;
  addons: Array<{
    id: string;
    code: string;
    name: string;
    description?: string | null;
    quantity: number;
    amount: number;
    module_key?: string | null;
    starts_at?: string | null;
  }>;
};

function numericRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, raw]) => {
      const parsed = Number(raw ?? 0);
      return [key, Number.isFinite(parsed) ? parsed : 0];
    }),
  );
}

export async function loadOrganizationPlanUsage(organizationId: string): Promise<OrganizationPlanUsageData> {
  const { data, error } = await supabase.rpc("load_organization_plan_usage_v1", {
    p_organization_id: organizationId,
  });
  if (error) throw error;

  const raw = (data || {}) as any;
  const subscription = raw.subscription
    ? {
        ...raw.subscription,
        amount: Number(raw.subscription.amount || 0),
        discount_amount: Number(raw.subscription.discount_amount || 0),
        net_amount: Number(raw.subscription.net_amount || 0),
        billing_day: raw.subscription.billing_day == null ? null : Number(raw.subscription.billing_day),
      }
    : null;

  return {
    organization_id: String(raw.organization_id || organizationId),
    organization_name: String(raw.organization_name || "Empresa"),
    subscription,
    limits: numericRecord(raw.limits),
    usage: numericRecord(raw.usage),
    addons: (Array.isArray(raw.addons) ? raw.addons : []).map((addon: any) => ({
      ...addon,
      quantity: Number(addon.quantity || 0),
      amount: Number(addon.amount || 0),
    })),
  };
}
