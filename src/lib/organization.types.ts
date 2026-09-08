export type OrganizationType = "parent" | "partner";
export type OrganizationStatus = "active" | "suspended" | "cancelled";

export interface OrganizationAccess {
  organization_id: string;
  organization_name: string;
  legal_name: string | null;
  slug: string;
  organization_type: OrganizationType;
  organization_status: OrganizationStatus;
  parent_organization_id: string | null;
  membership_id: string;
  membership_organization_id: string;
  role_id: string | null;
  is_owner: boolean;
  is_direct_member: boolean;
  enabled_modules: string[];
}

export interface OrganizationModule {
  module_key: string;
  module_name: string;
  category: "management" | "operation" | "site";
  sort_order: number;
  limits: Record<string, unknown>;
  settings: Record<string, unknown>;
}
