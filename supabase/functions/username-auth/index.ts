import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { extractClientIp } from "./access-policy.mjs";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const normalizeUsername = (value: unknown) => String(value ?? "").trim().toLowerCase();

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function resolveLogin(username: string) {
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id,is_active")
    .eq("username", username)
    .maybeSingle();
  if (error) throw error;
  if (!profile || profile.is_active === false) return null;

  const authResult = await admin.auth.admin.getUserById(profile.id);
  if (authResult.error) throw authResult.error;
  if (!authResult.data.user?.email) return null;
  return { id: profile.id, email: authResult.data.user.email };
}

async function ipAccessAllowed(profileId: string, req: Request) {
  const clientIp = extractClientIp(req.headers);
  const { data, error } = await admin.rpc("is_profile_ip_allowed", {
    p_profile_id: profileId,
    p_client_ip: clientIp ?? "",
  });
  if (error) throw error;
  return data === true;
}

function bearerToken(req: Request) {
  return req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
}

// Validate the active schedule after checking the password but BEFORE sending
// tokens to the browser. No schedule configured is the fast, unrestricted path.
// All authorization-sensitive reads are scoped to the authenticated actor.
async function allowedByEmployeeSchedule(profileId: string, accessToken: string): Promise<boolean> {
  // The common setup state has zero enabled schedules across all tenants.
  // One indexed read avoids fetching membership lists or executing RLS RPCs.
  const { data: anyEnabled, error: enabledError } = await admin
    .from("employee_crm_access_hours").select("organization_id")
    .eq("enabled", true).limit(1);
  if (enabledError) throw enabledError;
  if (!anyEnabled?.length) return true;

  const { data: members, error: membershipError } = await admin
    .from("organization_members").select("organization_id")
    .eq("user_id", profileId).eq("status", "active").limit(80);
  if (membershipError) throw membershipError;
  const organizationIds = [...new Set((members || []).map(row => row.organization_id))];
  if (!organizationIds.length) return true; // Existing bootstrap handles accounts without a tenant.

  const { data: enabled, error: scheduleError } = await admin
    .from("employee_crm_access_hours").select("organization_id")
    .in("organization_id", organizationIds).eq("enabled", true).limit(1);
  if (scheduleError) throw scheduleError;
  if (!enabled?.length) return true;

  const scoped = createClient(url, anonKey, {
    global: { headers: { Authorization: "Bearer " + accessToken } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const statuses = await Promise.all(organizationIds.map(async organizationId => {
    const { data, error } = await scoped.rpc("check_my_employee_crm_access_hours_v2", {
      p_organization_id: organizationId,
    });
    if (error) throw error;
    return data?.allowed === true;
  }));
  return statuses.some(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const body = await req.json();
    const action = String(body?.action ?? "login");

    if (action === "validate_session") {
      const token = bearerToken(req);
      if (!token) return json({ error: "Usuário não autenticado." }, 401);
      const client = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const userResult = await client.auth.getUser(token);
      if (userResult.error || !userResult.data.user) return json({ error: "Usuário não autenticado." }, 401);
      if (!await ipAccessAllowed(userResult.data.user.id, req)) {
        return json({
          error: "Acesso negado. Este endereço IP não está autorizado para este usuário.",
          code: "ip_not_allowed",
        }, 403);
      }
      return json({ success: true });
    }

    const username = normalizeUsername(body?.username);
    const password = String(body?.password ?? "");

    if (!usernamePattern.test(username) || !password) return json({ error: "Credenciais inválidas." }, 400);

    const login = await resolveLogin(username);
    if (!login) return json({ error: "Credenciais inválidas." }, 400);

    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const signIn = await client.auth.signInWithPassword({ email: login.email, password });
    if (signIn.error && signIn.error.status >= 500) {
      return json({ error: "Serviço de autenticação temporariamente indisponível.", code: "service_unavailable" }, 503);
    }
    if (signIn.error || !signIn.data.session) return json({ error: "Credenciais inválidas." }, 400);

    if (!await ipAccessAllowed(login.id, req)) {
      await client.auth.signOut({ scope: "local" });
      return json({
        error: "Acesso negado. Este endereço IP não está autorizado para este usuário.",
        code: "ip_not_allowed",
      }, 403);
    }

    if (action === "login") {
      // Auth GoTrue checks credentials first, but the CRM has not received
      // a usable browser session yet. Refuse outside-hours sign-ins here.
      let scheduleAllowed: boolean;
      try {
        scheduleAllowed = await allowedByEmployeeSchedule(login.id, signIn.data.session.access_token);
      } catch (scheduleError) {
        console.error("[username-auth] schedule check unavailable", scheduleError);
        await client.auth.signOut({ scope: "local" });
        return json({ error: "Não foi possível verificar seu expediente. Tente novamente.",
          code: "schedule_unavailable" }, 503);
      }
      if (!scheduleAllowed) {
        await client.auth.signOut({ scope: "local" });
        return json({ error: "Fora do horário de acesso. Consulte sua escala com o gestor.",
          code: "outside_hours" }, 403);
      }
      return json({
        success: true,
        access_token: signIn.data.session.access_token,
        refresh_token: signIn.data.session.refresh_token,
        expires_at: signIn.data.session.expires_at ?? null,
      });
    }

    if (action === "change_password") {
      const newPassword = String(body?.new_password ?? "");
      if (newPassword.length < 8) return json({ error: "A nova senha deve ter pelo menos 8 caracteres.", code: "weak_password" }, 400);
      const updated = await client.auth.updateUser({ password: newPassword });
      if (updated.error) {
        const message = String(updated.error.message || "").toLowerCase();
        const code = String((updated.error as any)?.code || "").toLowerCase();
        if (code === "weak_password" || message.includes("weak password")) {
          return json({ error: "A nova senha não atende aos requisitos de segurança.", code: "weak_password" }, 400);
        }
        return json({ error: "Não foi possível alterar a senha." }, 400);
      }
      await client.auth.signOut({ scope: "local" });
      return json({ success: true });
    }

    return json({ error: "Ação não suportada." }, 400);
  } catch (error) {
    console.error("[username-auth]", error);
    return json({ error: "Serviço de autenticação temporariamente indisponível.", code: "service_unavailable" }, 503);
  }
});
