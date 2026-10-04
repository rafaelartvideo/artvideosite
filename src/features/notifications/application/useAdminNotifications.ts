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
  const [liveNotification, setLiveNotification] = useState<AdminNotification | null>(null);
  const normalizedOrganizationId = organizationId || null;
  const normalizedUserId = userId || null;
  const enabled = Boolean(normalizedOrganizationId && normalizedUserId);
  const queryKey = adminNotificationsKey(normalizedOrganizationId, normalizedUserId);

  const notificationsQuery = useQuery({
    queryKey,
    enabled,
    queryFn: () => loadAdminNotifications(normalizedOrganizationId!, 50),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    setLiveNotification(null);
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
        setLiveNotification(notification);
      },
      onStateChange: () => {
        void queryClient.invalidateQueries({ queryKey });
        void queryClient.invalidateQueries({ queryKey: ["admin-home", "activity", normalizedOrganizationId] });
      },
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
    setLiveNotification(current => current?.id === notification.id ? null : current);

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
    setLiveNotification(null);

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
    dismissLiveNotification: () => setLiveNotification(null),
    markRead,
    markAllRead,
    dismiss,
    dismissAll,
  };
}
