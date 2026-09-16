import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { isValidUsername, normalizeUsername } from "../domain/username";

export type AdminAuthenticationResult = "authenticated" | "invalid_credentials" | "inactive_user" | "ip_not_allowed";
export type AdminPasswordChangeResult = "changed" | "invalid_credentials" | "inactive_user" | "weak_password" | "update_failed";

async function functionErrorPayload(error: unknown) {
  if (!(error instanceof FunctionsHttpError)) return { message: "", code: "" };
  try {
    const payload = await error.context.json();
    return {
      message: typeof payload?.error === "string" ? payload.error : "",
      code: typeof payload?.code === "string" ? payload.code : "",
    };
  } catch {
    return { message: "", code: "" };
  }
}

export async function authenticateAdmin(identifier: string, password: string): Promise<AdminAuthenticationResult> {
  const username = normalizeUsername(identifier);
  if (!isValidUsername(username) || !password) return "invalid_credentials";

  const result = await supabase.functions.invoke("username-auth", {
    body: { action: "login", username, password },
  });
  if (result.error) {
    const payload = await functionErrorPayload(result.error);
    if (payload.code === "ip_not_allowed") return "ip_not_allowed";
    return "invalid_credentials";
  }
  if (!result.data?.access_token || !result.data?.refresh_token) return "invalid_credentials";

  const session = await supabase.auth.setSession({
    access_token: String(result.data.access_token),
    refresh_token: String(result.data.refresh_token),
  });
  if (session.error || !session.data.user) return "invalid_credentials";

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", session.data.user.id)
    .single();

  if (profile?.is_active === false) {
    await supabase.auth.signOut();
    return "inactive_user";
  }

  return "authenticated";
}

export async function validateCurrentSessionIp() {
  const result = await supabase.functions.invoke("username-auth", {
    body: { action: "validate_session" },
  });
  if (!result.error && result.data?.success === true) return true;
  return false;
}

export async function changeAdminPassword(
  identifier: string,
  currentPassword: string,
  newPassword: string,
): Promise<AdminPasswordChangeResult> {
  const username = normalizeUsername(identifier);
  if (!isValidUsername(username) || !currentPassword) return "invalid_credentials";
  if (newPassword.length < 8) return "weak_password";

  const result = await supabase.functions.invoke("username-auth", {
    body: {
      action: "change_password",
      username,
      password: currentPassword,
      new_password: newPassword,
    },
  });

  if (!result.error && result.data?.success === true) return "changed";

  const payload = await functionErrorPayload(result.error);
  if (payload.code === "weak_password" || payload.message.toLowerCase().includes("requisitos de segurança")) return "weak_password";
  if (payload.message.toLowerCase().includes("credenciais inválidas")) return "invalid_credentials";
  if (payload.message.toLowerCase().includes("inativo")) return "inactive_user";
  return "update_failed";
}
