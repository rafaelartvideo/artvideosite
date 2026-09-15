import { createClient } from "npm:@supabase/supabase-js@2.112.3";

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
  if (error || !profile || profile.is_active === false) return null;

  const authResult = await admin.auth.admin.getUserById(profile.id);
  if (authResult.error || !authResult.data.user?.email) return null;
  return { email: authResult.data.user.email };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const body = await req.json();
    const action = String(body?.action ?? "login");
    const username = normalizeUsername(body?.username);
    const password = String(body?.password ?? "");

    if (!usernamePattern.test(username) || !password) return json({ error: "Credenciais inválidas." }, 400);

    const login = await resolveLogin(username);
    if (!login) return json({ error: "Credenciais inválidas." }, 400);

    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const signIn = await client.auth.signInWithPassword({ email: login.email, password });
    if (signIn.error || !signIn.data.session) return json({ error: "Credenciais inválidas." }, 400);

    if (action === "login") {
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
      await client.auth.signOut();
      return json({ success: true });
    }

    return json({ error: "Ação não suportada." }, 400);
  } catch (error) {
    console.error("[username-auth]", error);
    return json({ error: "Não foi possível processar a autenticação." }, 400);
  }
});
