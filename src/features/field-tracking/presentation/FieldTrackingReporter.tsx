import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { updateMyFieldLocation } from "../infrastructure/field-tracking.repository";

export const FIELD_TRACKING_PREFERENCE_EVENT = "field-tracking-preference-changed";

function preferenceKey(organizationId: string, userId: string) {
  return `field-tracking:${organizationId}:${userId}`;
}

export function isFieldTrackingEnabled(organizationId?: string | null, userId?: string | null) {
  if (!organizationId || !userId || typeof window === "undefined") return false;
  return window.localStorage.getItem(preferenceKey(organizationId, userId)) === "1";
}

export function setFieldTrackingEnabled(organizationId: string, userId: string, enabled: boolean) {
  window.localStorage.setItem(preferenceKey(organizationId, userId), enabled ? "1" : "0");
  window.dispatchEvent(new CustomEvent(FIELD_TRACKING_PREFERENCE_EVENT));
}

function currentDeviceLabel() {
  if (typeof navigator === "undefined") return "Dispositivo";
  const agent = navigator.userAgent;
  if (/iPhone/i.test(agent)) return "iPhone";
  if (/iPad/i.test(agent)) return "iPad";
  if (/Android/i.test(agent)) return "Android";
  if (/Windows/i.test(agent)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(agent)) return "Mac";
  return "Navegador";
}

export function FieldTrackingReporter() {
  const { user, activeOrganizationId, hasPermission } = useAuth();
  const [preferenceVersion, setPreferenceVersion] = useState(0);
  const lastSentAtRef = useRef(0);
  const canShare = hasPermission("field_tracking.share");
  const enabled = useMemo(
    () => isFieldTrackingEnabled(activeOrganizationId, user?.id),
    [activeOrganizationId, user?.id, preferenceVersion],
  );

  useEffect(() => {
    const handlePreference = () => setPreferenceVersion(value => value + 1);
    window.addEventListener(FIELD_TRACKING_PREFERENCE_EVENT, handlePreference);
    return () => window.removeEventListener(FIELD_TRACKING_PREFERENCE_EVENT, handlePreference);
  }, []);

  useEffect(() => {
    if (!activeOrganizationId || !user?.id || !canShare || !enabled || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      position => {
        const now = Date.now();
        if (now - lastSentAtRef.current < 12_000) return;
        lastSentAtRef.current = now;
        void updateMyFieldLocation(activeOrganizationId, {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          heading: position.coords.heading,
          recordedAt: new Date(position.timestamp).toISOString(),
          deviceLabel: currentDeviceLabel(),
        }).catch(() => undefined);
      },
      () => undefined,
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 20_000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [activeOrganizationId, user?.id, canShare, enabled]);

  return null;
}
