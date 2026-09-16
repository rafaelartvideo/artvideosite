import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Profile } from "./database.types";
import type { OrganizationAccess, OrganizationStatus, OrganizationType } from "./organization.types";
import { validateCurrentSessionIp } from "@/features/auth/infrastructure/auth.repository";
import { INACTIVITY_TIMEOUT_MS, isSessionInactive, remainingSessionTime } from "./session-security";

const ACTIVE_ORGANIZATION_STORAGE_PREFIX = "artvideo:active-organization";
const ORGANIZATION_CHANGED_EVENT = "artvideo:organization-changed";

interface PermissionEntry {
  key: string;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  employee: any | null;
  role: any | null;
  permissions: PermissionEntry[];
  organizations: OrganizationAccess[];
  activeOrganization: OrganizationAccess | null;
  activeOrganizationId: string | null;
  enabledModules: string[];
  accessError: string | null;
  hasPermission: (permissionKey: string) => boolean;
  hasModule: (moduleKey: string) => boolean;
  setActiveOrganization: (organizationId: string) => Promise<void>;
  refreshAccess: () => Promise<void>;
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
  organizations: [],
  activeOrganization: null,
  activeOrganizationId: null,
  enabledModules: [],
  accessError: null,
  hasPermission: () => false,
  hasModule: () => false,
  setActiveOrganization: async () => {},
  refreshAccess: async () => {},
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [employee, setEmployee] = useState<any | null>(null);
  const [role, setRole] = useState<any | null>(null);
  const [permissions, setPermissions] = useState<PermissionEntry[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationAccess[]>([]);
  const [activeOrganization, setActiveOrganizationState] = useState<OrganizationAccess | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const accessRequestRef = useRef(0);
  const accessLoadingKeyRef = useRef<string | null>(null);
  const signedInUserRef = useRef<string | null>(null);
  const activeOrganizationIdRef = useRef<string | null>(null);
  const deferredAccessTimerRef = useRef<number | null>(null);
  const sessionValidationRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (data.session?.user) {
        const allowed = await validateCurrentSessionIp();
        if (cancelled) return;
        if (!allowed) {
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }
        setSession(data.session);
        signedInUserRef.current = data.session.user.id;
        void loadAccess(data.session.user.id);
      } else {
        setSession(null);
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "INITIAL_SESSION") return;

      if (event === "TOKEN_REFRESHED") {
        setSession(newSession);
        return;
      }

      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        if (!newSession?.user) return;
        const activeUserId = signedInUserRef.current;
        if (activeUserId && newSession.user.id !== activeUserId) return;

        setSession(newSession);
        if (newSession.user.id === activeUserId) {
          if (!activeOrganizationIdRef.current && !accessLoadingKeyRef.current) {
            scheduleAccessLoad(newSession.user.id);
          }
          return;
        }

        signedInUserRef.current = newSession.user.id;
        scheduleAccessLoad(newSession.user.id);
        return;
      }

      if (event === "SIGNED_OUT") {
        cancelScheduledAccessLoad();
        signedInUserRef.current = null;
        resetAccessState(true);
        setSession(null);
        setLoading(false);
        return;
      }

      setSession(newSession);
    });

    const handlePermissionChange = () => {
      const userId = signedInUserRef.current;
      if (!userId) return;
      accessLoadingKeyRef.current = null;
      void loadAccess(userId, activeOrganizationIdRef.current);
    };
    window.addEventListener("artvideo:permissions-changed", handlePermissionChange);

    return () => {
      cancelled = true;
      cancelScheduledAccessLoad();
      listener.subscription.unsubscribe();
      window.removeEventListener("artvideo:permissions-changed", handlePermissionChange);
    };
  }, []);

  useEffect(() => {
    if (!session?.user) return;

    let lastActivityAt = Date.now();
    let inactivityTimer: number | null = null;
    let lastAcceptedActivityAt = 0;

    const expireIfInactive = () => {
      if (isSessionInactive(lastActivityAt)) {
        void signOut();
        return;
      }
      inactivityTimer = window.setTimeout(expireIfInactive, remainingSessionTime(lastActivityAt));
    };

    const scheduleExpiration = () => {
      if (inactivityTimer !== null) window.clearTimeout(inactivityTimer);
      inactivityTimer = window.setTimeout(expireIfInactive, INACTIVITY_TIMEOUT_MS);
    };

    const recordActivity = () => {
      const now = Date.now();
      if (now - lastAcceptedActivityAt < 1_000) return;
      lastAcceptedActivityAt = now;
      lastActivityAt = now;
      scheduleExpiration();
    };

    const activityEvents: Array<keyof WindowEventMap> = ["pointerdown", "pointermove", "keydown", "touchstart", "scroll"];
    activityEvents.forEach(eventName => window.addEventListener(eventName, recordActivity, { passive: true }));
    scheduleExpiration();

    return () => {
      if (inactivityTimer !== null) window.clearTimeout(inactivityTimer);
      activityEvents.forEach(eventName => window.removeEventListener(eventName, recordActivity));
    };
  }, [session?.user.id]);

  useEffect(() => {
    if (!session?.user) return;

    const validateVisibleSession = async () => {
      if (document.visibilityState !== "visible" || sessionValidationRef.current) return;
      sessionValidationRef.current = true;
      try {
        if (!await validateCurrentSessionIp()) await signOut();
      } finally {
        sessionValidationRef.current = false;
      }
    };

    document.addEventListener("visibilitychange", validateVisibleSession);
    const interval = window.setInterval(validateVisibleSession, 5 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", validateVisibleSession);
      window.clearInterval(interval);
    };
  }, [session?.user.id]);

  function cancelScheduledAccessLoad() {
    if (deferredAccessTimerRef.current === null) return;
    window.clearTimeout(deferredAccessTimerRef.current);
    deferredAccessTimerRef.current = null;
  }

  function scheduleAccessLoad(userId: string, preferredOrganizationId?: string | null) {
    cancelScheduledAccessLoad();
    setLoading(true);
    setAccessError(null);
    deferredAccessTimerRef.current = window.setTimeout(() => {
      deferredAccessTimerRef.current = null;
      if (signedInUserRef.current !== userId) return;
      void loadAccess(userId, preferredOrganizationId);
    }, 0);
  }

  function resetAccessState(notifyOrganizationChange = false) {
    const previousOrganizationId = activeOrganizationIdRef.current;
    accessRequestRef.current += 1;
    accessLoadingKeyRef.current = null;
    activeOrganizationIdRef.current = null;
    setProfile(null);
    setEmployee(null);
    setRole(null);
    setPermissions([]);
    setOrganizations([]);
    setActiveOrganizationState(null);
    setAccessError(null);

    if (notifyOrganizationChange && previousOrganizationId) {
      window.dispatchEvent(new CustomEvent(ORGANIZATION_CHANGED_EVENT, {
        detail: { previousOrganizationId, organizationId: null },
      }));
    }
  }

  function clearResolvedAccess() {
    activeOrganizationIdRef.current = null;
    setEmployee(null);
    setRole(null);
    setPermissions([]);
    setOrganizations([]);
    setActiveOrganizationState(null);
  }

  async function loadAccess(userId: string, preferredOrganizationId?: string | null) {
    const requestKey = `${userId}:${preferredOrganizationId ?? "auto"}`;
    if (accessLoadingKeyRef.current === requestKey) return;
    accessLoadingKeyRef.current = requestKey;

    try {
      await loadAccessData(userId, preferredOrganizationId);
    } finally {
      if (accessLoadingKeyRef.current === requestKey) {
        accessLoadingKeyRef.current = null;
      }
    }
  }

  async function loadAccessData(userId: string, preferredOrganizationId?: string | null) {
    const requestId = ++accessRequestRef.current;
    setLoading(true);
    setAccessError(null);

    const [profileResult, organizationsResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.rpc("my_organizations"),
    ]);

    if (requestId !== accessRequestRef.current) return;

    if (profileResult.error) {
      console.error("Auth profile load error:", profileResult.error);
      clearResolvedAccess();
      setProfile(null);
      setAccessError("Não foi possível carregar seu perfil de acesso. Tente novamente.");
      setLoading(false);
      return;
    }

    if (!profileResult.data) {
      clearResolvedAccess();
      setProfile(null);
      setLoading(false);
      return;
    }

    if (organizationsResult.error) {
      console.error("Auth organizations load error:", organizationsResult.error);
      clearResolvedAccess();
      setProfile(profileResult.data);
      setAccessError("Não foi possível carregar as empresas vinculadas à sua conta. Tente novamente.");
      setLoading(false);
      return;
    }

    const availableOrganizations = (organizationsResult.data || [])
      .map(normalizeOrganizationAccess)
      .filter((organization): organization is OrganizationAccess => organization !== null);
    const selectedOrganization = selectOrganization(
      userId,
      availableOrganizations,
      preferredOrganizationId ?? activeOrganizationIdRef.current,
    );

    setProfile(profileResult.data);
    setOrganizations(availableOrganizations);

    if (!selectedOrganization) {
      setEmployee(null);
      setRole(null);
      setPermissions([]);
      setActiveOrganizationState(null);
      activeOrganizationIdRef.current = null;
      setLoading(false);
      return;
    }

    const roleId = selectedOrganization.role_id;
    const [employeeResult, roleResult, permissionResult] = await Promise.all([
      supabase
        .from("employees")
        .select("*")
        .eq("profile_id", userId)
        .eq("organization_id", selectedOrganization.organization_id)
        .maybeSingle(),
      roleId
        ? supabase.from("roles").select("*").eq("id", roleId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.rpc("my_organization_permissions", {
        p_organization_id: selectedOrganization.organization_id,
      }),
    ]);

    if (requestId !== accessRequestRef.current) return;

    if (employeeResult.error) console.error("Auth employee load error:", employeeResult.error);
    if (roleResult.error) console.error("Auth role load error:", roleResult.error);
    if (permissionResult.error) {
      console.error("Auth permissions load error:", permissionResult.error);
      activeOrganizationIdRef.current = selectedOrganization.organization_id;
      setActiveOrganizationState(selectedOrganization);
      setEmployee(employeeResult.data ?? null);
      setRole(!roleResult.error ? roleResult.data ?? null : null);
      setPermissions([]);
      setAccessError("Não foi possível carregar suas permissões. Tente novamente.");
      setLoading(false);
      return;
    }

    const permissionKeys = (permissionResult.data || [])
      .map((permission: any) => typeof permission === "string" ? permission : permission?.permission_key)
      .filter((permissionKey: unknown): permissionKey is string =>
        typeof permissionKey === "string" && permissionKey.length > 0,
      );

    const previousOrganizationId = activeOrganizationIdRef.current;
    activeOrganizationIdRef.current = selectedOrganization.organization_id;
    setActiveOrganizationState(selectedOrganization);
    setEmployee(employeeResult.data ?? null);
    setRole(!roleResult.error ? roleResult.data ?? null : null);
    setPermissions(permissionKeys.map(key => ({ key })));
    setAccessError(null);
    persistActiveOrganization(userId, selectedOrganization.organization_id);
    setLoading(false);

    if (previousOrganizationId && previousOrganizationId !== selectedOrganization.organization_id) {
      window.dispatchEvent(new CustomEvent(ORGANIZATION_CHANGED_EVENT, {
        detail: {
          previousOrganizationId,
          organizationId: selectedOrganization.organization_id,
        },
      }));
    }
  }

  async function setActiveOrganization(organizationId: string) {
    const userId = signedInUserRef.current;
    if (!userId || organizationId === activeOrganizationIdRef.current) return;
    if (!organizations.some(organization => organization.organization_id === organizationId)) {
      throw new Error("Você não possui acesso a esta empresa.");
    }
    accessLoadingKeyRef.current = null;
    await loadAccess(userId, organizationId);
  }

  async function refreshAccess() {
    const userId = signedInUserRef.current;
    if (!userId) return;
    cancelScheduledAccessLoad();
    accessLoadingKeyRef.current = null;
    await loadAccess(userId, activeOrganizationIdRef.current);
  }

  async function signOut() {
    cancelScheduledAccessLoad();
    await supabase.auth.signOut();
    signedInUserRef.current = null;
    resetAccessState(true);
    setSession(null);
  }

  const hasPermission = (permissionKey: string) =>
    permissions.some(permission => permission.key.trim() === permissionKey);
  const hasModule = (moduleKey: string) =>
    activeOrganization?.enabled_modules.includes(moduleKey) === true;

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      profile,
      employee,
      role,
      permissions,
      organizations,
      activeOrganization,
      activeOrganizationId: activeOrganization?.organization_id ?? null,
      enabledModules: activeOrganization?.enabled_modules ?? [],
      accessError,
      hasPermission,
      hasModule,
      setActiveOrganization,
      refreshAccess,
      loading,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

function normalizeOrganizationAccess(value: any): OrganizationAccess | null {
  if (!value || typeof value.organization_id !== "string" || typeof value.organization_name !== "string") {
    return null;
  }

  return {
    organization_id: value.organization_id,
    organization_name: value.organization_name,
    legal_name: typeof value.legal_name === "string" ? value.legal_name : null,
    slug: typeof value.slug === "string" ? value.slug : "",
    organization_type: normalizeOrganizationType(value.organization_type),
    organization_status: normalizeOrganizationStatus(value.organization_status),
    parent_organization_id: typeof value.parent_organization_id === "string" ? value.parent_organization_id : null,
    membership_id: typeof value.membership_id === "string" ? value.membership_id : "",
    membership_organization_id: typeof value.membership_organization_id === "string"
      ? value.membership_organization_id
      : value.organization_id,
    role_id: typeof value.role_id === "string" ? value.role_id : null,
    is_owner: value.is_owner === true,
    is_direct_member: value.is_direct_member !== false,
    enabled_modules: Array.isArray(value.enabled_modules)
      ? value.enabled_modules.filter((moduleKey: unknown): moduleKey is string => typeof moduleKey === "string")
      : [],
  };
}

function normalizeOrganizationType(value: unknown): OrganizationType {
  return value === "parent" ? "parent" : "partner";
}

function normalizeOrganizationStatus(value: unknown): OrganizationStatus {
  if (value === "suspended" || value === "cancelled") return value;
  return "active";
}

function selectOrganization(
  userId: string,
  organizations: OrganizationAccess[],
  preferredOrganizationId?: string | null,
) {
  const persistedOrganizationId = localStorage.getItem(activeOrganizationStorageKey(userId));
  const requestedIds = [preferredOrganizationId, persistedOrganizationId].filter(Boolean);

  for (const organizationId of requestedIds) {
    const selected = organizations.find(organization => organization.organization_id === organizationId);
    if (selected) return selected;
  }

  return organizations.find(organization =>
    organization.organization_type === "parent" && organization.organization_status === "active",
  ) ?? organizations.find(organization => organization.organization_status === "active") ?? organizations[0] ?? null;
}

function persistActiveOrganization(userId: string, organizationId: string) {
  localStorage.setItem(activeOrganizationStorageKey(userId), organizationId);
}

function activeOrganizationStorageKey(userId: string) {
  return `${ACTIVE_ORGANIZATION_STORAGE_PREFIX}:${userId}`;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useRequireAuth() {
  const auth = useAuth();
  return { ...auth, isAuthenticated: auth.session !== null };
}
