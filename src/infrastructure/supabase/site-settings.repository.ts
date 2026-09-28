import { supabase } from "@/lib/supabase";
import { getArtVideoOrganizationId } from "@/lib/organization-identities";

export type SiteSettings = Record<string, unknown>;

type SiteSettingRow = {
  setting_key: string;
  setting_value: unknown;
};

export async function getSiteSettings(): Promise<SiteSettings> {
  const organizationId = await getArtVideoOrganizationId();
  const { data, error } = await supabase
    .from("site_settings")
    .select("setting_key, setting_value")
    .eq("organization_id", organizationId);

  if (error) throw error;

  return Object.fromEntries(
    ((data ?? []) as SiteSettingRow[]).map((row) => [
      row.setting_key,
      row.setting_value,
    ]),
  );
}

export async function saveSiteSettings(
  settings: SiteSettings,
  updatedBy: string | null,
): Promise<void> {
  const organizationId = await getArtVideoOrganizationId();
  for (const [settingKey, settingValue] of Object.entries(settings)) {
    const { error } = await supabase
      .from("site_settings")
      .upsert(
        {
          setting_key: settingKey,
          setting_value: settingValue,
          organization_id: organizationId,
          updated_by: updatedBy,
        },
        { onConflict: "setting_key" },
      );

    if (error) throw error;
  }
}
