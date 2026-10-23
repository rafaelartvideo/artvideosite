import { supabase } from "@/lib/supabase";

/** Auditagem complementar: falhas de rede nunca bloqueiam a autenticação. */
export async function recordAuthActivity(action: "login" | "logout"): Promise<void> {
  try {
    const { error } = await supabase.rpc("record_user_auth_activity", { p_action: action });
    if (error) console.warn("[ACESSO] Não foi possível registrar", action, error.message);
  } catch (error) {
    console.warn("[ACESSO] Não foi possível registrar", action, error);
  }
}
