import { createClient } from "@supabase/supabase-js";
import { projectId, publicAnonKey } from "../../utils/supabase/info";

export const supabaseUrl = `https://${projectId}.supabase.co`;

const persistentAuthStorage = typeof window === "undefined"
  ? undefined
  : {
      getItem(key: string) {
        const persistedValue = window.localStorage.getItem(key);
        if (persistedValue !== null) return persistedValue;

        // Migra uma sessão já aberta na versão antiga, que usava sessionStorage.
        const previousTabValue = window.sessionStorage.getItem(key);
        if (previousTabValue !== null) {
          window.localStorage.setItem(key, previousTabValue);
          window.sessionStorage.removeItem(key);
        }
        return previousTabValue;
      },
      setItem(key: string, value: string) {
        window.localStorage.setItem(key, value);
        window.sessionStorage.removeItem(key);
      },
      removeItem(key: string) {
        window.localStorage.removeItem(key);
        window.sessionStorage.removeItem(key);
      },
    };

// Single reusable client — only uses the public anon key.
// Never import or use the service_role key on the frontend.
export const supabase = createClient(supabaseUrl, publicAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: persistentAuthStorage,
  },
});

export function createTransientSupabaseClient() {
  return createClient(supabaseUrl, publicAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
