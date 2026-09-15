import { createClient } from "@supabase/supabase-js";
import { projectId, publicAnonKey } from "../../utils/supabase/info";

const supabaseUrl = `https://${projectId}.supabase.co`;

// Single reusable client — only uses the public anon key.
// Never import or use the service_role key on the frontend.
export const supabase = createClient(supabaseUrl, publicAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
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
