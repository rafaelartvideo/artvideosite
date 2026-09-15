import { createTransientSupabaseClient, supabase } from "@/lib/supabase";
import { authEmailForUsername, normalizeUsername } from "../domain/username";

export type AdminAuthenticationResult = "authenticated" | "invalid_credentials" | "inactive_user";
export type AdminPasswordChangeResult = "changed" | "invalid_credentials" | "inactive_user" | "weak_password" | "update_failed";

function authIdentifierEmail(identifier: string) {
  const normalized = String(identifier || "").trim().toLowerCase();
  // Transitional compatibility: until every existing Auth identity is moved to
  // the internal username address, the old e-mail can still be used directly.
  if (normalized.includes("@")) return normalized;
  return authEmailForUsername(normalizeUsername(normalized));
}

export async function authenticateAdmin(identifier: string, password: string): Promise<AdminAuthenticationResult> {
  const email = authIdentifierEmail(identifier);
  if (!email || !password) return "invalid_credentials";

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return "invalid_credentials";

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", data.user.id)
    .single();

  if (profile?.is_active === false) {
    await supabase.auth.signOut();
    return "inactive_user";
  }

  return "authenticated";
}

export async function changeAdminPassword(
  identifier: string,
  currentPassword: string,
  newPassword: string,
): Promise<AdminPasswordChangeResult> {
  if (newPassword.length < 8) return "weak_password";

  const email = authIdentifierEmail(identifier);
  if (!email || !currentPassword) return "invalid_credentials";

  const client = createTransientSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: currentPassword,
  });

  if (error || !data.user) return "invalid_credentials";

  try {
    const { data: profile } = await client
      .from("profiles")
      .select("is_active")
      .eq("id", data.user.id)
      .single();

    if (profile?.is_active === false) return "inactive_user";

    const { error: updateError } = await client.auth.updateUser({ password: newPassword });
    if (updateError) {
      const code = String((updateError as any)?.code || "").toLowerCase();
      const message = String(updateError.message || "").toLowerCase();
      if (code === "weak_password" || code.includes("password") || message.includes("weak password")) {
        return "weak_password";
      }
      return "update_failed";
    }

    return "changed";
  } finally {
    await client.auth.signOut();
  }
}
