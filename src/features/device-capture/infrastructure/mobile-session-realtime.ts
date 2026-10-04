import { supabase } from "@/lib/supabase";

export type MobileSessionRealtimeRow = {
  id: string;
  status?: string | null;
  expires_at?: string | null;
  connected_at?: string | null;
  last_seen_at?: string | null;
  order_updated_at?: string | null;
  equipment_type_id?: string | null;
};

export function subscribeMobileSessionRealtime({
  sessionId,
  presenceRole,
  onMobilePresenceChange,
  onSessionChange,
  onEventInsert,
  onReady,
}: {
  sessionId: string;
  presenceRole?: "desktop" | "mobile";
  onMobilePresenceChange?: (connected: boolean) => void;
  onSessionChange?: (row: MobileSessionRealtimeRow) => void;
  onEventInsert?: () => void;
  onReady?: () => void;
}) {
  const presenceKey = presenceRole
    ? `${presenceRole}:${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`
    : undefined;
  let channel = supabase.channel(
    `mobile-session-realtime:${sessionId}`,
    presenceKey ? { config: { presence: { key: presenceKey } } } : undefined,
  );

  if (onSessionChange) {
    channel = channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "device_capture_sessions",
        filter: `id=eq.${sessionId}`,
      },
      payload => onSessionChange((payload.new || {}) as MobileSessionRealtimeRow),
    );
  }

  if (onEventInsert) {
    channel = channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "device_capture_events",
        filter: `session_id=eq.${sessionId}`,
      },
      () => onEventInsert(),
    );
  }

  if (onMobilePresenceChange) {
    const syncPresence = () => {
      const state = channel.presenceState() as Record<string, Array<{ role?: string }>>;
      const mobileConnected = Object.values(state)
        .flat()
        .some(presence => presence?.role === "mobile");
      onMobilePresenceChange(mobileConnected);
    };
    channel = channel.on("presence", { event: "sync" }, syncPresence);
  }

  channel.subscribe(status => {
    if (status !== "SUBSCRIBED") return;
    if (presenceRole) {
      void channel.track({ role: presenceRole, connected_at: new Date().toISOString() });
    }
    onReady?.();
  });

  return () => {
    void supabase.removeChannel(channel);
  };
}
