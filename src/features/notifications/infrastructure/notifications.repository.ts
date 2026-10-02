import { supabase } from "@/lib/supabase";

export type NotificationEventType = "created" | "updated" | "deleted";

export type AdminNotification = {
  id: number;
  organization_id: string;
  audit_log_id: number | null;
  actor_user_id: string | null;
  actor_name_snapshot: string | null;
  module_key: string;
  event_type: NotificationEventType;
  entity_type: string;
  entity_id: string | null;
  title: string;
  message: string;
  route: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
};

type NotificationRow = Omit<AdminNotification, "read_at">;

export async function listAdminNotifications(
  organizationId: string,
  userId: string,
  limit = 50,
): Promise<AdminNotification[]> {
  const { data: notificationRows, error: notificationError } = await supabase
    .from("organization_notifications")
    .select("id,organization_id,audit_log_id,actor_user_id,actor_name_snapshot,module_key,event_type,entity_type,entity_id,title,message,route,metadata,created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (notificationError) throw notificationError;

  const notifications = (notificationRows || []) as NotificationRow[];
  if (notifications.length === 0) return [];

  const ids = notifications.map(notification => notification.id);
  const { data: readRows, error: readError } = await supabase
    .from("organization_notification_reads")
    .select("notification_id,read_at")
    .eq("user_id", userId)
    .in("notification_id", ids);

  if (readError) throw readError;

  const readByNotification = new Map<number, string>();
  for (const row of readRows || []) {
    if (typeof row.notification_id === "number" && typeof row.read_at === "string") {
      readByNotification.set(row.notification_id, row.read_at);
    }
  }

  return notifications.map(notification => ({
    ...notification,
    read_at: readByNotification.get(notification.id) || null,
  }));
}

export async function countUnreadAdminNotifications(organizationId: string) {
  const { data, error } = await supabase.rpc(
    "count_unread_organization_notifications_v1",
    { p_organization_id: organizationId },
  );
  if (error) throw error;
  return Number(data || 0);
}

export async function markAdminNotificationRead(
  notification: Pick<AdminNotification, "id" | "read_at">,
  userId: string,
) {
  if (notification.read_at) return;

  const { error } = await supabase
    .from("organization_notification_reads")
    .upsert(
      {
        notification_id: notification.id,
        user_id: userId,
        read_at: new Date().toISOString(),
      },
      { onConflict: "notification_id,user_id" },
    );

  if (error) throw error;
}

export async function markAllAdminNotificationsRead(organizationId: string) {
  const { error } = await supabase.rpc(
    "mark_all_organization_notifications_read_v1",
    { p_organization_id: organizationId },
  );
  if (error) throw error;
}

export function subscribeToAdminNotifications(
  organizationId: string,
  onNotification: (notification: AdminNotification) => void,
) {
  const channel = supabase
    .channel(`organization-notifications:${organizationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "organization_notifications",
        filter: `organization_id=eq.${organizationId}`,
      },
      payload => {
        const row = payload.new as NotificationRow;
        if (!row?.id) return;
        onNotification({ ...row, read_at: null });
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
