export type FieldTrackingUnitType = "technician" | "vehicle" | "device";

export type FieldTrackingUnit = {
  id: string;
  organization_id: string;
  unit_type: FieldTrackingUnitType;
  name: string;
  linked_user_id: string | null;
  device_label: string | null;
  identifier_type: "plate" | "imei" | "serial" | "other" | null;
  identifier_value: string | null;
  paired_at: string | null;
  paired_device_label: string | null;
  tracking_provider: "native" | "traccar_client" | "traccar_server";
  traccar_unique_id_hint: string | null;
  battery_level: number | null;
  charging: boolean | null;
  altitude_m: number | null;
  provider_protocol: string | null;
  provider_status: string | null;
  is_active: boolean;
  is_sharing: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  speed_mps: number | null;
  heading: number | null;
  last_seen_at: string | null;
  last_recorded_at: string | null;
  updated_at: string;
};

export type FieldTrackingStatus = "online" | "lost" | "paused" | "unknown";

export function fieldTrackingStatus(unit: FieldTrackingUnit, now = Date.now()): FieldTrackingStatus {
  if (unit.latitude == null || unit.longitude == null || !unit.last_seen_at) return unit.is_sharing ? "lost" : "unknown";
  if (!unit.is_sharing) return "paused";
  const seenAt = new Date(unit.last_seen_at).getTime();
  if (!Number.isFinite(seenAt)) return "lost";
  return now - seenAt <= 90_000 ? "online" : "lost";
}

export function fieldTrackingStatusLabel(status: FieldTrackingStatus) {
  if (status === "online") return "Ao vivo";
  if (status === "lost") return "Sem sinal";
  if (status === "paused") return "Pausado";
  return "Sem posição";
}
