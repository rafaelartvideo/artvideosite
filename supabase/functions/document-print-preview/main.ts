import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

function clients(request: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRole) throw new Error("Supabase do PDF de impressão não configurado.");
  const authorization = request.headers.get("Authorization") || "";
  return {
    url,
    serviceRole,
    authClient: createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

async function requireUser(authClient: any, request: Request) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw Object.assign(new Error("Sessão inválida."), { status: 401 });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) throw Object.assign(new Error("Sessão inválida."), { status: 401 });
  return data.user;
}

async function requirePrintPermission(authClient: any, organizationId: string) {
  const { data, error } = await authClient.rpc("can_document_signature_action", {
    p_organization_id: organizationId,
    p_permission_key: "documents.print",
  });
  if (error) throw error;
  if (data !== true) throw Object.assign(new Error("Você não possui permissão para imprimir documentos."), { status: 403 });
}

async function ensureOrderVisible(authClient: any, organizationId: string, serviceOrderId: string) {
  const { data, error } = await authClient
    .from("service_orders")
    .select("id,organization_id")
    .eq("id", serviceOrderId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error || !data) throw Object.assign(new Error("OS não encontrada ou sem permissão de acesso."), { status: 403 });
}

async function invokeRenderer(url: string, serviceRole: string, payload: Record<string, unknown>) {
  const response = await fetch(`${url.replace(/\/+$/, "")}/functions/v1/document-signature-public`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRole}`,
      apikey: serviceRole,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "render_preview_internal", ...payload }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) throw Object.assign(new Error(String(result?.error || "Não foi possível gerar o PDF de impressão.")), { status: response.status || 400 });
  return result;
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Método não permitido." }, 405);
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = text(body.organization_id, 64);
    const serviceOrderId = text(body.service_order_id, 64);
    const printTemplateId = text(body.print_template_id, 64);
    const snapshot = body.snapshot;
    if (!UUID_PATTERN.test(organizationId) || !UUID_PATTERN.test(serviceOrderId) || !UUID_PATTERN.test(printTemplateId)) throw new Error("Dados de impressão inválidos.");
    if (!snapshot || typeof snapshot !== "object") throw new Error("Snapshot do documento inválido.");
    if (text(snapshot?.order?.id, 64) !== serviceOrderId || text(snapshot?.order?.organization_id, 64) !== organizationId) throw new Error("O snapshot não corresponde à OS selecionada.");

    const { url, serviceRole, authClient } = clients(request);
    await requireUser(authClient, request);
    await requirePrintPermission(authClient, organizationId);
    await ensureOrderVisible(authClient, organizationId, serviceOrderId);

    const snapshotHash = await sha256Hex(JSON.stringify(snapshot));
    const rendered = await invokeRenderer(url, serviceRole, {
      organization_id: organizationId,
      service_order_id: serviceOrderId,
      print_template_id: printTemplateId,
      snapshot_hash: snapshotHash,
      snapshot,
    });
    return json({ success: true, preview_url: rendered.preview_url, pdf_hash: rendered.pdf_hash, snapshot_hash: snapshotHash });
  } catch (error) {
    const status = Number((error as any)?.status) || 400;
    console.error("[DOCUMENT PRINT PREVIEW]", error instanceof Error ? error.message : "Erro inesperado");
    return json({ success: false, error: error instanceof Error ? error.message : "Não foi possível gerar o PDF de impressão." }, status >= 400 && status < 600 ? status : 400);
  }
});
