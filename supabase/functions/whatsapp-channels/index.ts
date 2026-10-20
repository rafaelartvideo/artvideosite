import { createClient } from "npm:@supabase/supabase-js@2.112.3";

// Stage 1: only metadata and QR/session control. The raw WuzAPI port is never
// called from Supabase. A separate authenticated HTTPS bridge must be deployed.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,apikey,x-client-info,content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
const uuid = (v: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ""));
const textEncoder = new TextEncoder();
const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");

function envKey(legacy: string, modern: string) {
  const previous = Deno.env.get(legacy);
  if (previous) return previous;
  try {
    const set = JSON.parse(Deno.env.get(modern) || "{}");
    return String(set.default || Object.values(set)[0] || "");
  } catch { return ""; }
}

type ChannelRow = {
  id: string;
  organization_id: string;
  display_name: string;
  state: string;
  phone: string | null;
  last_checked_at: string | null;
  last_connected_at: string | null;
  webhook_ready: boolean;
};

async function signedBridge(action: string, channel: ChannelRow) {
  const target = Deno.env.get("UNION_WUZAPI_BRIDGE_URL")?.trim() || "";
  const secret = Deno.env.get("UNION_WUZAPI_BRIDGE_SECRET")?.trim() || "";
  let url: URL;
  try { url = new URL(target); } catch { throw new Error("A ponte segura WuzAPI ainda não foi configurada."); }
  if (url.protocol !== "https:" || url.username || url.password || !secret) {
    throw new Error("A ponte segura WuzAPI ainda não foi configurada.");
  }
  const body = JSON.stringify({
    action, connection_id: channel.id, organization_id: channel.organization_id,
  });
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const signedText = timestamp + "." + nonce + "." + body;
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = hex(await crypto.subtle.sign("HMAC", key, textEncoder.encode(signedText)));
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 12_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Union-Timestamp": timestamp,
        "X-Union-Nonce": nonce,
        "X-Union-Signature": signature,
      },
      body, signal: abort.signal,
    });
    const result = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok || result.ok !== true) {
      throw new Error("A ponte WuzAPI não conseguiu executar a operação. Consulte o administrador.");
    }
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ success: false, error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const publicKey = envKey("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS");
  const adminKey = envKey("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS");
  const bearer = request.headers.get("Authorization") || "";
  if (!bearer.startsWith("Bearer ") || !supabaseUrl || !publicKey || !adminKey) {
    return json({ success: false, error: "Sessão ou integração indisponível." }, 401);
  }
  try {
    const input = await request.json() as Record<string, unknown>;
    const org = String(input?.organization_id || "");
    const action = String(input?.action || "");
    if (!uuid(org)) return json({ success: false, error: "Empresa inválida." }, 400);
    if (!["list", "register", "provision", "connect", "status", "qr", "logout", "webhook_setup"].includes(action)) {
      return json({ success: false, error: "Operação inválida." }, 400);
    }
    const scoped = createClient(supabaseUrl, publicKey, {
      global: { headers: { Authorization: bearer } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const privileged = createClient(supabaseUrl, adminKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await scoped.auth.getUser();
    if (authError || !auth.user) return json({ success: false, error: "Sessão expirada." }, 401);
    const { data: permissionRows, error: permissionError } = await scoped.rpc("my_organization_permissions", { p_organization_id: org });
    if (permissionError) return json({ success: false, error: "Acesso negado." }, 403);
    const keys = new Set((Array.isArray(permissionRows) ? permissionRows : []).map(
      (p: Record<string, unknown>) => String(p.permission_key || ""),
    ));
    const canManage = keys.has("settings.channels.manage");
    const canRead = canManage || keys.has("settings.channels.view");
    if (!canRead || (action !== "list" && action !== "status" && !canManage)) {
      return json({ success: false, error: "Sem permissão para gerenciar canais nesta empresa." }, 403);
    }
    const query = () => privileged.from("whatsapp_channel_connections")
      .select("id,organization_id,display_name,state,phone,last_checked_at,last_connected_at,webhook_ready")
      .eq("organization_id", org).eq("provider", "wuzapi").maybeSingle();

    if (action === "list") {
      const { data, error } = await query();
      if (error) throw error;
      return json({ success: true, channel: data, can_manage: canManage });
    }

    if (action === "register") {
      const displayName = String(input.display_name || "WhatsApp Business").trim().slice(0, 80);
      if (!displayName) return json({ success: false, error: "Informe o nome do canal." }, 400);
      const { data: existing, error: readError } = await query();
      if (readError) throw readError;
      if (existing) return json({ success: true, channel: existing, existed: true });
      const { data, error } = await privileged.from("whatsapp_channel_connections")
        .upsert({
          organization_id: org, provider: "wuzapi",
          display_name: displayName, created_by: auth.user.id,
        }, { onConflict: "organization_id,provider", ignoreDuplicates: true })
        .select("id,organization_id,display_name,state,phone,last_checked_at,last_connected_at,webhook_ready")
        .maybeSingle();
      if (error) throw error;
      const channel = data || (await query()).data;
      return json({ success: true, channel });
    }

    const { data: channel, error } = await query();
    if (error) throw error;
    if (!channel) return json({ success: false, error: "Cadastre o canal primeiro." }, 404);
    if (input.connection_id && input.connection_id !== channel.id) {
      return json({ success: false, error: "Canal inválido para esta empresa." }, 403);
    }
    if (action === "webhook_setup" && channel.state !== "connected") {
      return json({ success: false, error: "Conecte o WhatsApp antes de ativar o recebimento." }, 409);
    }
    let remote: Record<string, unknown>;
    try {
      remote = await signedBridge(action, channel as ChannelRow);
    } catch (err) {
      const reason = String((err as Error)?.message || "");
      return json({
        success: false, code: "bridge_unavailable",
        error: reason.includes("ainda não foi configurada.")
          ? reason : "A comunicação segura com a VPS está indisponível.",
      }, 503);
    }

    if (action === "webhook_setup") {
      const hash = String(remote.token_sha256 || "");
      if (!/^[a-f0-9]{64}$/.test(hash)) {
        return json({ success: false, error: "A configuração segura do webhook não foi confirmada." }, 502);
      }
      const { error: keyError } = await privileged.from("union_whatsapp_webhook_keys")
        .upsert({ channel_id: channel.id, token_sha256: hash, configured_at: new Date().toISOString() }, { onConflict: "channel_id" });
      if (keyError) throw keyError;
      const { data: updated, error: updateError } = await privileged.from("whatsapp_channel_connections")
        .update({ webhook_ready: true, updated_at: new Date().toISOString() })
        .eq("id", channel.id).eq("organization_id", org)
        .select("id,organization_id,display_name,state,phone,last_checked_at,last_connected_at,webhook_ready").single();
      if (updateError) throw updateError;
      return json({ success: true, channel: updated });
    }
    const previous = String(channel.state || "not_connected");
    if (action === "qr") {
      const qr = String(remote.qr || "");
      if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(qr) || qr.length > 250_000) {
        return json({ success: false, error: "QR Code não está disponível; tente atualizar em alguns segundos." }, 409);
      }
      return json({ success: true, qr });
    }
    const loggedIn = remote.logged_in === true;
    const connected = remote.connected === true;
    const state = loggedIn ? "connected" :
      action === "logout" ? "disconnected" :
      action === "provision" || action === "connect" || connected ? "connecting" :
      action === "status" ? "disconnected" : previous;
    const patch: Record<string, unknown> = {
      state, last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    const phone = String(remote.phone || "").trim();
    if (loggedIn && /^[0-9]{10,15}$/.test(phone)) patch.phone = phone;
    if (loggedIn && previous !== "connected") patch.last_connected_at = new Date().toISOString();
    const { data: updated, error: updateError } = await privileged.from("whatsapp_channel_connections")
      .update(patch).eq("id", channel.id).eq("organization_id", org)
      .select("id,organization_id,display_name,state,phone,last_checked_at,last_connected_at,webhook_ready")
      .single();
    if (updateError) throw updateError;
    return json({ success: true, channel: updated, logged_in: loggedIn, connected });
  } catch (error) {
    console.error("whatsapp-channels:", (error as Error).name);
    return json({ success: false, error: "Não foi possível concluir a operação." }, 500);
  }
});
