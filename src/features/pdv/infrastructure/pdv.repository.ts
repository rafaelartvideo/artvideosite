import { supabase } from "@/lib/supabase";

export type PdvSettings = {
  organization_id: string;
  default_cash_account_id: string | null;
  require_open_cash: boolean;
  allow_sale_without_customer: boolean;
  allow_negative_stock: boolean;
};

export type PdvCashAccount = {
  id: string;
  name: string;
  balance: number;
  allows_cash_session: boolean;
};

export type PdvCashSession = {
  id: string;
  status: "open";
  opening_expected_amount: number;
  opening_counted_amount: number;
  opening_difference: number;
  opening_note: string | null;
  opened_at: string;
  opened_by: string | null;
};

export type PdvBootstrap = {
  configured: boolean;
  cash_session_enabled: boolean;
  settings: PdvSettings | null;
  cash_accounts: PdvCashAccount[];
  cash_account: Pick<PdvCashAccount, "id" | "name" | "balance"> | null;
  open_session: PdvCashSession | null;
  readiness: {
    active_products: number;
    active_payment_methods: number;
  };
};

export type PdvProduct = {
  product_id: string;
  inventory_item_id: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number | null;
  cover_media_id: string | null;
  quantity: number;
  min_quantity: number;
  unit: "un" | "cx" | string;
  conversion_factor: number;
};

function requiredOrganizationId(value: string) {
  const organizationId = String(value || "").trim();
  if (!organizationId) throw new Error("Empresa ativa não encontrada.");
  return organizationId;
}

export async function loadPdvBootstrap(organizationId: string): Promise<PdvBootstrap> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("get_pdv_bootstrap_v1", {
    p_organization_id: org,
  });
  if (error) throw error;
  return data as PdvBootstrap;
}

export async function configurePdvQuickSetup(organizationId: string): Promise<PdvBootstrap> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("configure_pdv_quick_setup", {
    p_organization_id: org,
  });
  if (error) throw error;
  return data as PdvBootstrap;
}

export async function savePdvSettings(
  organizationId: string,
  input: Omit<PdvSettings, "organization_id">,
  userId?: string | null,
): Promise<PdvSettings> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase
    .from("pdv_settings")
    .update({
      default_cash_account_id: input.default_cash_account_id,
      require_open_cash: input.require_open_cash,
      allow_sale_without_customer: input.allow_sale_without_customer,
      allow_negative_stock: input.allow_negative_stock,
      updated_by: userId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", org)
    .select("organization_id,default_cash_account_id,require_open_cash,allow_sale_without_customer,allow_negative_stock")
    .single();
  if (error) throw error;
  return data as PdvSettings;
}

export async function searchPdvProducts(
  organizationId: string,
  search = "",
  limit = 30,
): Promise<PdvProduct[]> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase.rpc("search_pdv_products_v1", {
    p_organization_id: org,
    p_search: search,
    p_limit: limit,
  });
  if (error) throw error;
  return (data || []) as PdvProduct[];
}
