import { supabase } from "@/lib/supabase";

export type BillingLimitDefinition = {
  key: string;
  label: string;
  description?: string | null;
  unit: "count" | "bytes" | "days" | "credits";
  sort_order: number;
};

export type BillingFeatureDefinition = {
  key: string;
  label: string;
  description?: string | null;
  sort_order: number;
};

export type BillingSystemModule = {
  key: string;
  name: string;
  description?: string | null;
  category: string;
  sort_order: number;
};

export type BillingAddon = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  amount: number;
  billing_type: "fixed" | "per_unit" | "usage";
  module_key?: string | null;
  limit_deltas: Record<string, number>;
  feature_grants: Record<string, boolean>;
  settings: Record<string, unknown>;
  is_active: boolean;
};

export type SubscriptionAddonConfig = {
  id: string;
  subscription_id: string;
  addon_id: string;
  quantity: number;
  amount: number;
  status: "active" | "cancelled";
  notes?: string | null;
};

export type SubscriptionLimitOverride = {
  subscription_id: string;
  key: string;
  mode: "replace" | "add";
  value: number;
  notes?: string | null;
};

export type SubscriptionFeatureOverride = {
  subscription_id: string;
  key: string;
  enabled: boolean;
  notes?: string | null;
};

export type UnionSubscriptionConfigurationData = {
  limit_definitions: BillingLimitDefinition[];
  feature_definitions: BillingFeatureDefinition[];
  system_modules: BillingSystemModule[];
  plan_limits: Array<{ plan_id: string; key: string; value: number }>;
  plan_features: Array<{ plan_id: string; key: string; enabled: boolean }>;
  plan_modules: Array<{ plan_id: string; module_key: string; included: boolean }>;
  addons: BillingAddon[];
  subscription_addons: SubscriptionAddonConfig[];
  limit_overrides: SubscriptionLimitOverride[];
  feature_overrides: SubscriptionFeatureOverride[];
};

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, raw]) => [key, asNumber(raw)]));
}

function booleanRecord(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, raw]) => [key, Boolean(raw)]));
}

export async function loadUnionSubscriptionConfiguration(): Promise<UnionSubscriptionConfigurationData> {
  const { data, error } = await supabase.rpc("load_union_subscription_configuration_v1");
  if (error) throw error;
  const raw = (data || {}) as any;
  return {
    limit_definitions: Array.isArray(raw.limit_definitions) ? raw.limit_definitions : [],
    feature_definitions: Array.isArray(raw.feature_definitions) ? raw.feature_definitions : [],
    system_modules: Array.isArray(raw.system_modules) ? raw.system_modules : [],
    plan_limits: (Array.isArray(raw.plan_limits) ? raw.plan_limits : []).map((item: any) => ({ ...item, value: asNumber(item.value) })),
    plan_features: (Array.isArray(raw.plan_features) ? raw.plan_features : []).map((item: any) => ({ ...item, enabled: Boolean(item.enabled) })),
    plan_modules: (Array.isArray(raw.plan_modules) ? raw.plan_modules : []).map((item: any) => ({ ...item, included: Boolean(item.included) })),
    addons: (Array.isArray(raw.addons) ? raw.addons : []).map((item: any) => ({
      ...item,
      amount: asNumber(item.amount),
      limit_deltas: numberRecord(item.limit_deltas),
      feature_grants: booleanRecord(item.feature_grants),
      settings: item.settings && typeof item.settings === "object" ? item.settings : {},
      is_active: Boolean(item.is_active),
    })),
    subscription_addons: (Array.isArray(raw.subscription_addons) ? raw.subscription_addons : []).map((item: any) => ({
      ...item,
      quantity: asNumber(item.quantity),
      amount: asNumber(item.amount),
    })),
    limit_overrides: (Array.isArray(raw.limit_overrides) ? raw.limit_overrides : []).map((item: any) => ({ ...item, value: asNumber(item.value) })),
    feature_overrides: (Array.isArray(raw.feature_overrides) ? raw.feature_overrides : []).map((item: any) => ({ ...item, enabled: Boolean(item.enabled) })),
  };
}

export async function saveUnionPlanConfiguration(input: {
  planId: string;
  limits: Record<string, number>;
  features: Record<string, boolean>;
  modules: string[];
}) {
  const { error } = await supabase.rpc("save_union_plan_configuration_v1", {
    p_plan_id: input.planId,
    p_limits: input.limits,
    p_features: input.features,
    p_modules: input.modules,
  });
  if (error) throw error;
}

export async function saveUnionBillingAddon(input: {
  id?: string | null;
  code: string;
  name: string;
  description?: string | null;
  amount: number;
  billingType: BillingAddon["billing_type"];
  moduleKey?: string | null;
  limitDeltas: Record<string, number>;
  featureGrants: Record<string, boolean>;
  isActive: boolean;
}) {
  const { data, error } = await supabase.rpc("save_union_billing_addon_v1", {
    p_id: input.id || null,
    p_code: input.code,
    p_name: input.name,
    p_description: input.description || null,
    p_amount: input.amount,
    p_billing_type: input.billingType,
    p_module_key: input.moduleKey || null,
    p_limit_deltas: input.limitDeltas,
    p_feature_grants: input.featureGrants,
    p_is_active: input.isActive,
  });
  if (error) throw error;
  return String(data);
}

export async function saveUnionSubscriptionConfiguration(input: {
  subscriptionId: string;
  addons: Array<{ addon_id: string; quantity: number; amount: number; notes?: string | null }>;
  limitOverrides: Record<string, { mode: "replace" | "add"; value: number; notes?: string | null }>;
  featureOverrides: Record<string, { enabled: boolean; notes?: string | null }>;
}) {
  const { error } = await supabase.rpc("save_union_subscription_configuration_v1", {
    p_subscription_id: input.subscriptionId,
    p_addons: input.addons,
    p_limit_overrides: input.limitOverrides,
    p_feature_overrides: input.featureOverrides,
  });
  if (error) throw error;
}
