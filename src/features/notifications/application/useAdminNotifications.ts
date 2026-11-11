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
  const [realtimeConnected, setRealtimeConnected] = useState(false);
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
    queryFn: () => loadAdminNotifications(normalizedOrganizationId!, 50, normalizedUserId!),
    // Realtime entrega eventos imediatamente. Só enquanto o canal está
    // conectado, a reconciliação pode ser menos frequente; desconectado,
    // mantemos a contingência de 60s (erros seguem o backoff existente).
    staleTime: 60_000,
    refetchInterval: query => query.state.status === "error"
      ? 120_000 : realtimeConnected ? 5 * 60_000 : 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    setLiveQueue([]);
    setRealtimeConnected(false);
    if (!normalizedOrganizationId || !normalizedUserId) return;

    let disposed = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let stateRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    let reconcileAfter = 0;
    let lastErrorLogAt = 0;
    const pendingIds = new Set<number>();

    // Um evento Realtime nao prova que o usuario pode RECEBER o alerta.
    // Consulta a caixa com as permissoes do servidor antes de exibir popup
    // e consolida bursts de INSERT em uma unica consulta.
    const flushNotifications = async () => {
      refreshTimer = null;
      if (disposed || pendingIds.size === 0) return;
      // Back off all Realtime bursts after a failed request. Do not replay
      // invalidations immediately, which would start another expensive RPC.
      if (Date.now() < reconcileAfter) {
        refreshTimer = setTimeout(() => void flushNotifications(), reconcileAfter - Date.now());
        return;
      }
      const received = new Set(pendingIds);
      pendingIds.clear();
      try {
        const snapshot = await loadAdminNotifications(normalizedOrganizationId, 50, normalizedUserId);
        if (disposed) return;
        reconcileAfter = 0;
        queryClient.setQueryData<AdminNotificationsBootstrap>(queryKey, snapshot);
        snapshot.items.filter(item =>
          received.has(item.id) && item.delivery_allowed === true && !item.read_at,
        ).reverse().forEach(enqueueLiveNotification);
      } catch (error) {
        if (disposed) return;
        received.forEach(id => pendingIds.add(id));
        reconcileAfter = Date.now() + 30_000;
        // One diagnostic per minute, never one per notification.
        if (Date.now() - lastErrorLogAt >= 60_000) {
          console.warn("[notifications] Inbox unavailable; scheduling a delayed reconciliation", error);
          lastErrorLogAt = Date.now();
        }
      }
      if (!disposed && pendingIds.size > 0 && refreshTimer === null) {
        refreshTimer = setTimeout(
          () => void flushNotifications(),
          Math.max(1_000, reconcileAfter - Date.now()),
        );
      }
    };

    const unsubscribe = subscribeToAdminNotifications(normalizedOrganizationId, normalizedUserId, {
      onConnectionChange: connected => {
        if (!disposed) setRealtimeConnected(connected);
      },
      onNotification: notification => {
        // The home page uses the same React Query key. Flush once instead of
        // invalidating it separately for every inserted notification.
        if (pendingIds.size < 200) pendingIds.add(notification.id);
        if (refreshTimer === null) refreshTimer = setTimeout(() => void flushNotifications(), 1_000);
      },
      onStateChange: () => {
        if (stateRefreshTimer !== null) return;
        stateRefreshTimer = setTimeout(() => {
          stateRefreshTimer = null;
          if (!disposed) void queryClient.invalidateQueries({ queryKey });
        }, 1_000);
      },
    });
    return () => {
      disposed = true;
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      if (stateRefreshTimer !== null) clearTimeout(stateRefreshTimer);
      unsubscribe();
    };
  }, [normalizedOrganizationId, normalizedUserId, queryClient]);

  // Ao retornar de uma aba oculta por bastante tempo, reconcilia uma vez.
  // Não dispara fetch a cada alternância de foco.
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const updatedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt || 0;
      if (Date.now() - updatedAt >= 5 * 60_000) {
        void queryClient.invalidateQueries({ queryKey, exact: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, normalizedOrganizationId, normalizedUserId, queryClient]);

  // The realtime INSERT can be missed if the page was closed, switched tabs,
  // the websocket reconnected, or the database cron fired during a reload.
  // Recover pending reminders on initial load, reconnection, returning from
  // a long-hidden tab or periodic fallback. Dismissed/read items aren't replayed.
  useEffect(() => {
    if (!enabled) return;
    const since = Date.now() - 24 * 60 * 60_000;
    const recentReminders = (notificationsQuery.data?.items || [])
      .filter(item => isWorkReminder(item)
        && item.delivery_allowed === true && !item.read_at && new Date(item.created_at).getTime() >= since)
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
        unreadCount: Math.max(0, (current?.unreadCount || 0) - (notification.delivery_allowed === false ? 0 : 1)),
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
          unreadCount: Math.max(0, (current?.unreadCount || 0) - (item && item.delivery_allowed !== false && !item.read_at ? 1 : 0)),
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
