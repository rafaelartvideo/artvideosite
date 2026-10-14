import { supabase } from "@/lib/supabase";

export type TechnicianTaskStatus = "pending" | "in_progress" | "completed" | "cancelled";

export type TechnicianLocation = {
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  captured_at: string | null;
};

export type TechnicianTask = {
  item_id: string;
  service_order_id: string;
  os_number: number | string;
  title: string;
  description: string | null;
  status: TechnicianTaskStatus;
  started_at: string | null;
  completed_at: string | null;
  execution_report: string | null;
  customer_name: string | null;
  customer_contact: string | null;
  equipment: string | null;
  diagnosis: string | null;
  problem: string | null;
  service_address: {
    street: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
  } | null;
  equipment_model: string | null;
  serial_number: string | null;
  scheduled_at: string | null;
  start_location: TechnicianLocation | null;
  finish_location: TechnicianLocation | null;
};


export type TechnicianOrderItem = {
  id: string;
  title: string;
  description: string | null;
  type: "service" | "custom_service" | "product";
  quantity: number;
};

export type TechnicianOrderDetails = {
  id: string;
  os_number: number | string;
  closed: boolean;
  solved: boolean;
  can_change_situation: boolean;
  can_edit_diagnosis: boolean;
  situation_id: string | null;
  situation_name: string | null;
  available_situations: Array<{ id: string; name: string }>;
  diagnosis: string | null;
  internal_notes: string | null;
  equipment_accessories?: string | null;
  equipment_condition?: string | null;
  equipment_brand?: string | null;
  customer_document?: string | null;
  customer_type?: string | null;
  customer_address?: TechnicianTask["service_address"];
  equipment_photos?: Array<{ id: string; name: string | null; path: string; kind: "label" | "equipment" }>;
  equipment_model?: string | null;
  technical_values?: Array<{ id: string; label: string; type: string; value: string | null }>;
  items: TechnicianOrderItem[];
};

export async function getMyTechnicianOrderDetails(orderId: string): Promise<TechnicianOrderDetails> {
  const { data, error } = await supabase.rpc("get_my_technician_order_details_v1", { p_order_id: orderId });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Dados da OS indisponíveis.");
  return data as TechnicianOrderDetails;
}

export async function getMyTechnicianEquipmentPhotoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("service-images").createSignedUrl(path, 600);
  if (error || !data?.signedUrl) throw error || new Error("Não foi possível visualizar a imagem do equipamento.");
  return data.signedUrl;
}

export async function changeMyTechnicianOrderSituation(orderId: string, situationId: string): Promise<void> {
  const { error } = await supabase.rpc("change_my_technician_order_situation_v1", {
    p_order_id: orderId,
    p_situation_id: situationId,
  });
  if (error) throw error;
}

export async function updateMyTechnicianOrderDiagnosis(orderId: string, diagnosis: string): Promise<void> {
  const { error } = await supabase.rpc("update_my_technician_order_diagnosis_v1", {
    p_order_id: orderId,
    p_diagnosis: diagnosis,
  });
  if (error) throw error;
}

export type TechnicianCatalogOption = {
  id: string;
  name: string;
  type: "service" | "product";
};

export type TechnicianOrderHistoryEntry = {
  kind: "situation" | "execution";
  description: string;
  at: string | null;
};

export async function searchMyTechnicianOrderCatalog(
  orderId: string,
  itemType: "service" | "product",
  search: string,
): Promise<TechnicianCatalogOption[]> {
  const { data, error } = await supabase.rpc("search_my_technician_order_catalog_v1", {
    p_order_id: orderId, p_item_type: itemType, p_search: search.trim(),
  });
  if (error) throw error;
  return Array.isArray(data) ? data as TechnicianCatalogOption[] : [];
}

export async function addMyTechnicianOrderItem(
  orderId: string, itemType: "service" | "product", catalogId: string, quantity: number,
): Promise<void> {
  const { error } = await supabase.rpc("add_my_technician_order_item_v1", {
    p_order_id: orderId, p_item_type: itemType, p_catalog_id: catalogId, p_quantity: quantity,
  });
  if (error) throw error;
}

export async function removeMyTechnicianOrderProduct(orderId: string, itemId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_my_technician_order_product_v1", {
    p_order_id: orderId, p_item_id: itemId,
  });
  if (error) throw error;
}

export async function getMyTechnicianOrderHistory(orderId: string): Promise<TechnicianOrderHistoryEntry[]> {
  const { data, error } = await supabase.rpc("get_my_technician_order_history_v1", {
    p_order_id: orderId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data as TechnicianOrderHistoryEntry[] : [];
}

export async function updateMyTechnicianOrderNote(
  orderId: string,
  field: "problem" | "internal_notes",
  value: string,
): Promise<void> {
  const { error } = await supabase.rpc("update_my_technician_order_note_v1", {
    p_order_id: orderId,
    p_field: field,
    p_value: value,
  });
  if (error) throw error;
}

export type GpsCapture = {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
};

export type TechnicianPhoto = {
  id: string;
  path: string;
  created_at: string;
};

export async function loadMyTechnicianTasks(organizationId: string): Promise<TechnicianTask[]> {
  const { data, error } = await supabase.rpc("list_my_technician_tasks_v1", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data as TechnicianTask[] : [];
}

export function captureTechnicianLocation(): Promise<GpsCapture> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Este dispositivo não disponibiliza localização. Ative o GPS e abra o sistema por HTTPS."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => {
        const { latitude, longitude, accuracy } = position.coords;
        if (![latitude, longitude, accuracy].every(Number.isFinite) || accuracy <= 0) {
          reject(new Error("O dispositivo não forneceu coordenadas válidas. Tente novamente."));
          return;
        }
        resolve({
          latitude,
          longitude,
          accuracy,
          capturedAt: new Date(position.timestamp).toISOString(),
        });
      },
      error => {
        const guidance = error.code === 1
          ? "Permita o acesso à localização nas configurações do navegador e do dispositivo."
          : error.code === 3
            ? "Não foi possível obter a localização a tempo. Ative o GPS e tente novamente."
            : "Localização indisponível. Verifique o GPS ou as permissões do dispositivo.";
        reject(new Error(guidance));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}

export async function startMyTechnicianTask(itemId: string, gps: GpsCapture) {
  const { error } = await supabase.rpc("start_my_technician_task_v1", {
    p_item_id: itemId,
    p_lat: gps.latitude,
    p_lng: gps.longitude,
    p_accuracy_m: gps.accuracy,
    p_captured_at: gps.capturedAt,
  });
  if (error) throw error;
}

export async function finishMyTechnicianTask(itemId: string, report: string, gps: GpsCapture) {
  const { error } = await supabase.rpc("finish_my_technician_task_v1", {
    p_item_id: itemId,
    p_report: report.trim(),
    p_lat: gps.latitude,
    p_lng: gps.longitude,
    p_accuracy_m: gps.accuracy,
    p_captured_at: gps.capturedAt,
  });
  if (error) throw error;
}

export async function countMyTechnicianPhotos(itemId: string): Promise<number> {
  const { data, error } = await supabase.rpc("count_my_technician_task_photos_v1", {
    p_item_id: itemId,
  });
  if (error) throw error;
  return Number(data || 0);
}

export async function listMyTechnicianPhotos(itemId: string): Promise<TechnicianPhoto[]> {
  const { data, error } = await supabase.rpc("list_my_technician_task_photos_v1", {
    p_item_id: itemId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data as TechnicianPhoto[] : [];
}

export async function getTechnicianPhotoSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("technician-task-photos")
    .createSignedUrl(path, 60 * 10);
  if (error || !data?.signedUrl) throw error || new Error("Não foi possível abrir a foto.");
  return data.signedUrl;
}

export async function uploadTechnicianPhoto(organizationId: string, itemId: string, file: File) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw userError || new Error("Sessão não encontrada.");
  const validTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!validTypes.includes(file.type)) throw new Error("Utilize fotos JPG, PNG ou WEBP.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Cada foto deve ter no máximo 5 MB.");
  if (file.size === 0) throw new Error("Arquivo vazio.");
  const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
  const path = [organizationId, itemId, userData.user.id, `${crypto.randomUUID()}.${extension}`].join("/");
  const storage = supabase.storage.from("technician-task-photos");
  const upload = await storage.upload(path, file, { contentType: file.type, upsert: false, cacheControl: "3600" });
  if (upload.error) throw upload.error;
  const { error } = await supabase.rpc("register_my_technician_task_photo_v1", {
    p_item_id: itemId,
    p_storage_path: path,
  });
  if (error) {
    // Manter a falha explícita. Uma limpeza de uploads órfãos deve usar
    // processo administrativo seguro, sem conceder DELETE aos técnicos.
    throw error;
  }
}
