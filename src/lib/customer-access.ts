import { supabase } from "@/lib/supabase";

/**
 * Supabase FunctionsHttpError stores the HTTP response in error.context.
 * For non-2xx responses, invoke() can set data=null, so reading only
 * data?.error hides the actionable 409/422 validation message.
 */
export async function customerAccessRequest<T extends Record<string,unknown> = Record<string,unknown>>(
  action:string,
  fields:Record<string,unknown> = {},
): Promise<T & {success:true}> {
  const { data, error } = await supabase.functions.invoke("artvideo-customer-access", {
    body: { action, ...fields },
  });
  if (error) {
    let detail = typeof data?.error === "string" ? data.error : "";
    const context = (error as { context?: unknown }).context;
    if (!detail && context instanceof Response) {
      try {
        const json = await context.clone().json() as { error?: unknown };
        if (typeof json?.error === "string") detail = json.error;
      } catch {
        // Offline, malformed or unexpected provider response.
      }
    }
    throw new Error(detail || "Não foi possível concluir a solicitação. Confira sua conexão e tente novamente.");
  }
  if (!data || data.success !== true) {
    throw new Error(typeof data?.error === "string" ? data.error : "Não foi possível concluir a solicitação.");
  }
  return data as T & {success:true};
}
