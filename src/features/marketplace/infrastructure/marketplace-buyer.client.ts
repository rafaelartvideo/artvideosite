import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/supabase";
import { publicAnonKey } from "../../../../utils/supabase/info";

// O login do contratante não interfere na sessão dos funcionários do CRM.
// A chave de sessão é exclusiva do Marketplace e nunca utiliza service_role.
export const marketplaceBuyerClient = createClient(supabaseUrl, publicAnonKey, {
  auth: {
    storageKey: "unionworld-marketplace-buyer-session",
    storage: typeof window === "undefined" ? undefined : window.localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});
