import { supabase } from "@/lib/supabase";

export type BusinessSegment = {
  code: string;
  name: string;
  description: string;
  icon: string;
};

export type CompanySegmentsData = {
  segments: BusinessSegment[];
  primaryCode: string | null;
  additionalCodes: string[];
  configured: boolean;
};

export async function loadCompanySegments(organizationId: string): Promise<CompanySegmentsData> {
  const { data, error } = await supabase.rpc("get_company_segments_v1", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  const value = (data || {}) as Partial<CompanySegmentsData>;
  return {
    segments: Array.isArray(value.segments) ? value.segments : [],
    primaryCode: typeof value.primaryCode === "string" ? value.primaryCode : null,
    additionalCodes: Array.isArray(value.additionalCodes) ? value.additionalCodes : [],
    configured: value.configured === true,
  };
}

export async function saveCompanySegments(
  organizationId: string,
  primaryCode: string,
  additionalCodes: string[],
): Promise<void> {
  const { error } = await supabase.rpc("save_company_segments_v1", {
    p_organization_id: organizationId,
    p_primary_code: primaryCode,
    p_additional_codes: additionalCodes.filter(code => code !== primaryCode),
  });
  if (error) throw error;
}
