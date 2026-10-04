import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  loadAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  subscribeToAdminNotifications,
  type AdminNotification,
  type AdminNotificationsBootstrap,
} from "../infrastructure/notifications.repository";

const notificationsKey = (organizationId: string | null, userId: string | null) => [
  "admin-notifications",
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
  const queryKey = notificationsKey(normalizedOrganizationId, normalizedUserId);

  const notificationsQuery = useQuery({
    queryKey,
    enabled,
    queryFn: () => loadAdminNotifications(normalizedOrganizationId!, 50),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    setLiveNotification(null);
    if (!normalizedOrganizationId || !normalizedUserId) return;

    return subscribeToAdminNotifications(normalizedOrganizationId, notification => {
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

  return {
    notifications: notificationsQuery.data?.items || [],
    unreadCount: notificationsQuery.data?.unreadCount || 0,
    isLoading: notificationsQuery.isPending,
    liveNotification,
    dismissLiveNotification: () => setLiveNotification(null),
    markRead,
    markAllRead,
  };
}
