import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  dismissAdminNotification,
  dismissAllAdminNotifications,
  loadAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  subscribeToAdminNotifications,
  type AdminNotification,
  type AdminNotificationsBootstrap,
} from "../infrastructure/notifications.repository";

export const adminNotificationsKey = (organizationId: string | null, userId: string | null) => [
  "admin-notifications",
  organizationId || "none",
  userId || "none",
] as const;

export function useAdminNotifications(
  organizationId: string | null | undefined,
  userId: string | null | undefined,
) {
  const queryClient = useQueryClient();
  const [liveQueue, setLiveQueue] = useState<AdminNotification[]>([]);
  const liveNotification = liveQueue[0] || null;
  const isWorkReminder = (notification: AdminNotification) =>
    notification.module_key === "workItems" && notification.entity_type === "work_item"
      && notification.title === "Lembrete de atividade";
  const enqueueLiveNotification = (notification: AdminNotification) => {
    setLiveQueue(current => {
      if (current.some(item => item.id === notification.id)) return current;
      // Reminders must not wait behind routine notifications, which may
      // otherwise occupy the popup for several seconds each.
      return isWorkReminder(notification)
        ? [notification, ...current].slice(0, 15)
        : [...current, notification].slice(0, 15);
    });
  };
  const normalizedOrganizationId = organizationId || null;
  const normalizedUserId = userId || null;
  const enabled = Boolean(normalizedOrganizationId && normalizedUserId);
  const queryKey = adminNotificationsKey(normalizedOrganizationId, normalizedUserId);

  const notificationsQuery = useQuery({
    queryKey,
    enabled,
    queryFn: () => loadAdminNotifications(normalizedOrganizationId!, 50),
    // O canal Realtime entrega novidades imediatamente. A verificação
    // periódica é só contingência para eventos perdidos/reconexão.
    // Não consulte novamente a cada troca de módulo ou foco da janela.
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    setLiveQueue([]);
    if (!normalizedOrganizationId || !normalizedUserId) return;

    return subscribeToAdminNotifications(normalizedOrganizationId, normalizedUserId, {
      onNotification: notification => {
        queryClient.setQueryData<AdminNotificationsBootstrap>(
          queryKey,
          current => ({
            items: [
              notification,
              ...(current?.items || []).filter(item => item.id !== notification.id),
            ].slice(0, 50),
            unreadCount: (current?.unreadCount || 0) + 1,
          }),
        );
        void queryClient.invalidateQueries({ queryKey: ["admin-home", "activity", normalizedOrganizationId] });
        enqueueLiveNotification(notification);
      },
      onStateChange: () => {
        void queryClient.invalidateQueries({ queryKey });
        void queryClient.invalidateQueries({ queryKey: ["admin-home", "activity", normalizedOrganizationId] });
      },
    });
  }, [normalizedOrganizationId, normalizedUserId, queryClient]);

  // The realtime INSERT can be missed if the page was closed, switched tabs,
  // the websocket reconnected, or the database cron fired during a reload.
  // Recover pending reminders from the actual server inbox on initial load,
  // focus and 60-second polling; dismissed/read notifications are not replayed.
  useEffect(() => {
    if (!enabled) return;
    const since = Date.now() - 24 * 60 * 60_000;
    const recentReminders = (notificationsQuery.data?.items || [])
      .filter(item => isWorkReminder(item)
        && !item.read_at && new Date(item.created_at).getTime() >= since)
      .slice(0, 15);
    if (recentReminders.length === 0) return;
    setLiveQueue(current => {
      const ids = new Set(current.map(item => item.id));
      const missing = recentReminders.filter(item => !ids.has(item.id));
      return missing.length ? [...missing, ...current].slice(0, 15) : current;
    });
  }, [enabled, notificationsQuery.data?.items]);

  useEffect(() => {
    if (!liveNotification || isWorkReminder(liveNotification)) return;
    const timeout = window.setTimeout(() =>
      setLiveQueue(current => current.filter(item => item.id !== liveNotification.id)), 7000);
    return () => window.clearTimeout(timeout);
  }, [liveNotification?.id]);

  const markRead = async (notification: AdminNotification) => {
    if (!normalizedOrganizationId || !normalizedUserId || notification.read_at) return;

    const readAt = new Date().toISOString();
    queryClient.setQueryData<AdminNotificationsBootstrap>(
      queryKey,
      current => ({
        items: (current?.items || []).map(item =>
          item.id === notification.id ? { ...item, read_at: readAt } : item,
        ),
        unreadCount: Math.max(0, (current?.unreadCount || 0) - 1),
      }),
    );

    try {
      await markAdminNotificationRead(notification, normalizedUserId);
    } catch (error) {
      void queryClient.invalidateQueries({ queryKey });
      throw error;
    }
  };

  const markAllRead = async () => {
    if (!normalizedOrganizationId || !normalizedUserId) return;

    const readAt = new Date().toISOString();
    queryClient.setQueryData<AdminNotificationsBootstrap>(
      queryKey,
      current => ({
        items: (current?.items || []).map(item => ({
          ...item,
          read_at: item.read_at || readAt,
        })),
        unreadCount: 0,
      }),
    );

    try {
      await markAllAdminNotificationsRead(normalizedOrganizationId);
    } finally {
      void queryClient.invalidateQueries({ queryKey });
    }
  };

  const dismiss = async (notification: AdminNotification) => {
    if (!normalizedOrganizationId || !normalizedUserId) return;

    queryClient.setQueryData<AdminNotificationsBootstrap>(
      queryKey,
      current => {
        const item = (current?.items || []).find(entry => entry.id === notification.id);
        return {
          items: (current?.items || []).filter(entry => entry.id !== notification.id),
          unreadCount: Math.max(0, (current?.unreadCount || 0) - (item && !item.read_at ? 1 : 0)),
        };
      },
    );
    setLiveQueue(current => current.filter(item => item.id !== notification.id));

    try {
      await dismissAdminNotification(notification.id, normalizedOrganizationId);
    } finally {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["admin-home", "activity", normalizedOrganizationId] });
    }
  };

  const dismissAll = async () => {
    if (!normalizedOrganizationId || !normalizedUserId) return;

    queryClient.setQueryData<AdminNotificationsBootstrap>(
      queryKey,
      { items: [], unreadCount: 0 },
    );
    setLiveQueue([]);

    try {
      await dismissAllAdminNotifications(normalizedOrganizationId);
    } finally {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["admin-home", "activity", normalizedOrganizationId] });
    }
  };

  return {
    notifications: notificationsQuery.data?.items || [],
    unreadCount: notificationsQuery.data?.unreadCount || 0,
    isLoading: notificationsQuery.isPending,
    liveNotification,
    dismissLiveNotification: () => {
      const active = liveQueue[0];
      if (!active) return;
      if (isWorkReminder(active)) {
        // Acknowledging a sticky reminder must persist on the server;
        // otherwise the periodic inbox refresh would make it reappear.
        void dismiss(active).catch(error => {
          console.error("[work-item-reminder] Could not dismiss notification", error);
        });
      } else {
        setLiveQueue(current => current.slice(1));
      }
    },
    markRead,
    markAllRead,
    dismiss,
    dismissAll,
  };
}
