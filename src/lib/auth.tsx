import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Profile } from "./database.types";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  employee: any | null;
  role: any | null;
  permissions: any[];
  hasPermission: (permissionKey: string) => boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  profile: null,
  employee: null,
  role: null,
  permissions: [],
  hasPermission: () => false,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [employee, setEmployee] = useState<any | null>(null);
  const [role, setRole] = useState<any | null>(null);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const accessRequestRef = useRef(0);
  const accessLoadingUserRef = useRef<string | null>(null);
  const signedInUserRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Hydrate session from storage on mount
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session?.user) {
        signedInUserRef.current = data.session.user.id;
        loadAccess(data.session.user.id);
      }
      else setLoading(false);
    });

    // Keep session in sync across tabs / token refreshes
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;

      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        if (!newSession?.user) return;

        const activeUserId = signedInUserRef.current ?? session?.user?.id ?? null;
        if (activeUserId && newSession.user.id !== activeUserId) {
          return;
        }

        if (event === "SIGNED_IN" && newSession.user.id === signedInUserRef.current) return;

        setSession(newSession);
        signedInUserRef.current = newSession.user.id;
        loadAccess(newSession.user.id);
        return;
      }

      if (event === "SIGNED_OUT") {
        signedInUserRef.current = null;
        setSession(null);
        setProfile(null); setEmployee(null); setRole(null); setPermissions([]); setLoading(false);
        return;
      }

      setSession(newSession);
    });

    return () => { cancelled = true; listener.subscription.unsubscribe(); };
  }, []);

  async function loadAccess(userId: string) {
    if (accessLoadingUserRef.current === userId) {
      return;
    }
    accessLoadingUserRef.current = userId;
    try {
      await loadAccessData(userId);
    } finally {
      if (accessLoadingUserRef.current === userId) accessLoadingUserRef.current = null;
    }
  }

  async function loadAccessData(userId: string) {
    const requestId = ++accessRequestRef.current;
    setLoading(true);

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (profileError || !profileData) {
      console.error("Auth profile load error:", profileError);
      setLoading(false);
      return;
    }

    const roleId = profileData.role_id;
    const [{ data: employeeData }, { data: roleData, error: roleError }, { data: permissionData, error: permissionError }] = await Promise.all([
      supabase.from("employees").select("*").eq("profile_id", userId).maybeSingle(),
      roleId ? supabase.from("roles").select("*").eq("id", roleId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      supabase.rpc("my_permissions"),
    ]);

    const permissionKeys = (permissionData || [])
      .map((permission: any) => typeof permission === "string" ? permission : permission?.permission_key)
      .filter((permissionKey: unknown): permissionKey is string => typeof permissionKey === "string" && permissionKey.length > 0);
    if (permissionError) console.error("Auth permissions RPC error:", permissionError);
    if (requestId !== accessRequestRef.current) return;

    setProfile(profileData ?? null);
    if (employeeData) setEmployee(employeeData);
    if (!roleError && roleData) setRole(roleData);
    if (!permissionError) setPermissions(permissionKeys.map(key => ({ key })));
    setLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    signedInUserRef.current = null;
    setSession(null);
    setProfile(null);
    setEmployee(null);
    setRole(null);
    setPermissions([]);
  }

  const hasPermission = (permissionKey: string) => permissions.some(permission => String(permission.key || "").trim() === permissionKey);

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, employee, role, permissions, hasPermission, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Use inside any component to access the current session and user. */
export function useAuth() {
  return useContext(AuthContext);
}

/**
 * Guard helper — returns true if the current user is authenticated.
 * Use this to conditionally render admin UI or protected content.
 */
export function useRequireAuth() {
  const auth = useAuth();
  return {
    ...auth,
    isAuthenticated: auth.session !== null,
  };
}