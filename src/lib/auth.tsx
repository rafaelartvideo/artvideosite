import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Profile } from "./database.types";
import type { OrganizationAccess, OrganizationStatus, OrganizationType } from "./organization.types";
import type { PendingOrganizationTerm } from "@/features/terms/infrastructure/terms.repository";
import { isSessionInactive, remainingSessionTime } from "./session-security";
import {
  ACTIVE_ORGANIZATION_STORAGE_PREFIX,
  LEGACY_ACTIVE_ORGANIZATION_STORAGE_PREFIX,
  ORGANIZATION_CHANGED_EVENT,
  LEGACY_ORGANIZATION_CHANGED_EVENT,
  PERMISSIONS_CHANGED_EVENT,
  LEGACY_PERMISSIONS_CHANGED_EVENT,
  addCompatibleEventListener,
  dispatchCompatibleEvent,
} from "./platform-identifiers";

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
  pendingTerms: PendingOrganizationTerm[];
  hasPermission: (permissionKey: string) => boolean;
  hasModule: (moduleKey: string) => boolean;
  setActiveOrganization: (organizationId: string) => Promise<void>;
  refreshAccess: () => Promise<void>;
  loading: boolean;
  loadingProgress: number;
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
  pendingTerms: [],
  hasPermission: () => false,
  hasModule: () => false,
  setActiveOrganization: async () => {},
  refreshAccess: async () => {},
  loading: true,
  loadingProgress: 8,
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
  const [pendingTerms, setPendingTerms] = useState<PendingOrganizationTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(8);
  const accessRequestRef = useRef(0);
  const accessLoadingKeyRef = useRef<string | null>(null);
  const signedInUserRef = useRef<string | null>(null);
  const activeOrganizationIdRef = useRef<string | null>(null);
  const deferredAccessTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setLoadingProgress(20);
      if (data.session?.user) {
        const userId = data.session.user.id;
        const persistedLastActivityAt = readSessionActivity(userId);

        if (persistedLastActivityAt !== null && isSessionInactive(persistedLastActivityAt)) {
          removeSessionActivity(userId);
          await supabase.auth.signOut();
          if (cancelled) return;
          setLoadingProgress(100);
          setLoading(false);
          return;
        }

        if (persistedLastActivityAt === null) {
          writeSessionActivity(userId, Date.now());
        }

        setLoadingProgress(36);
        setSession(data.session);
        signedInUserRef.current = userId;
        void loadAccess(userId);
      } else {
        setSession(null);
        setLoadingProgress(100);
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

        if (activeUserId && newSession.user.id !== activeUserId) {
          cancelScheduledAccessLoad();
          resetAccessState(true);
        }

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
    const removePermissionListener = addCompatibleEventListener(
      PERMISSIONS_CHANGED_EVENT,
      LEGACY_PERMISSIONS_CHANGED_EVENT,
      handlePermissionChange,
    );

    return () => {
      cancelled = true;
      cancelScheduledAccessLoad();
      listener.subscription.unsubscribe();
      removePermissionListener();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) return;

    const userId = session.user.id;
    const activityStorageKey = sessionActivityStorageKey(userId);
    let lastActivityAt = readSessionActivity(userId) ?? Date.now();
    let inactivityTimer: number | null = null;
    let lastAcceptedActivityAt = 0;

    if (readSessionActivity(userId) === null) {
      writeSessionActivity(userId, lastActivityAt);
    }

    const refreshSharedActivity = () => {
      const persistedLastActivityAt = readSessionActivity(userId);
      if (persistedLastActivityAt !== null && persistedLastActivityAt > lastActivityAt) {
        lastActivityAt = persistedLastActivityAt;
      }
    };

    const expireIfInactive = () => {
      refreshSharedActivity();
      if (isSessionInactive(lastActivityAt)) {
        void signOut();
        return;
      }
      inactivityTimer = window.setTimeout(
        expireIfInactive,
        Math.max(1, remainingSessionTime(lastActivityAt)),
      );
    };

    const scheduleExpiration = () => {
      if (inactivityTimer !== null) window.clearTimeout(inactivityTimer);
      refreshSharedActivity();
      inactivityTimer = window.setTimeout(
        expireIfInactive,
        Math.max(1, remainingSessionTime(lastActivityAt)),
      );
    };

    const recordActivity = () => {
      const now = Date.now();
      if (now - lastAcceptedActivityAt < 1_000) return;
      lastAcceptedActivityAt = now;
      lastActivityAt = now;
      writeSessionActivity(userId, now);
      scheduleExpiration();
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      "pointerdown",
      "pointermove",
      "keydown",
      "touchstart",
      "scroll",
      "wheel",
      "input",
      "change",
    ];
    const checkAfterVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      refreshSharedActivity();
      if (isSessionInactive(lastActivityAt)) {
        void signOut();
        return;
      }
      recordActivity();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== activityStorageKey || event.newValue === null) return;
      const sharedActivityAt = Number(event.newValue);
      if (!Number.isFinite(sharedActivityAt) || sharedActivityAt <= lastActivityAt) return;
      lastActivityAt = sharedActivityAt;
      scheduleExpiration();
    };

    activityEvents.forEach(eventName => window.addEventListener(eventName, recordActivity, { passive: true }));
    document.addEventListener("visibilitychange", checkAfterVisibilityChange);
    window.addEventListener("storage", handleStorage);
    scheduleExpiration();

    return () => {
      if (inactivityTimer !== null) window.clearTimeout(inactivityTimer);
      activityEvents.forEach(eventName => window.removeEventListener(eventName, recordActivity));
      document.removeEventListener("visibilitychange", checkAfterVisibilityChange);
      window.removeEventListener("storage", handleStorage);
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
    setLoadingProgress(36);
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
    setPendingTerms([]);
    setAccessError(null);

    if (notifyOrganizationChange && previousOrganizationId) {
      dispatchCompatibleEvent(
        ORGANIZATION_CHANGED_EVENT,
        LEGACY_ORGANIZATION_CHANGED_EVENT,
        { previousOrganizationId, organizationId: null },
      );
    }
  }

  function clearResolvedAccess() {
    activeOrganizationIdRef.current = null;
    setEmployee(null);
    setRole(null);
    setPermissions([]);
    setOrganizations([]);
    setActiveOrganizationState(null);
    setPendingTerms([]);
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
    setLoadingProgress(42);
    setAccessError(null);

    const persistedOrganizationId =
      localStorage.getItem(activeOrganizationStorageKey(userId))
      || localStorage.getItem(legacyActiveOrganizationStorageKey(userId));
    const requestedOrganizationId =
      preferredOrganizationId
      ?? activeOrganizationIdRef.current
      ?? persistedOrganizationId
      ?? null;

    const { data, error } = await supabase.rpc("load_auth_access_v1", {
      p_preferred_organization_id: requestedOrganizationId,
    });

    if (requestId !== accessRequestRef.current) return;

    if (error) {
      console.error("Auth access bootstrap error:", error);
      clearResolvedAccess();
      setProfile(null);
      setAccessError("Não foi possível carregar seu acesso. Tente novamente.");
      setLoading(false);
      return;
    }

    const access = (data || {}) as Record<string, any>;
    const resolvedProfile = access.profile ?? null;
    if (!resolvedProfile) {
      clearResolvedAccess();
      setProfile(null);
      setLoadingProgress(100);
      setLoading(false);
      return;
    }

    setLoadingProgress(64);

    const availableOrganizations = (Array.isArray(access.organizations) ? access.organizations : [])
      .map(normalizeOrganizationAccess)
      .filter((organization): organization is OrganizationAccess => organization !== null);
    const selectedOrganization = normalizeOrganizationAccess(access.activeOrganization);

    setProfile(resolvedProfile);
    setOrganizations(availableOrganizations);

    if (!selectedOrganization) {
      setEmployee(null);
      setRole(null);
      setPermissions([]);
      setActiveOrganizationState(null);
      setPendingTerms([]);
      activeOrganizationIdRef.current = null;
      setLoadingProgress(100);
      setLoading(false);
      return;
    }

    setLoadingProgress(86);

    const pendingTermsFromAccess = (Array.isArray(access.pendingTerms) ? access.pendingTerms : []) as PendingOrganizationTerm[];
    const permissionKeys = (Array.isArray(access.permissions) ? access.permissions : [])
      .filter((permissionKey: unknown): permissionKey is string =>
        typeof permissionKey === "string" && permissionKey.length > 0,
      );
    const moduleKeys = (Array.isArray(access.modules) ? access.modules : [])
      .filter((moduleKey: unknown): moduleKey is string =>
        typeof moduleKey === "string" && moduleKey.length > 0,
      );

    const resolvedOrganization: OrganizationAccess = {
      ...selectedOrganization,
      enabled_modules: moduleKeys,
    };
    const resolvedOrganizations = availableOrganizations.map(organization =>
      organization.organization_id === resolvedOrganization.organization_id
        ? resolvedOrganization
        : organization,
    );

    const previousOrganizationId = activeOrganizationIdRef.current;
    activeOrganizationIdRef.current = resolvedOrganization.organization_id;
    setOrganizations(resolvedOrganizations);
    setActiveOrganizationState(resolvedOrganization);
    setEmployee(access.employee ?? null);
    setRole(access.role ?? null);
    setPermissions(permissionKeys.map(key => ({ key })));
    setPendingTerms(pendingTermsFromAccess);
    setAccessError(null);
    persistActiveOrganization(userId, resolvedOrganization.organization_id);
    setLoadingProgress(100);
    setLoading(false);

    if (previousOrganizationId && previousOrganizationId !== resolvedOrganization.organization_id) {
      dispatchCompatibleEvent(
        ORGANIZATION_CHANGED_EVENT,
        LEGACY_ORGANIZATION_CHANGED_EVENT,
        {
          previousOrganizationId,
          organizationId: resolvedOrganization.organization_id,
        },
      );
    }
  }

  async function setActiveOrganization(organizationId: string) {
    const userId = signedInUserRef.current;
    if (!userId || organizationId === activeOrganizationIdRef.current) return;
    if (!organizations.some(organization =>
      organization.organization_id === organizationId && organization.is_direct_member
    )) {
      throw new Error("Você não possui vínculo direto com esta empresa.");
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
    const userId = signedInUserRef.current;

    cancelScheduledAccessLoad();

    try {
      await supabase.auth.signOut();
    } finally {
      if (userId) {
        localStorage.removeItem(activeOrganizationStorageKey(userId));
        localStorage.removeItem(legacyActiveOrganizationStorageKey(userId));
        removeSessionActivity(userId);
      }

      signedInUserRef.current = null;
      resetAccessState(true);
      setSession(null);

      if (typeof window !== "undefined") {
        window.location.replace("/admin");
      }
    }
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
      pendingTerms,
      hasPermission,
      hasModule,
      setActiveOrganization,
      refreshAccess,
      loading,
      loadingProgress,
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
    is_platform_operator: value.is_platform_operator === true,
    is_artvideo_tenant: value.is_artvideo_tenant === true,
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

function persistActiveOrganization(userId: string, organizationId: string) {
  localStorage.setItem(activeOrganizationStorageKey(userId), organizationId);
}

function activeOrganizationStorageKey(userId: string) {
  return `${ACTIVE_ORGANIZATION_STORAGE_PREFIX}:${userId}`;
}

function legacyActiveOrganizationStorageKey(userId: string) {
  return `${LEGACY_ACTIVE_ORGANIZATION_STORAGE_PREFIX}:${userId}`;
}

const SESSION_ACTIVITY_STORAGE_PREFIX = "unionworld:session:last-activity";

function sessionActivityStorageKey(userId: string) {
  return `${SESSION_ACTIVITY_STORAGE_PREFIX}:${userId}`;
}

function readSessionActivity(userId: string) {
  if (typeof window === "undefined") return null;
  const value = Number(window.localStorage.getItem(sessionActivityStorageKey(userId)));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function writeSessionActivity(userId: string, activityAt: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(sessionActivityStorageKey(userId), String(activityAt));
}

function removeSessionActivity(userId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(sessionActivityStorageKey(userId));
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useRequireAuth() {
  const auth = useAuth();
  return { ...auth, isAuthenticated: auth.session !== null };
}
