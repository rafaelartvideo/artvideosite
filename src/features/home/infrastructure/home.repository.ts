import { supabase } from "@/lib/supabase";

export type HomeAnnouncementPriority = "info" | "attention" | "important" | "critical";

export type HomeAnnouncement = {
  id: string;
  title: string;
  message: string;
  priority: HomeAnnouncementPriority;
  starts_at: string;
  ends_at?: string | null;
  is_pinned: boolean;
  requires_acknowledgment: boolean;
  link_url?: string | null;
  acknowledged_at?: string | null;
  created_at: string;
};

export type PlatformAnnouncementAdmin = HomeAnnouncement & {
  is_active: boolean;
  updated_at: string;
  target_organization_ids: string[];
  target_organization_names: string[];
  acknowledgment_count: number;
};

export type AnnouncementCompanyOption = {
  id: string;
  name: string;
  status: string;
};

export type PlatformAnnouncementsBootstrap = {
  announcements: PlatformAnnouncementAdmin[];
  companies: AnnouncementCompanyOption[];
};

export async function loadHomeAnnouncements(organizationId: string): Promise<HomeAnnouncement[]> {
  const { data, error } = await supabase.rpc("load_home_announcements_v1", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data as HomeAnnouncement[] : [];
}

export async function acknowledgeHomeAnnouncement(
  announcementId: string,
  organizationId: string,
) {
  const { data, error } = await supabase.rpc("acknowledge_home_announcement_v1", {
    p_announcement_id: announcementId,
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return typeof data === "string" ? data : new Date().toISOString();
}

export async function loadPlatformAnnouncementsAdmin(): Promise<PlatformAnnouncementsBootstrap> {
  const { data, error } = await supabase.rpc("load_platform_announcements_admin_v1");
  if (error) throw error;
  const value = (data || {}) as Record<string, unknown>;
  return {
    announcements: (Array.isArray(value.announcements) ? value.announcements : []).map((item: any) => ({
      ...item,
      target_organization_ids: Array.isArray(item.target_organization_ids) ? item.target_organization_ids : [],
      target_organization_names: Array.isArray(item.target_organization_names) ? item.target_organization_names : [],
      acknowledgment_count: Number(item.acknowledgment_count || 0),
    })),
    companies: Array.isArray(value.companies) ? value.companies as AnnouncementCompanyOption[] : [],
  };
}

export async function savePlatformAnnouncement(input: {
  id?: string | null;
  title: string;
  message: string;
  priority: HomeAnnouncementPriority;
  startsAt: string;
  endsAt?: string | null;
  isPinned: boolean;
  requiresAcknowledgment: boolean;
  linkUrl?: string | null;
  isActive: boolean;
  targetOrganizationIds: string[];
}) {
  const { data, error } = await supabase.rpc("save_platform_announcement_v1", {
    p_id: input.id || null,
    p_title: input.title,
    p_message: input.message,
    p_priority: input.priority,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt || null,
    p_is_pinned: input.isPinned,
    p_requires_acknowledgment: input.requiresAcknowledgment,
    p_link_url: input.linkUrl || null,
    p_is_active: input.isActive,
    p_target_organization_ids: input.targetOrganizationIds,
  });
  if (error) throw error;
  return String(data);
}

export async function setPlatformAnnouncementActive(id: string, isActive: boolean) {
  const { error } = await supabase.rpc("set_platform_announcement_active_v1", {
    p_id: id,
    p_is_active: isActive,
  });
  if (error) throw error;
}
