import { getActiveOrganizationId } from "@/lib/active-organization";
import { supabase } from "@/lib/supabase";
import { getMediaById, getPublicStorageUrl } from "@/shared/infrastructure/media.repository";

export type CompanySettings = {
  company_name: string;
  company_legal_name: string;
  company_cnpj: string;
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

function fromRow(row: any): CompanySettings {
  if (!row) return { ...EMPTY_COMPANY_SETTINGS };
  return {
    company_name: text(row.name),
    company_legal_name: text(row.legal_name),
    company_cnpj: text(row.document),
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
  const { data, error } = await (supabase as any)
    .from("organization_company_settings")
    .select("organization_id,name,legal_name,document,phone,email,zip_code,street,number,complement,neighborhood,city,state,logo_media_id,menu_logo_media_id,updated_at")
    .eq("organization_id", resolvedOrganizationId)
    .maybeSingle();
  if (error) throw error;
  return fromRow(data);
}

export async function saveCompanySettings(
  settings: CompanySettings,
  updatedBy: string | null,
  organizationId?: string | null,
) {
  const resolvedOrganizationId = organizationId || await getActiveOrganizationId();
  const payload = {
    organization_id: resolvedOrganizationId,
    name: settings.company_name.trim(),
    legal_name: settings.company_legal_name.trim() || null,
    document: settings.company_cnpj.trim() || null,
    phone: settings.company_phone.trim() || null,
    email: settings.company_email.trim() || null,
    zip_code: settings.company_zip_code.trim() || null,
    street: settings.company_street.trim() || null,
    number: settings.company_number.trim() || null,
    complement: settings.company_complement.trim() || null,
    neighborhood: settings.company_neighborhood.trim() || null,
    city: settings.company_city.trim() || null,
    state: settings.company_state.trim().toUpperCase() || null,
    logo_media_id: settings.company_logo_media_id || null,
    menu_logo_media_id: settings.company_menu_logo_media_id || null,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await (supabase as any)
    .from("organization_company_settings")
    .upsert(payload, { onConflict: "organization_id" })
    .select("*")
    .single();
  if (error) throw error;
  return fromRow(data);
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
    phone: settings.company_phone,
    email: settings.company_email,
    address,
  };
}
