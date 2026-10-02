import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  countUnreadAdminNotifications,
  listAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  subscribeToAdminNotifications,
  type AdminNotification,
} from "../infrastructure/notifications.repository";

const listKey = (organizationId: string | null, userId: string | null) => [
  "admin-notifications",
  organizationId || "none",
  userId || "none",
] as const;

const unreadKey = (organizationId: string | null, userId: string | null) => [
  "admin-notifications-unread",
  organizationId || "none",
  userId || "none",
] as const;

export function useAdminNotifications(
  organizationId: string | null | undefined,
  userId: string | null | undefined,
) {
  const queryClient = useQueryClient();
  const [liveNotification, setLiveNotification] = useState<AdminNotification | null>(null);
  const normalizedOrganizationId = organizationId || null;
  const normalizedUserId = userId || null;
  const enabled = Boolean(normalizedOrganizationId && normalizedUserId);

  const notificationsQuery = useQuery({
    queryKey: listKey(normalizedOrganizationId, normalizedUserId),
    enabled,
    queryFn: () => listAdminNotifications(normalizedOrganizationId!, normalizedUserId!, 50),
    staleTime: 30_000,
  });

  const unreadQuery = useQuery({
    queryKey: unreadKey(normalizedOrganizationId, normalizedUserId),
    enabled,
    queryFn: () => countUnreadAdminNotifications(normalizedOrganizationId!),
    staleTime: 15_000,
  });

  useEffect(() => {
    setLiveNotification(null);
    if (!normalizedOrganizationId || !normalizedUserId) return;

    return subscribeToAdminNotifications(normalizedOrganizationId, notification => {
      queryClient.setQueryData<AdminNotification[]>(
        listKey(normalizedOrganizationId, normalizedUserId),
        current => [
          notification,
          ...(current || []).filter(item => item.id !== notification.id),
        ].slice(0, 50),
      );
      queryClient.setQueryData<number>(
        unreadKey(normalizedOrganizationId, normalizedUserId),
        current => (current || 0) + 1,
      );
      setLiveNotification(notification);
    });
  }, [normalizedOrganizationId, normalizedUserId, queryClient]);

  useEffect(() => {
    if (!liveNotification) return;
    const timeout = window.setTimeout(() => setLiveNotification(null), 7000);
    return () => window.clearTimeout(timeout);
  }, [liveNotification]);

  const markRead = async (notification: AdminNotification) => {
    if (!normalizedOrganizationId || !normalizedUserId || notification.read_at) return;

    const readAt = new Date().toISOString();
    queryClient.setQueryData<AdminNotification[]>(
      listKey(normalizedOrganizationId, normalizedUserId),
      current => (current || []).map(item =>
        item.id === notification.id ? { ...item, read_at: readAt } : item,
      ),
    );
    queryClient.setQueryData<number>(
      unreadKey(normalizedOrganizationId, normalizedUserId),
      current => Math.max(0, (current || 0) - 1),
    );

    try {
      await markAdminNotificationRead(notification, normalizedUserId);
    } catch (error) {
      void queryClient.invalidateQueries({ queryKey: listKey(normalizedOrganizationId, normalizedUserId) });
      void queryClient.invalidateQueries({ queryKey: unreadKey(normalizedOrganizationId, normalizedUserId) });
      throw error;
    }
  };

  const markAllRead = async () => {
    if (!normalizedOrganizationId || !normalizedUserId) return;

    const readAt = new Date().toISOString();
    queryClient.setQueryData<AdminNotification[]>(
      listKey(normalizedOrganizationId, normalizedUserId),
      current => (current || []).map(item => ({ ...item, read_at: item.read_at || readAt })),
    );
    queryClient.setQueryData<number>(
      unreadKey(normalizedOrganizationId, normalizedUserId),
      0,
    );

    try {
      await markAllAdminNotificationsRead(normalizedOrganizationId);
    } finally {
      void queryClient.invalidateQueries({ queryKey: listKey(normalizedOrganizationId, normalizedUserId) });
      void queryClient.invalidateQueries({ queryKey: unreadKey(normalizedOrganizationId, normalizedUserId) });
    }
  };

  return {
    notifications: notificationsQuery.data || [],
    unreadCount: unreadQuery.data || 0,
    isLoading: notificationsQuery.isPending,
    liveNotification,
    dismissLiveNotification: () => setLiveNotification(null),
    markRead,
    markAllRead,
  };
}
