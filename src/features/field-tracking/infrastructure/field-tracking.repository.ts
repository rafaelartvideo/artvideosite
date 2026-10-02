import { supabase } from "@/lib/supabase";
import type { FieldTrackingUnit } from "../domain/field-tracking";

export async function listFieldTrackingUnits(organizationId: string): Promise<FieldTrackingUnit[]> {
  const { data, error } = await supabase.rpc("list_field_tracking_units_v1", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return (data || []) as FieldTrackingUnit[];
}

export async function updateMyFieldLocation(
  organizationId: string,
  position: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    speed?: number | null;
    heading?: number | null;
    recordedAt?: string | null;
    deviceLabel?: string | null;
  },
) {
  const { error } = await supabase.rpc("update_my_field_location_v1", {
    p_organization_id: organizationId,
    p_latitude: position.latitude,
    p_longitude: position.longitude,
    p_accuracy_m: position.accuracy ?? null,
    p_speed_mps: position.speed ?? null,
    p_heading: position.heading ?? null,
    p_recorded_at: position.recordedAt ?? new Date().toISOString(),
    p_device_label: position.deviceLabel ?? null,
  });
  if (error) throw error;
}

export async function stopMyFieldTracking(organizationId: string) {
  const { error } = await supabase.rpc("stop_my_field_tracking_v1", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
}

export function subscribeFieldTracking(organizationId: string, onChange: () => void) {
  const channel = supabase
    .channel(`field-tracking:${organizationId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "field_tracking_units",
      filter: `organization_id=eq.${organizationId}`,
    }, () => onChange())
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
