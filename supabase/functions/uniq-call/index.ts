import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });

const ARTVIDEO_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const DEFAULT_UNIQ_API_BASE_URL = "https://api.uniq.app";

function normalizeBrazilDestination(value: unknown) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  return digits.length === 10 || digits.length === 11 ? digits : "";
}

async function authenticatedUser(request: Request, supabaseUrl: string, anonKey: string) {
  const authorization = request.headers.get("Authorization");
  if (!authorization) return null;
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const uniqApiKey = Deno.env.get("UNIQ_API_KEY")?.trim();
  const uniqApiBaseUrl = (Deno.env.get("UNIQ_API_BASE_URL")?.trim() || DEFAULT_UNIQ_API_BASE_URL).replace(/\/+$/, "");

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !uniqApiKey) {
    return json({ success: false, error: "Integração Uniq não configurada no servidor." }, 503);
  }

  try {
    const user = await authenticatedUser(request, supabaseUrl, anonKey);
    if (!user) return json({ success: false, error: "Usuário não autenticado." }, 401);

    const input = await request.json().catch(() => ({} as Record<string, unknown>));
    const destination = normalizeBrazilDestination(input.phone);
    if (!destination) {
      return json({ success: false, error: "Telefone inválido. Informe DDD e número." }, 400);
    }

    const serviceOrderId = typeof input.service_order_id === "string" && input.service_order_id.trim()
      ? input.service_order_id.trim()
      : null;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: employee, error: employeeError } = await admin
      .from("employees")
      .select("id,organization_id,profile_id,is_active,uniq_subscriber_id")
      .eq("organization_id", ARTVIDEO_ORGANIZATION_ID)
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (employeeError) {
      console.error("[UNIQ CALL] employee lookup error", employeeError);
      return json({ success: false, error: "Não foi possível validar o vínculo com a Uniq." }, 500);
    }

    const subscriberId = String(employee?.uniq_subscriber_id || "").trim();
    if (!employee || !subscriberId) {
      return json({ success: false, error: "Seu usuário não possui um usuário/ramal Uniq vinculado." }, 403);
    }

    const endpoint = `${uniqApiBaseUrl}/users/${encodeURIComponent(subscriberId)}/call`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${uniqApiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ to: destination }),
    });

    const raw = await response.text();
    let payload: Record<string, unknown> = {};
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
      } catch {
        payload = {};
      }
    }

    if (!response.ok) {
      console.error("[UNIQ CALL] API error", {
        status: response.status,
        subscriber_id: subscriberId,
        body: raw.slice(0, 500),
      });
      return json({
        success: false,
        error: "A Uniq não conseguiu iniciar a chamada.",
        status: response.status,
      }, response.status >= 400 && response.status < 600 ? response.status : 502);
    }

    const callId = typeof payload.call === "string" ? payload.call.trim() : "";
    if (!callId) {
      console.error("[UNIQ CALL] response without call id", { subscriber_id: subscriberId, payload });
      return json({ success: false, error: "A Uniq iniciou a requisição, mas não retornou o identificador da chamada." }, 502);
    }

    return json({
      success: true,
      call: callId,
      phone: destination,
      subscriber_id: subscriberId,
      service_order_id: serviceOrderId,
    });
  } catch (error) {
    console.error("[UNIQ CALL] unexpected error", error);
    return json({ success: false, error: "Não foi possível iniciar a chamada pela Uniq." }, 500);
  }
});
