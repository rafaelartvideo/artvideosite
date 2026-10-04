import { getActiveOrganizationId } from "@/lib/active-organization";
import { supabase } from "@/lib/supabase";
import { getMediaById, getPublicStorageUrl } from "@/shared/infrastructure/media.repository";

export type SaveCompanySettingsScope = "full" | "partner" | "branding";

export type CompanySettings = {
  company_name: string;
  company_legal_name: string;
  company_cnpj: string;
  company_state_registration: string;
  company_municipal_registration: string;
  company_phone: string;
  company_email: string;
  company_zip_code: string;
  company_street: string;
  company_number: string;
  company_complement: string;
  company_neighborhood: string;
  company_city: string;
  company_state: string;
  company_logo_media_id: string;
  company_menu_logo_media_id: string;
};

export const EMPTY_COMPANY_SETTINGS: CompanySettings = {
  company_name: "",
  company_legal_name: "",
  company_cnpj: "",
  company_state_registration: "",
  company_municipal_registration: "",
  company_phone: "",
  company_email: "",
  company_zip_code: "",
  company_street: "",
  company_number: "",
  company_complement: "",
  company_neighborhood: "",
  company_city: "",
  company_state: "",
  company_logo_media_id: "",
  company_menu_logo_media_id: "",
};

function text(value: unknown) {
  return value == null ? "" : String(value);
}

function fromRow(row: any, organizationSettings?: any): CompanySettings {
  if (!row) return { ...EMPTY_COMPANY_SETTINGS };
  const officialSettings = organizationSettings && typeof organizationSettings === "object"
    ? organizationSettings
    : {};
  return {
    company_name: text(row.name),
    company_legal_name: text(row.legal_name),
    company_cnpj: text(row.document),
    company_state_registration: text(officialSettings.state_registration),
    company_municipal_registration: text(officialSettings.municipal_registration),
    company_phone: text(row.phone),
    company_email: text(row.email),
    company_zip_code: text(row.zip_code),
    company_street: text(row.street),
    company_number: text(row.number),
    company_complement: text(row.complement),
    company_neighborhood: text(row.neighborhood),
    company_city: text(row.city),
    company_state: text(row.state),
    company_logo_media_id: text(row.logo_media_id),
    company_menu_logo_media_id: text(row.menu_logo_media_id),
  };
}

export async function getCompanySettings(organizationId?: string | null): Promise<CompanySettings> {
  const resolvedOrganizationId = organizationId || await getActiveOrganizationId();
  const { data, error } = await supabase.rpc("load_company_settings_v1", {
    p_organization_id: resolvedOrganizationId,
  });
  if (error) throw error;
  const bootstrap = (data || {}) as Record<string, unknown>;
  return fromRow(bootstrap.company, bootstrap.organization_settings);
}

export async function saveCompanySettings(
  settings: CompanySettings,
  updatedBy: string | null,
  organizationId?: string | null,
  scope: SaveCompanySettingsScope = "full",
) {
  const resolvedOrganizationId = organizationId || await getActiveOrganizationId();
  const now = new Date().toISOString();
  const commonPayload = {
    organization_id: resolvedOrganizationId,
    updated_by: updatedBy,
    updated_at: now,
  };
  const brandingPayload = {
    logo_media_id: settings.company_logo_media_id || null,
    menu_logo_media_id: settings.company_menu_logo_media_id || null,
  };
  const contactPayload = {
    phone: settings.company_phone.trim() || null,
    email: settings.company_email.trim() || null,
  };
  const payload = scope === "branding"
    ? { ...commonPayload, ...brandingPayload }
    : scope === "partner"
      ? { ...commonPayload, ...contactPayload, ...brandingPayload }
      : {
          ...commonPayload,
          name: settings.company_name.trim(),
          legal_name: settings.company_legal_name.trim() || null,
          document: settings.company_cnpj.trim() || null,
          ...contactPayload,
          zip_code: settings.company_zip_code.trim() || null,
          street: settings.company_street.trim() || null,
          number: settings.company_number.trim() || null,
          complement: settings.company_complement.trim() || null,
          neighborhood: settings.company_neighborhood.trim() || null,
          city: settings.company_city.trim() || null,
          state: settings.company_state.trim().toUpperCase() || null,
          ...brandingPayload,
        };

  const updateSettings = async () => (supabase as any)
    .from("organization_company_settings")
    .update(payload)
    .eq("organization_id", resolvedOrganizationId)
    .select("*")
    .maybeSingle();

  const firstAttempt = await updateSettings();
  if (firstAttempt.error) throw firstAttempt.error;
  if (firstAttempt.data) {
    return fromRow(firstAttempt.data, {
      state_registration: settings.company_state_registration,
      municipal_registration: settings.company_municipal_registration,
    });
  }

  // A singular UPDATE previously produced HTTP 406 when the row did not exist
  // (or when RLS prevented PostgREST from returning it). Resolve the organization
  // so we can safely initialize non-partner settings without overwriting an
  // existing row.
  const { data: organization, error: organizationError } = await (supabase as any)
    .from("organizations")
    .select("id,name,legal_name,document,organization_type,settings")
    .eq("id", resolvedOrganizationId)
    .maybeSingle();
  if (organizationError) throw organizationError;
  if (!organization) throw new Error("Empresa ativa não encontrada.");

  const organizationSettings = organization.settings && typeof organization.settings === "object"
    ? organization.settings as Record<string, unknown>
    : {};

  if (organization.organization_type === "partner") {
    const normalized = (value: unknown) => text(value).trim();
    const partnerStateMatches =
      normalized(organizationSettings.phone) === normalized(settings.company_phone)
      && normalized(organizationSettings.email) === normalized(settings.company_email)
      && normalized(organizationSettings.company_logo_media_id) === normalized(settings.company_logo_media_id)
      && normalized(organizationSettings.menu_logo_media_id) === normalized(settings.company_menu_logo_media_id);

    if (partnerStateMatches) return { ...settings };
    throw new Error("Não foi possível localizar os dados da empresa parceira para salvar a identidade visual.");
  }

  const preferred = (primary: unknown, fallback: unknown) => {
    const primaryText = text(primary).trim();
    return primaryText || text(fallback).trim() || null;
  };
  const seedPayload = {
    organization_id: resolvedOrganizationId,
    name: preferred(settings.company_name, organization.name) || "Empresa",
    legal_name: preferred(settings.company_legal_name, organization.legal_name),
    document: preferred(settings.company_cnpj, organization.document),
    phone: preferred(settings.company_phone, organizationSettings.phone),
    email: preferred(settings.company_email, organizationSettings.email),
    zip_code: preferred(settings.company_zip_code, organizationSettings.zip_code),
    street: preferred(settings.company_street, organizationSettings.street),
    number: preferred(settings.company_number, organizationSettings.number),
    complement: preferred(settings.company_complement, organizationSettings.complement),
    neighborhood: preferred(settings.company_neighborhood, organizationSettings.neighborhood),
    city: preferred(settings.company_city, organizationSettings.city),
    state: preferred(settings.company_state, organizationSettings.state)?.toUpperCase() || null,
    logo_media_id: settings.company_logo_media_id || preferred(null, organizationSettings.company_logo_media_id),
    menu_logo_media_id: settings.company_menu_logo_media_id || preferred(null, organizationSettings.menu_logo_media_id),
    updated_by: updatedBy,
    updated_at: now,
  };

  const { error: seedError } = await (supabase as any)
    .from("organization_company_settings")
    .upsert(seedPayload, { onConflict: "organization_id", ignoreDuplicates: true });
  if (seedError) throw seedError;

  const retry = await updateSettings();
  if (retry.error) throw retry.error;
  if (retry.data) {
    return fromRow(retry.data, {
      state_registration: settings.company_state_registration,
      municipal_registration: settings.company_municipal_registration,
    });
  }

  // The mutation may be allowed while the SELECT policy intentionally hides
  // the returned row. At this point both writes completed without an error, so
  // keep the local form state instead of converting an empty response into 406.
  return { ...settings };
}

export async function getCompanyPrintContext(organizationId: string) {
  const settings = await getCompanySettings(organizationId);
  let logoUrl = "";
  if (settings.company_logo_media_id) {
    try {
      const media = await getMediaById(settings.company_logo_media_id);
      if (media?.bucket_id && media?.storage_path) {
        logoUrl = getPublicStorageUrl(media.bucket_id, media.storage_path);
      }
    } catch (error) {
      console.warn("[DOCUMENTS] company logo could not be loaded:", error);
    }
  }

  const address = [
    [settings.company_street, settings.company_number].filter(Boolean).join(", "),
    settings.company_complement,
    settings.company_neighborhood,
    [settings.company_city, settings.company_state].filter(Boolean).join(" - "),
    settings.company_zip_code ? `CEP ${settings.company_zip_code}` : "",
  ].filter(Boolean).join(" · ");

  return {
    name: settings.company_name || "Empresa",
    subtitle: settings.company_legal_name || "Assistência Técnica",
    logoUrl,
    document: settings.company_cnpj,
    stateRegistration: settings.company_state_registration,
    municipalRegistration: settings.company_municipal_registration,
    phone: settings.company_phone,
    email: settings.company_email,
    address,
  };
}
