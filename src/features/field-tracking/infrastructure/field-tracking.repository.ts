import { createTransientSupabaseClient, supabase, supabaseUrl } from "@/lib/supabase";
import type { FieldTrackingUnit } from "../domain/field-tracking";

export async function listFieldTrackingUnits(organizationId: string): Promise<FieldTrackingUnit[]> {
  const { data, error } = await supabase.rpc("list_field_tracking_units_v3", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return (data || []) as FieldTrackingUnit[];
}

export const TRACCAR_INGEST_URL = `${supabaseUrl}/functions/v1/field-tracking-traccar`;

export type TraccarDeviceSetup = {
  unit_id: string;
  unit_name: string;
  device_identifier: string;
};

export type TraccarForwardIntegration = {
  configured: boolean;
  token_hint: string | null;
  last_received_at: string | null;
};

export async function createTraccarFieldTrackingUnit(
  organizationId: string,
  input: {
    unitType: "technician" | "vehicle" | "device";
    name: string;
    identifierType?: "plate" | "imei" | "serial" | "other" | null;
    identifierValue?: string | null;
  },
): Promise<TraccarDeviceSetup> {
  const { data, error } = await supabase.rpc("create_traccar_field_tracking_unit_v1", {
    p_organization_id: organizationId,
    p_unit_type: input.unitType,
    p_name: input.name,
    p_identifier_type: input.identifierType ?? null,
    p_identifier_value: input.identifierValue ?? null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.unit_id || !row?.device_identifier) throw new Error("Não foi possível gerar o rastreador Traccar.");
  return {
    unit_id: String(row.unit_id),
    unit_name: input.name,
    device_identifier: String(row.device_identifier),
  };
}

export async function rotateTraccarFieldTrackingIdentifier(
  organizationId: string,
  unitId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("rotate_traccar_field_tracking_identifier_v1", {
    p_organization_id: organizationId,
    p_unit_id: unitId,
  });
  if (error) throw error;
  const identifier = String(data || "");
  if (!identifier) throw new Error("Não foi possível gerar um novo identificador.");
  return identifier;
}

export async function getTraccarForwardIntegration(organizationId: string): Promise<TraccarForwardIntegration> {
  const { data, error } = await supabase.rpc("get_traccar_forward_integration_v1", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    configured: Boolean(row?.configured),
    token_hint: row?.token_hint ? String(row.token_hint) : null,
    last_received_at: row?.last_received_at ? String(row.last_received_at) : null,
  };
}

export async function rotateTraccarForwardToken(organizationId: string) {
  const { data, error } = await supabase.rpc("rotate_traccar_forward_token_v1", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.token) throw new Error("Não foi possível gerar o token do Traccar Server.");
  return {
    token: String(row.token),
    token_hint: String(row.token_hint || ""),
  };
}

export type FieldTrackingPairing = {
  unit_id: string;
  unit_name: string;
  pairing_token: string;
  pairing_code: string;
  expires_at: string;
};

export async function createFieldTrackingUnit(
  organizationId: string,
  input: {
    unitType: "vehicle" | "device";
    name: string;
    identifierType?: "plate" | "imei" | "serial" | "other" | null;
    identifierValue?: string | null;
  },
) {
  const { data, error } = await supabase.rpc("create_field_tracking_unit_v1", {
    p_organization_id: organizationId,
    p_unit_type: input.unitType,
    p_name: input.name,
    p_identifier_type: input.identifierType ?? null,
    p_identifier_value: input.identifierValue ?? null,
  });
  if (error) throw error;
  return String(data || "");
}

export async function createFieldTrackingPairing(organizationId: string, unitId: string): Promise<FieldTrackingPairing> {
  const { data, error } = await supabase.rpc("create_field_tracking_pairing_v1", {
    p_organization_id: organizationId,
    p_unit_id: unitId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Não foi possível gerar o pareamento.");
  return row as FieldTrackingPairing;
}

type DeviceTrackerResponse = {
  success: boolean;
  error?: string;
  tracker_token?: string;
  unit?: {
    id: string;
    organization_id: string;
    name: string;
    unit_type: string;
    identifier_type?: string | null;
    identifier_value?: string | null;
  } | null;
};

async function invokeDeviceTracker(body: Record<string, unknown>): Promise<DeviceTrackerResponse> {
  const client = createTransientSupabaseClient();
  const { data, error } = await client.functions.invoke("field-tracking-device", { body });
  if (error) throw error;
  const response = (data || {}) as DeviceTrackerResponse;
  if (!response.success) throw new Error(response.error || "Falha no rastreador.");
  return response;
}

export async function redeemFieldTrackingPairing(input: {
  pairingToken?: string | null;
  pairingCode?: string | null;
  deviceLabel?: string | null;
}) {
  return invokeDeviceTracker({
    action: "redeem",
    pairing_token: input.pairingToken ?? null,
    pairing_code: input.pairingCode ?? null,
    device_label: input.deviceLabel ?? null,
  });
}

export async function updatePairedFieldLocation(
  trackerToken: string,
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
  return invokeDeviceTracker({
    action: "update",
    tracker_token: trackerToken,
    latitude: position.latitude,
    longitude: position.longitude,
    accuracy_m: position.accuracy ?? null,
    speed_mps: position.speed ?? null,
    heading: position.heading ?? null,
    recorded_at: position.recordedAt ?? new Date().toISOString(),
    device_label: position.deviceLabel ?? null,
  });
}

export async function stopPairedFieldTracking(trackerToken: string) {
  return invokeDeviceTracker({ action: "stop", tracker_token: trackerToken });
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
