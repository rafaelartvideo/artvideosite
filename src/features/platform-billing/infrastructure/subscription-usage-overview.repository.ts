import { supabase } from "@/lib/supabase";

export type UnionUsageHealth = "normal" | "warning" | "critical" | "reached" | "unconfigured";

export type UnionSubscriptionUsageRow = {
  organization_id: string;
  organization_name: string;
  organization_status: string;
  organization_type: string;
  subscription: null | {
    id: string;
    plan_id: string;
    plan_name: string;
    status: string;
    next_due_date?: string | null;
    net_amount: number;
  };
  limits: Record<string, number>;
  usage: Record<string, number>;
  usage_sources: Record<string, string>;
  monitoring: {
    mode: "monitor" | "warn" | "enforce";
    warning_percent: number;
    critical_percent: number;
  };
  addons_count: number;
  addons_amount: number;
  contracted_monthly_amount: number;
  database_bytes_estimate: number;
  database_measured_at?: string | null;
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

export async function loadUnionSubscriptionUsageOverview(): Promise<UnionSubscriptionUsageRow[]> {
  const { data, error } = await supabase.rpc("load_union_subscription_usage_overview_v1");
  if (error) throw error;

  const rows = Array.isArray((data as any)?.rows) ? (data as any).rows : [];
  return rows.map((row: any) => ({
    ...row,
    subscription: row.subscription
      ? {
          ...row.subscription,
          net_amount: Number(row.subscription.net_amount || 0),
        }
      : null,
    limits: numericRecord(row.limits),
    usage: numericRecord(row.usage),
    usage_sources: row.usage_sources && typeof row.usage_sources === "object" ? row.usage_sources : {},
    monitoring: {
      mode: row.monitoring?.mode || "monitor",
      warning_percent: Number(row.monitoring?.warning_percent || 80),
      critical_percent: Number(row.monitoring?.critical_percent || 90),
    },
    addons_count: Number(row.addons_count || 0),
    addons_amount: Number(row.addons_amount || 0),
    contracted_monthly_amount: Number(row.contracted_monthly_amount || 0),
    database_bytes_estimate: Number(row.database_bytes_estimate || 0),
    database_measured_at: row.database_measured_at ? String(row.database_measured_at) : null,
  }));
}

const monitoredPairs = [
  ["users", "users"],
  ["storage_bytes", "storage_bytes"],
  ["pdv_terminals", "pdv_terminals"],
  ["field_devices", "field_devices"],
  ["queue_units", "queue_units"],
  ["pbx_extensions", "pbx_extensions"],
  ["ai_credits", "ai_credits"],
  ["max_os_photos", "os_photos_per_order"],
  ["max_os_attachments", "os_attachments_per_order"],
  ["max_product_photos", "product_photos"],
  ["pbx_recording_bytes", "pbx_recording_storage_bytes"],
] as const;

function metricHealth(
  used: number,
  limit: number,
  warningPercent: number,
  criticalPercent: number,
): Exclude<UnionUsageHealth, "unconfigured"> {
  if (limit <= 0) return used > 0 ? "warning" : "normal";
  const percent = (used / limit) * 100;
  if (percent >= 100) return "reached";
  if (percent >= criticalPercent) return "critical";
  if (percent >= warningPercent) return "warning";
  return "normal";
}

const healthRank: Record<UnionUsageHealth, number> = {
  normal: 0,
  unconfigured: 1,
  warning: 2,
  critical: 3,
  reached: 4,
};

export function usageHealth(row: UnionSubscriptionUsageRow): UnionUsageHealth {
  if (!row.subscription) return "unconfigured";

  let current: UnionUsageHealth = "normal";
  for (const [usageKey, limitKey] of monitoredPairs) {
    const health = metricHealth(
      Number(row.usage[usageKey] || 0),
      Number(row.limits[limitKey] || 0),
      row.monitoring.warning_percent,
      row.monitoring.critical_percent,
    );
    if (healthRank[health] > healthRank[current]) current = health;
  }
  return current;
}
