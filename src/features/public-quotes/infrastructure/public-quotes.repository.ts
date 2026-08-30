import { supabase } from "@/lib/supabase";

export async function createPublicQuote(payload: Record<string, unknown>) {
  return supabase.rpc("submit_public_quote_request", payload);
}
