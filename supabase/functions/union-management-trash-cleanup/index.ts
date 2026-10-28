import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const BUCKET = "union-management";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-management-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const response = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), { status, headers });

type PurgeJob = { id: string; kind: "record" | "folder"; paths: string[] };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return response(200, { ok: true });
  if (req.method !== "POST") return response(405, { error: "Método não permitido" });
  if (!URL || !SERVICE || !ANON) return response(503, { error: "Serviço indisponível" });
  const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
  let queued = 0;
  const cronToken = req.headers.get("X-Management-Cron-Token");
  if (cronToken) {
    const { data: authorized, error } = await admin.rpc("management_cleanup_token_valid", { p_token: cronToken });
    if (error || authorized !== true) {
      console.warn("management trash cron access denied", { headerLength: cronToken.length, rpcError: error?.code ?? null, authorized: authorized === true });
      return response(403, { error: "Acesso negado" });
    }
  } else {
    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return response(401, { error: "Login obrigatório" });
    const token = authorization.slice(7);
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) return response(401, { error: "Sessão inválida" });
    const scoped = createClient(URL, ANON, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    let body: { action?: string; kind?: string; id?: string; spaceId?: string } = {};
    try { body = await req.json(); } catch { return response(400, { error: "Dados inválidos" }); }
    if (body.action !== "purge" || !["record","folder","all"].includes(body.kind ?? ""))
      return response(400, { error: "Ação inválida" });
    const isUuid = (value: unknown) => typeof value === "string"
      && /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value);
    if (body.kind !== "all" && !isUuid(body.id)) return response(400, { error: "Item inválido" });
    if (body.spaceId && !isUuid(body.spaceId)) return response(400, { error: "Espaço inválido" });
    const { data, error: enqueueError } = await scoped.rpc("management_enqueue_purge", {
      p_kind: body.kind, p_id: body.id ?? null, p_space: body.spaceId ?? null,
    });
    if (enqueueError) return response(403, { error: enqueueError.message });
    queued = Number(data ?? 0);
  }

  // A remoção de arquivos sempre passa pela Storage API, nunca por DELETE direto em storage.objects.
  let deleted = 0;
  let failed = 0;
  for (let i = 0; i < 30; i++) {
    const { data, error: claimError } = await admin.rpc("management_cleanup_claim");
    if (claimError) return response(500, { error: "Falha ao buscar exclusões", queued, deleted, failed });
    if (!data) break;
    const job = data as PurgeJob;
    let failure: string | null = null;
    const paths = Array.isArray(job.paths) ? [...new Set(job.paths.filter(p => typeof p === "string" && p.length > 0))] : [];
    for (let offset = 0; offset < paths.length; offset += 100) {
      const part = paths.slice(offset, offset + 100);
      const { error } = await admin.storage.from(BUCKET).remove(part);
      if (error) { failure = error.message; break; }
    }
    const { error: completeError } = await admin.rpc("management_cleanup_complete", {
      p_job: job.id, p_success: failure === null, p_error: failure,
    });
    if (completeError) {
      failed++;
      console.error("management-trash cleanup completion failed", job.id, completeError.message);
      // Não repetir a exclusão dos arquivos enquanto a transação do banco não concluiu.
      break;
    }
    if (failure) { failed++; console.error("management-trash Storage error", job.id, failure); }
    else deleted++;
  }
  return response(200, { ok: true, queued, deleted, failed });
});
