// Union World / WuzAPI control bridge.
// Run on the VPS behind HTTPS reverse proxy. Never publish WuzAPI 18080.
// Requires Node.js 20+, UNION_WUZAPI_BRIDGE_SECRET, WUZAPI_ADMIN_TOKEN.
// No Supabase secret key is required on the VPS.
import { createServer } from "node:http";
import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";

const host = "127.0.0.1";
const port = Number(process.env.UNION_BRIDGE_PORT || 19080);
const secret = process.env.UNION_WUZAPI_BRIDGE_SECRET || "";
const adminToken = process.env.WUZAPI_ADMIN_TOKEN || "";
const sessionsDir = process.env.UNION_WUZAPI_SESSIONS_DIR || "/opt/union-wuzapi-bridge/sessions";
const wuzapiBase = "http://127.0.0.1:18080";
if (secret.length < 32 || adminToken.length < 16 || !Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("Configuração da ponte inválida: configure os segredos e a porta.");
}
await mkdir(sessionsDir, { recursive: true, mode: 0o700 });
const seenNonces = new Map();
const pendingProvision = new Map();
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");
const reply = (res, status, payload) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
};
const tokenFile = id => join(sessionsDir, `${id}.json`);
const safeData = input => ({
  connected: input?.data?.Connected === true || input?.data?.connected === true,
  logged_in: input?.data?.LoggedIn === true || input?.data?.logged_in === true,
});
async function readSession(id, org) {
  let result;
  try { result = JSON.parse(await readFile(tokenFile(id), "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
  if (result.organization_id !== org || !result.token) throw new Error("session_mismatch");
  return result;
}
async function saveSession(id, session) {
  const tmp = tokenFile(id) + ".tmp";
  await writeFile(tmp, JSON.stringify(session), { mode: 0o600, flag: "w" });
  await rename(tmp, tokenFile(id));
}

async function wuzapi(path, token, method = "GET", body) {
  const response = await fetch(wuzapiBase + path, {
    method,
    headers: {
      ...(path.startsWith("/admin/") ? { Authorization: adminToken } : { Token: token }),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(9000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.success === false) throw new Error("provider_error");
  return result;
}

async function provision(id, org) {
  if (pendingProvision.has(id)) return pendingProvision.get(id);
  const attempt = (async () => {
    const existing = await readSession(id, org);
    if (existing?.ready === true) return { ok: true, connected: false, logged_in: false };
    const token = existing?.token || randomBytes(32).toString("hex");
    const row = { organization_id: org, token, ready: false };
    const name = "union_" + id.replaceAll("-", "");
    // Commit the token locally before contacting WuzAPI. A retry reuses it;
    // it never silently creates a new token for an existing WuzAPI user.
    await saveSession(id, row);
    try {
      await wuzapi("/admin/users", adminToken, "POST", {
        name, token, webhook: "", events: "Message,ReadReceipt,HistorySync",
      });
    } catch (failure) {
      // Recover only if WuzAPI already contains the exact user AND token.
      // Do not treat a duplicate name using a different token as success.
      const users = await wuzapi("/admin/users", adminToken);
      const list = Array.isArray(users) ? users : (Array.isArray(users?.data) ? users.data : []);
      if (!list.some(user => user?.name === name && user?.token === token)) throw failure;
    }
    await saveSession(id, { ...row, ready: true });
    return { ok: true, connected: false, logged_in: false };
  })().finally(() => pendingProvision.delete(id));
  pendingProvision.set(id, attempt);
  return attempt;
}

async function operate({ action, connection_id: id, organization_id: org }) {
  if (!uuid(id) || !uuid(org)) throw new Error("bad_request");
  if (!["provision", "connect", "status", "qr", "logout"].includes(action)) throw new Error("bad_request");
  if (action === "provision") return provision(id, org);
  const session = await readSession(id, org);
  if (!session) throw new Error("session_missing");
  if (session.ready !== true) throw new Error("session_not_ready");
  if (action === "connect") {
    await wuzapi("/session/connect", session.token, "POST", {
      Subscribe: ["Message", "ReadReceipt", "HistorySync"], Immediate: true,
    });
  }
  if (action === "logout") {
    await wuzapi("/session/logout", session.token, "POST");
    return { ok: true, connected: false, logged_in: false };
  }
  if (action === "qr") {
    const result = await wuzapi("/session/qr", session.token);
    const qr = String(result?.data?.QRCode || "");
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(qr) || qr.length > 250_000) {
      throw new Error("qr_unavailable");
    }
    return { ok: true, qr };
  }
  const status = safeData(await wuzapi("/session/status", session.token));
  return { ok: true, ...status };
}

function verified(headers, raw) {
  const timestamp = headers["x-union-timestamp"];
  const nonce = headers["x-union-nonce"];
  const sig = headers["x-union-signature"];
  if (typeof timestamp !== "string" || typeof nonce !== "string" || typeof sig !== "string") return false;
  if (!/^\d{13}$/.test(timestamp) || !/^[a-f0-9-]{36}$/i.test(nonce) || !/^[a-f0-9]{64}$/i.test(sig)) return false;
  const now = Date.now();
  if (Math.abs(now - Number(timestamp)) > 60_000 || seenNonces.has(nonce)) return false;
  const expected = createHmac("sha256", secret).update(timestamp + "." + nonce + "." + raw).digest();
  const received = Buffer.from(sig, "hex");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false;
  seenNonces.set(nonce, now);
  for (const [id, time] of seenNonces) if (now - time > 70_000) seenNonces.delete(id);
  if (seenNonces.size > 15000) return false;
  return true;
}

createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/v1/channel-control") {
    reply(res, 404, { ok: false });
    return;
  }
  const chunks = [];
  let length = 0;
  try {
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 10000) throw new Error("oversize");
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    if (!verified(req.headers, raw)) return reply(res, 401, { ok: false, code: "unauthorized" });
    const body = JSON.parse(raw);
    const result = await operate(body);
    reply(res, 200, result);
  } catch (error) {
    const code = error?.message;
    const status = code === "bad_request" ? 400 : code === "session_missing" ? 404 : ["qr_unavailable", "session_not_ready"].includes(code) ? 409 : 502;
    console.error("union-bridge:", status, code);
    reply(res, status, { ok: false, code: status === 502 ? "provider_unavailable" : code });
  }
}).listen(port, host, () => console.log(`Union WuzAPI bridge on ${host}:${port}`));
