import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_ITEM_PHOTOS = 5;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type AdminClient = ReturnType<typeof createClient>;
type Session = {
  id: string;
  organization_id: string;
  created_by: string;
  equipment_type_id: string | null;
  status: string;
  expires_at: string;
  token_hash: string;
  pairing_code_hash: string | null;
};
type EntryItem = {
  id: string;
  key: string;
  title: string;
  description: string | null;
  response_type: string;
  allow_na: boolean;
  is_required: boolean;
  photo_requirement: string;
  observation_requirement: string;
  sort_order: number;
};

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeCode(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length === 8 ? digits : "";
}

function extensionFor(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function safeFileName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100) || `checklist-${Date.now()}.jpg`;
}

async function sessionByToken(admin: AdminClient, sessionId: string, token: string) {
  if (!sessionId || !token) return null;
  let query = admin
    .from("device_capture_sessions")
    .select("id,organization_id,created_by,equipment_type_id,status,expires_at,token_hash,pairing_code_hash")
    .eq("id", sessionId);

  if (token.startsWith("code:")) {
    const code = normalizeCode(token.slice(5));
    if (!code) return null;
    query = query.eq("pairing_code_hash", await sha256(`pairing:${code}`));
  } else {
    query = query.eq("token_hash", await sha256(token));
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const session = data as Session;
  if (session.status !== "active" || new Date(session.expires_at).getTime() <= Date.now()) return null;
  return session;
}

async function authenticatedUser(request: Request, url: string, anon: string) {
  const authorization = request.headers.get("Authorization");
  if (!authorization) return null;
  const client = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}

async function loadEntryConfig(admin: AdminClient, session: Session) {
  if (!session.equipment_type_id) return null;

  const { data: equipment, error: equipmentError } = await admin
    .from("equipment_types")
    .select("id,checklist_profile_id")
    .eq("id", session.equipment_type_id)
    .eq("organization_id", session.organization_id)
    .maybeSingle();
  if (equipmentError) throw equipmentError;
  if (!equipment?.checklist_profile_id) return null;

  const { data: stage, error: stageError } = await admin
    .from("checklist_profile_stages")
    .select("id,code,name")
    .eq("profile_id", equipment.checklist_profile_id)
    .eq("stage_type", "entry")
    .eq("is_active", true)
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  if (stageError) throw stageError;
  if (!stage) return null;

  const [{ data: base, error: baseError }, { data: extras, error: extrasError }] = await Promise.all([
    admin
      .from("checklist_profile_items")
      .select("id,title,description,response_type,allow_na,is_required,photo_requirement,observation_requirement,sort_order")
      .eq("stage_id", stage.id)
      .eq("is_active", true)
      .order("sort_order"),
    admin
      .from("equipment_checklist_items")
      .select("id,title,description,response_type,allow_na,is_required,photo_requirement,observation_requirement,sort_order")
      .eq("equipment_type_id", session.equipment_type_id)
      .eq("stage_code", stage.code)
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  if (baseError) throw baseError;
  if (extrasError) throw extrasError;

  const items: EntryItem[] = [
    ...(base || []).map((item: any) => ({ ...item, key: `profile:${item.id}` })),
    ...(extras || []).map((item: any) => ({ ...item, key: `extra:${item.id}` })),
  ];

  return { stageName: String(stage.name), stageCode: String(stage.code), items };
}

function cleanPayload(raw: unknown) {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    responseCode: String(value.responseCode || "").slice(0, 40),
    responseText: String(value.responseText || "").slice(0, 4000),
    responseNumber: String(value.responseNumber || "").slice(0, 100),
    observation: String(value.observation || "").slice(0, 4000),
  };
}

async function removeChecklistPhotos(admin: AdminClient, sessionId: string) {
  const { data, error } = await admin
    .from("device_capture_events")
    .select("storage_path")
    .eq("session_id", sessionId)
    .eq("event_type", "checklist_photo");
  if (error) throw error;
  const paths = (data || []).map((row: any) => String(row.storage_path || "")).filter(Boolean);
  if (paths.length) {
    const { error: removeError } = await admin.storage.from("service-images").remove(paths);
    if (removeError) throw removeError;
  }
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ success: false, error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ success: false, error: "Checklist por celular não configurado." }, 500);

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const multipart = request.headers.get("content-type")?.includes("multipart/form-data") === true;
    const input: Record<string, any> = multipart
      ? Object.fromEntries((await request.formData()).entries())
      : await request.json().catch(() => ({}));
    const action = String(input.action || "").trim();
    const sessionId = String(input.session_id || "").trim();

    if (action === "bind") {
      const user = await authenticatedUser(request, url, anon);
      if (!user) return json({ success: false, error: "Não autenticado." }, 401);
      const equipmentTypeId = String(input.equipment_type_id || "").trim() || null;
      const { data: session, error } = await admin
        .from("device_capture_sessions")
        .select("id,organization_id,created_by,equipment_type_id")
        .eq("id", sessionId)
        .eq("created_by", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!session) return json({ success: false, error: "Sessão não encontrada." }, 404);

      if (equipmentTypeId) {
        const { data: equipment, error: equipmentError } = await admin
          .from("equipment_types")
          .select("id")
          .eq("id", equipmentTypeId)
          .eq("organization_id", session.organization_id)
          .maybeSingle();
        if (equipmentError) throw equipmentError;
        if (!equipment) return json({ success: false, error: "Equipamento inválido." }, 400);
      }

      if (session.equipment_type_id && session.equipment_type_id !== equipmentTypeId) {
        await removeChecklistPhotos(admin, sessionId);
        const { error: deleteError } = await admin
          .from("device_capture_events")
          .delete()
          .eq("session_id", sessionId)
          .in("event_type", ["checklist", "checklist_photo"]);
        if (deleteError) throw deleteError;
      }

      const { error: updateError } = await admin
        .from("device_capture_sessions")
        .update({ equipment_type_id: equipmentTypeId, updated_at: new Date().toISOString() })
        .eq("id", sessionId);
      if (updateError) throw updateError;
      return json({ success: true });
    }

    const token = String(input.token || "").trim();
    const session = await sessionByToken(admin, sessionId, token);
    if (!session) return json({ success: false, error: "A conexão expirou ou foi encerrada." }, 401);
    const config = await loadEntryConfig(admin, session);

    if (action === "get_entry") {
      if (!config) return json({ success: true, checklist: null });
      const { data: events, error } = await admin
        .from("device_capture_events")
        .select("id,event_type,checklist_item_key,checklist_payload,storage_path,file_name,mime_type,created_at")
        .eq("session_id", session.id)
        .in("event_type", ["checklist", "checklist_photo"])
        .order("id", { ascending: true });
      if (error) throw error;

      const latestAnswers = new Map<string, any>();
      const photos = new Map<string, any[]>();
      for (const event of events || []) {
        const key = String(event.checklist_item_key || "");
        if (!key) continue;
        if (event.event_type === "checklist") latestAnswers.set(key, event.checklist_payload || {});
        if (event.event_type === "checklist_photo" && event.storage_path) {
          const { data: signed } = await admin.storage.from("service-images").createSignedUrl(event.storage_path, 600);
          const list = photos.get(key) || [];
          list.push({
            id: event.id,
            signed_url: signed?.signedUrl || "",
            file_name: event.file_name || "foto.jpg",
            mime_type: event.mime_type || "image/jpeg",
            created_at: event.created_at,
          });
          photos.set(key, list);
        }
      }

      return json({
        success: true,
        checklist: {
          equipment_type_id: session.equipment_type_id,
          stage_name: config.stageName,
          stage_code: config.stageCode,
          items: config.items.map(item => ({
            ...item,
            ...(latestAnswers.get(item.key) || {}),
            photos: photos.get(item.key) || [],
          })),
        },
      });
    }

    if (action === "answer") {
      if (!config) return json({ success: false, error: "Este equipamento não possui checklist de entrada." }, 400);
      const itemKey = String(input.item_key || "").trim();
      const item = config.items.find(candidate => candidate.key === itemKey);
      if (!item) return json({ success: false, error: "Item do checklist inválido." }, 400);
      const payload = cleanPayload(input.payload);
      const { error } = await admin.from("device_capture_events").insert({
        session_id: session.id,
        event_type: "checklist",
        checklist_item_key: itemKey,
        checklist_payload: payload,
      });
      if (error) throw error;
      const now = new Date().toISOString();
      await admin.from("device_capture_sessions").update({ last_seen_at: now, updated_at: now }).eq("id", session.id);
      return json({ success: true, payload });
    }

    if (action === "upload_photo") {
      if (!config) return json({ success: false, error: "Este equipamento não possui checklist de entrada." }, 400);
      const itemKey = String(input.item_key || "").trim();
      const item = config.items.find(candidate => candidate.key === itemKey);
      if (!item) return json({ success: false, error: "Item do checklist inválido." }, 400);
      if (item.photo_requirement === "none") return json({ success: false, error: "Este item não aceita fotos." }, 400);

      const file = input.file;
      if (!(file instanceof File)) return json({ success: false, error: "Nenhuma foto recebida." }, 400);
      if (!ACCEPTED_IMAGE_TYPES.has(file.type)) return json({ success: false, error: "Formato não suportado. Use JPG, PNG ou WebP." }, 400);
      if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) return json({ success: false, error: "A foto deve ter no máximo 10 MB." }, 400);

      const { count } = await admin
        .from("device_capture_events")
        .select("id", { count: "exact", head: true })
        .eq("session_id", session.id)
        .eq("event_type", "checklist_photo")
        .eq("checklist_item_key", itemKey);
      if ((count || 0) >= MAX_ITEM_PHOTOS) return json({ success: false, error: "Limite de 5 fotos atingido neste item." }, 400);

      const path = `capture/${session.organization_id}/${session.id}/checklist/${crypto.randomUUID()}.${extensionFor(file)}`;
      const { error: uploadError } = await admin.storage.from("service-images").upload(path, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const fileName = safeFileName(file.name);
      const { data: event, error: eventError } = await admin
        .from("device_capture_events")
        .insert({
          session_id: session.id,
          event_type: "checklist_photo",
          checklist_item_key: itemKey,
          storage_path: path,
          file_name: fileName,
          mime_type: file.type,
          size_bytes: file.size,
        })
        .select("id,created_at")
        .single();
      if (eventError) {
        await admin.storage.from("service-images").remove([path]);
        throw eventError;
      }

      const { data: signed } = await admin.storage.from("service-images").createSignedUrl(path, 600);
      const now = new Date().toISOString();
      await admin.from("device_capture_sessions").update({ last_seen_at: now, updated_at: now }).eq("id", session.id);
      return json({
        success: true,
        photo: {
          id: event.id,
          signed_url: signed?.signedUrl || "",
          file_name: fileName,
          mime_type: file.type,
          created_at: event.created_at,
        },
      });
    }

    if (action === "poll") {
      const lastEventId = Math.max(0, Number(input.last_event_id || 0) || 0);
      const { data: events, error } = await admin
        .from("device_capture_events")
        .select("id,event_type,checklist_item_key,checklist_payload,storage_path,file_name,mime_type,created_at")
        .eq("session_id", session.id)
        .in("event_type", ["checklist", "checklist_photo"])
        .gt("id", lastEventId)
        .order("id", { ascending: true });
      if (error) throw error;

      const output: any[] = [];
      for (const event of events || []) {
        if (event.event_type === "checklist") {
          output.push({
            id: event.id,
            type: "checklist",
            item_key: event.checklist_item_key,
            payload: event.checklist_payload || {},
            created_at: event.created_at,
          });
        } else if (event.storage_path) {
          const { data: signed } = await admin.storage.from("service-images").createSignedUrl(event.storage_path, 300);
          output.push({
            id: event.id,
            type: "checklist_photo",
            item_key: event.checklist_item_key,
            signed_url: signed?.signedUrl || "",
            file_name: event.file_name || "foto.jpg",
            mime_type: event.mime_type || "image/jpeg",
            created_at: event.created_at,
          });
        }
      }
      return json({ success: true, events: output });
    }

    if (action === "cleanup") {
      await removeChecklistPhotos(admin, session.id);
      return json({ success: true });
    }

    return json({ success: false, error: "Ação inválida." }, 400);
  } catch (error) {
    console.error("[DEVICE CHECKLIST]", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Erro inesperado no checklist.",
    }, 500);
  }
});
