import { createClient } from "@supabase/supabase-js";
import { projectId, publicAnonKey } from "../../utils/supabase/info";

export const supabaseUrl = `https://${projectId}.supabase.co`;

// O marcador é um cookie de SESSÃO (sem Max-Age/Expires): funciona em todas
// as abas da origem, mas desaparece ao encerrar a sessão do navegador.
// Os tokens continuam no localStorage para sincronização entre abas, porém
// não podem ser reutilizados sem o marcador do navegador atual.
const AUTH_STORAGE_KEY = `sb-${projectId}-auth-token`;
const BROWSER_SESSION_COOKIE = "unionworld_browser_session";
const SESSION_ACTIVITY_PREFIX = "unionworld:session:last-activity:";

function hasBrowserSession() {
  return document.cookie.split(";").some(cookie =>
    cookie.trim() === `${BROWSER_SESSION_COOKIE}=1`
  );
}

function setBrowserSession() {
  document.cookie = `${BROWSER_SESSION_COOKIE}=1; Path=/; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
}

function clearBrowserSession() {
  document.cookie = `${BROWSER_SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

const persistentAuthStorage = typeof window === "undefined"
  ? undefined
  : {
      getItem(key: string) {
        // Ao reabrir o navegador, descarta a sessão antiga antes que o
        // Supabase possa restaurar/atualizar seus tokens automaticamente.
        if (key === AUTH_STORAGE_KEY && !hasBrowserSession()) {
          const hadPreviousSession =
            window.localStorage.getItem(key) !== null ||
            window.sessionStorage.getItem(key) !== null;
          window.localStorage.removeItem(key);
          window.sessionStorage.removeItem(key);

          // O próximo login deve ganhar seus próprios 20 minutos de atividade.
          if (hadPreviousSession) {
            for (let i = window.localStorage.length - 1; i >= 0; i--) {
              const storedKey = window.localStorage.key(i);
              if (storedKey?.startsWith(SESSION_ACTIVITY_PREFIX)) {
                window.localStorage.removeItem(storedKey);
              }
            }
          }
          return null;
        }

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
        if (key === AUTH_STORAGE_KEY) setBrowserSession();
        window.localStorage.setItem(key, value);
        window.sessionStorage.removeItem(key);
      },
      removeItem(key: string) {
        window.localStorage.removeItem(key);
        window.sessionStorage.removeItem(key);
        if (key === AUTH_STORAGE_KEY) clearBrowserSession();
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
