import { supabase } from "@/lib/supabase";

export type DeviceUnlockType = "none" | "pin" | "password" | "pattern";
export type DeviceUnlockMeta = { type: Exclude<DeviceUnlockType, "none"> | null; has_value: boolean };

export async function getOrderDeviceUnlockMeta(orderId: string): Promise<DeviceUnlockMeta> {
  const { data, error } = await supabase.rpc("get_service_order_unlock_meta_v1", { p_order_id: orderId });
  if (error) throw error;
  return (data || { type: null, has_value: false }) as DeviceUnlockMeta;
}

export async function saveOrderDeviceUnlock(
  orderId: string,
  type: DeviceUnlockType,
  value: string,
): Promise<void> {
  const { error } = await supabase.rpc("set_service_order_unlock_v1", {
    p_order_id: orderId,
    p_type: type,
    p_value: value,
  });
  if (error) throw error;
}

export async function revealOrderDeviceUnlock(
  orderId: string,
): Promise<{ type: Exclude<DeviceUnlockType, "none"> | null; value: string | null }> {
  const { data, error } = await supabase.rpc("reveal_service_order_unlock_v1", { p_order_id: orderId });
  if (error) throw error;
  return (data || { type: null, value: null }) as { type: Exclude<DeviceUnlockType, "none"> | null; value: string | null };
}
