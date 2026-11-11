import { supabase } from "@/lib/supabase";

export type NotificationEventType = "created" | "updated" | "deleted";

export type AdminNotification = {
  id: number;
  organization_id: string;
  recipient_user_id?: string | null;
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
  delivery_allowed?: boolean;
};

type NotificationRow = Omit<AdminNotification, "read_at">;

export type AdminNotificationsBootstrap = {
  items: AdminNotification[];
  unreadCount: number;
};

// All consumers share one in-flight RPC per user+organization. A failed
// server call enters a bounded cooldown instead of triggering a request storm
// from Realtime, React Query and the home page at the same time.
const notificationLoadsInFlight = new Map<string, Promise<AdminNotificationsBootstrap>>();
const notificationLoadFailures = new Map<string, {
  until: number;
  attempts: number;
  error: unknown;
}>();

export async function loadAdminNotifications(
  organizationId: string,
  limit = 50,
  userId?: string,
): Promise<AdminNotificationsBootstrap> {
  // User identity is part of the key: never share an in-flight response
  // between users belonging to the same organization.
  const cacheKey = userId ? `${userId}:${organizationId}:${limit}` : null;
  const pending = cacheKey ? notificationLoadsInFlight.get(cacheKey) : null;
  if (pending) return pending;

  const failure = cacheKey ? notificationLoadFailures.get(cacheKey) : null;
  if (failure && Date.now() < failure.until) throw failure.error;

  const request = (async (): Promise<AdminNotificationsBootstrap> => {
    const { data, error } = await supabase.rpc("load_admin_notifications_v1", {
      p_organization_id: organizationId,
      p_limit: limit,
    }).abortSignal(AbortSignal.timeout(12_000));
    if (error) throw error;

    const bootstrap = (data || {}) as Record<string, unknown>;
    return {
      items: Array.isArray(bootstrap.items) ? bootstrap.items as AdminNotification[] : [],
      unreadCount: Number(bootstrap.unreadCount || 0),
    };
  })();

  if (cacheKey) notificationLoadsInFlight.set(cacheKey, request);
  try {
    const snapshot = await request;
    if (cacheKey) notificationLoadFailures.delete(cacheKey);
    return snapshot;
  } catch (error) {
    if (cacheKey) {
      const attempts = Math.min((failure?.attempts || 0) + 1, 4);
      const cooldown = Math.min(15_000 * (2 ** (attempts - 1)), 120_000);
      notificationLoadFailures.set(cacheKey, {
        until: Date.now() + cooldown,
        attempts,
        error,
      });
    }
    throw error;
  } finally {
    if (cacheKey && notificationLoadsInFlight.get(cacheKey) === request) {
      notificationLoadsInFlight.delete(cacheKey);
    }
  }
}

export async function listAdminNotifications(
  organizationId: string,
  userId: string,
  limit = 50,
): Promise<AdminNotification[]> {
  const { data: notificationRows, error: notificationError } = await supabase
    .from("organization_notifications")
    .select("id,organization_id,recipient_user_id,audit_log_id,actor_user_id,actor_name_snapshot,module_key,event_type,entity_type,entity_id,title,message,route,metadata,created_at")
    .eq("organization_id", organizationId)
    // Do not show actions performed by the current user as new notifications.
    .or(`actor_user_id.is.null,actor_user_id.neq.${userId}`)
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

export async function dismissAdminNotification(notificationId: number, organizationId: string) {
  const { error } = await supabase.rpc("dismiss_organization_notification_v1", {
    p_notification_id: notificationId,
    p_organization_id: organizationId,
  });
  if (error) throw error;
}

export async function dismissAllAdminNotifications(organizationId: string) {
  const { error } = await supabase.rpc("dismiss_all_organization_notifications_v1", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
}

export function subscribeToAdminNotifications(
  organizationId: string,
  userId: string,
  handlers: {
    onNotification: (notification: AdminNotification) => void;
    onStateChange?: () => void;
  },
) {
  const channel = supabase
    .channel(`organization-notifications:${organizationId}:${userId}`)
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
        // Filtro de defesa adicional à RLS para notificações individuais.
        if (row.recipient_user_id && row.recipient_user_id !== userId) return;
        if (row.actor_user_id === userId) return;
        handlers.onNotification({ ...row, read_at: null });
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "organization_notification_reads",
        filter: `user_id=eq.${userId}`,
      },
      () => handlers.onStateChange?.(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
