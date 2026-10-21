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
    if (!["list", "register", "activate", "provision", "connect", "disconnect", "status", "qr", "logout", "webhook_setup"].includes(action)) {
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
    const fields="id,organization_id,display_name,state,phone,last_checked_at,last_connected_at,webhook_ready,created_at";
    const listQuery=()=>privileged.from("whatsapp_channel_connections")
      .select(fields).eq("organization_id",org).eq("provider","wuzapi").order("created_at",{ascending:true});
    const getAll=async()=>{
      const {data,error}=await listQuery();
      if(error)throw error;
      return (data||[]) as ChannelRow[];
    };
    const primary=(rows:ChannelRow[])=>rows.find(c=>c.state==="connected" || c.state==="connecting")||rows[0]||null;

    if(action==="list"){
      const rows=await getAll();
      return json({success:true,channels:rows,channel:primary(rows),can_manage:canManage,max_connections:3});
    }

    if(action==="activate" || action==="register"){
      const rows=await getAll();
      if(action==="activate" && rows.length){
        return json({success:true,channel:primary(rows),channels:rows,existed:true});
      }
      if(rows.length>=3)return json({success:false,error:"Limite de 3 números cadastrados por empresa."},409);
      const label=String(input.display_name||("WhatsApp "+(rows.length+1))).trim().slice(0,80);
      if(!label)return json({success:false,error:"Informe o nome da conexão."},400);
      const {data:created,error:createError}=await privileged.from("whatsapp_channel_connections")
        .insert({organization_id:org,provider:"wuzapi",display_name:label,
          state:"disconnected",created_by:auth.user.id})
        .select(fields).single();
      if(createError){
        if(createError.code==="23505" || createError.code==="23514")
          return json({success:false,error:"Limite de conexões atingido ou outra conexão em preparação."},409);
        throw createError;
      }
      // Each saved connection has its own persistent WuzAPI user and VPS credentials.
      try {
        await signedBridge("provision",created as ChannelRow);
      }catch(err) {
        // Keep the row for safe retries; never delete existing WuzAPI credentials.
        return json({success:false,code:"bridge_unavailable",connection_id:created.id,
          error:"Conexão cadastrada. Preparação da VPS pendente; tente novamente."},503);
      }
      const all=await getAll();
      return json({success:true,channel:created,channels:all});
    }

    const id=String(input.connection_id||"");
    if(!uuid(id))return json({success:false,error:"Selecione uma conexão WhatsApp."},400);
    const {data:channel,error:readError}=await privileged.from("whatsapp_channel_connections")
      .select(fields).eq("organization_id",org).eq("provider","wuzapi")
      .eq("id",id).maybeSingle();
    if(readError)throw readError;
    if(!channel)return json({success:false,error:"Conexão não pertence a esta empresa."},404);
    if(action==="webhook_setup" && channel.state!=="connected")
      return json({success:false,error:"Conecte o número antes de ativar o recebimento."},409);
    if(action==="connect"){
      const rows=await getAll();
      if(rows.some(other=>other.id!==id &&
        (other.state==="connected" || other.state==="connecting")))
        return json({success:false,error:"Desconecte o número ativo antes de conectar outro."},409);
      // Reserve the only active slot before performing the remote connect.
      // The DB partial unique index also prevents simultaneous requests racing.
      const {error:reserveError}=await privileged.from("whatsapp_channel_connections")
        .update({state:"connecting",updated_at:new Date().toISOString()})
        .eq("id",id).eq("organization_id",org);
      if(reserveError) return json({success:false,
        error:"Outra conexão está sendo ativada. Atualize a lista."},409);
    }
    let remote:Record<string,unknown>;
    try{
      remote=await signedBridge(action,channel as ChannelRow);
    }catch(err){
      if(action==="connect" && channel.state!=="connected"){
        await privileged.from("whatsapp_channel_connections").update({
          state:"disconnected",updated_at:new Date().toISOString()
        }).eq("id",id).eq("organization_id",org).eq("state","connecting");
      }
      const reason=String((err as Error)?.message||"");
      return json({success:false,code:"bridge_unavailable",
        error:reason.includes("ainda não foi configurada.")?reason:
          "A comunicação segura com a VPS está indisponível."},503);
    }

    const persistWebhook = async (response: Record<string, unknown>) => {
      if (response.auth_mode !== "hmac-sha256") {
        throw new Error("A ponte WhatsApp precisa da versão com autenticação HMAC.");
      }
      const hash = String(response.token_sha256 || "");
      if (!/^[a-f0-9]{64}$/.test(hash)) {
        throw new Error("A configuração segura do recebimento não foi confirmada.");
      }
      const { error: keyError } = await privileged.from("union_whatsapp_webhook_keys")
        .upsert({ channel_id: channel.id, token_sha256: hash, configured_at: new Date().toISOString() }, { onConflict: "channel_id" });
      if (keyError) throw keyError;
      const { data: updated, error: updateError } = await privileged.from("whatsapp_channel_connections")
        .update({ webhook_ready: true, updated_at: new Date().toISOString() })
        .eq("id", channel.id).eq("organization_id", org)
        .select("id,organization_id,display_name,state,phone,last_checked_at,last_connected_at,webhook_ready").single();
      if (updateError) throw updateError;
      return updated;
    };
    if (action === "webhook_setup") {
      if (remote.auth_mode !== "hmac-sha256") {
        return json({ success: false, code: "bridge_update_required",
          error: "A ponte WhatsApp da VPS precisa ser atualizada antes de ativar o recebimento seguro." }, 409);
      }
      return json({ success: true, channel: await persistWebhook(remote) });
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
    const state = action === "disconnect" || action === "logout" ? "disconnected" :
      loggedIn ? "connected" :
      action === "provision" || action === "connect" || connected ? "connecting" :
      action === "status" ? "disconnected" : previous;
    const patch: Record<string, unknown> = {
      state, last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    const phone = String(remote.phone || "").trim();
    if (loggedIn && /^[0-9]{10,15}$/.test(phone)) patch.phone = phone;
    if (loggedIn && (previous !== "connected" || (/^[0-9]{10,15}$/.test(phone) && phone!==channel.phone))) patch.last_connected_at = new Date().toISOString();
    // A full logout invalidates the paired session. On the next pairing,
    // configure the authenticated webhook again. Simple disconnect keeps it.
    if (action === "logout") patch.webhook_ready = false;
    const { data: updated, error: updateError } = await privileged.from("whatsapp_channel_connections")
      .update(patch).eq("id", channel.id).eq("organization_id", org)
      .select("id,organization_id,display_name,state,phone,last_checked_at,last_connected_at,webhook_ready")
      .single();
    if (updateError) throw updateError;
    // Pairing a number automatically configures authenticated message delivery.
    // Status checks retry only until ready; pairing still succeeds if the
    // bridge cannot finish webhook setup, without claiming it is enabled.
    if (loggedIn && !updated.webhook_ready && canManage) {
      try {
        const setup = await signedBridge("webhook_setup", updated as ChannelRow);
        const ready = await persistWebhook(setup);
        return json({ success: true, channel: ready, logged_in: true, connected });
      } catch {
        return json({ success: true, channel: updated, logged_in: true, connected,
          webhook_pending: true });
      }
    }
    return json({ success: true, channel: updated, logged_in: loggedIn, connected });
  } catch (error) {
    console.error("whatsapp-channels:", (error as Error).name);
    return json({ success: false, error: "Não foi possível concluir a operação." }, 500);
  }
});
