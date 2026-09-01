import { supabase } from "@/lib/supabase";

export type AdminAuthenticationResult = "authenticated" | "invalid_credentials" | "inactive_user";

export async function authenticateAdmin(email: string, password: string): Promise<AdminAuthenticationResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

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
