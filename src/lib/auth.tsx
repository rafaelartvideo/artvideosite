import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { recordAuthActivity } from "@/features/auth/infrastructure/session-audit.repository";
import { resolveBootstrapAccessWindow, shouldBlockAccessLoad } from "@/features/auth/domain/access-bootstrap";

import { checkMyEmployeeAccessWindow, type MyEmployeeAccessWindow } from "@/features/registrations/infrastructure/employee-access-hours.repository";
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
  accessWindow: MyEmployeeAccessWindow | null;
  pendingTerms: PendingOrganizationTerm[];
  hasPermission: (permissionKey: string) => boolean;
  hasModule: (moduleKey: string) => boolean;
  setActiveOrganization: (organizationId: string) => Promise<void>;
  refreshAccess: () => Promise<void>;
  loading: boolean;
  loadingProgress: number;
  signOut: () => Promise<void>;
}

const LOGIN_NOTICE_KEY = "unionworld:login:notice";
const SCHEDULE_WARNING_MS = 10 * 60_000;

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
  accessWindow: null,
  pendingTerms: [],
  hasPermission: () => false,
  hasModule: () => false,
  setActiveOrganization: async () => {},
  refreshAccess: async () => {},
  loading: true,
  loadingProgress: 8,
  signOut: async () => {},
});

export type AuthScope = "crm" | "customer";

export function AuthProvider({ children, scope = "crm" }: { children: ReactNode; scope?: AuthScope }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [employee, setEmployee] = useState<any | null>(null);
  const [role, setRole] = useState<any | null>(null);
  const [permissions, setPermissions] = useState<PermissionEntry[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationAccess[]>([]);
  const [activeOrganization, setActiveOrganizationState] = useState<OrganizationAccess | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessWindow, setAccessWindow] = useState<MyEmployeeAccessWindow | null>(null);
  const [pendingTerms, setPendingTerms] = useState<PendingOrganizationTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(8);
  const accessRequestRef = useRef(0);
  const accessLoadingKeyRef = useRef<string | null>(null);
  const signedInUserRef = useRef<string | null>(null);
  const activeOrganizationIdRef = useRef<string | null>(null);
  const deferredAccessTimerRef = useRef<number | null>(null);
  const scheduleWarningKeyRef = useRef("");
  const scheduleSignOutRef = useRef(false);
  // Avoid duplicate logout requests while audit/signOut are still in flight.
  const signOutInProgressRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      // Contas do site não possuem permissões de funcionários nem SLA de inatividade do CRM.
      if (scope === "customer") {
        setSession(data.session ?? null);
        setLoadingProgress(100);
        setLoading(false);
        return;
      }
      setLoadingProgress(20);
      if (data.session?.user) {
        const userId = data.session.user.id;
        const persistedLastActivityAt = readSessionActivity(userId);

        // Validar inatividade apenas após carregar a política do funcionário.
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

      // A sessão do cliente é gerenciada pelo Supabase Auth, sem iniciar o fluxo Union.
      if (scope === "customer") {
        setSession(newSession);
        setLoadingProgress(100);
        setLoading(false);
        return;
      }

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
      if (scope !== "crm") return;
      const userId = signedInUserRef.current;
      if (!userId) return;
      accessLoadingKeyRef.current = null;
      void loadAccess(userId, activeOrganizationIdRef.current, true);
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
  }, [scope]);

  // Atualiza permissões alteradas em outra sessão sem reexecutar o bootstrap
  // completo, abrir canais Realtime adicionais ou desmontar o módulo ativo.
  useEffect(() => {
    const organizationId = activeOrganization?.organization_id;
    if (scope !== "crm" || !session?.user?.id || !organizationId || !accessWindow?.allowed) return;
    // Conferir assim que a aba voltar a receber foco, sem polling contínuo.
    // A checagem anterior aguardava 120s e mantinha menus já revogados visíveis.
    let lastCheck = 0;
    let disposed = false;
    let inFlight = false;

    const checkPermissionsOnReturn = async () => {
      if (document.visibilityState !== "visible" || inFlight) return;
      const now = Date.now();
      if (now - lastCheck < 10_000) return;
      lastCheck = now;
      inFlight = true;
      try {
        const { data, error } = await supabase.rpc("my_organization_permissions", {
          p_organization_id: organizationId,
        });
        if (disposed || activeOrganizationIdRef.current !== organizationId || error || !Array.isArray(data)) return;
        const keys = data.map((entry: any) => String(entry.permission_key || "")).filter(Boolean);
        setPermissions(current => {
          const currentKeys = current.map(item => item.key);
          return currentKeys.length === keys.length && currentKeys.every((key, index) => key === keys[index])
            ? current
            : keys.map(key => ({ key }));
        });
      } catch (error) {
        console.warn("[ACESSO] Não foi possível sincronizar permissões:", error);
      } finally {
        inFlight = false;
      }
    };

    window.addEventListener("focus", checkPermissionsOnReturn);
    document.addEventListener("visibilitychange", checkPermissionsOnReturn);
    return () => {
      disposed = true;
      window.removeEventListener("focus", checkPermissionsOnReturn);
      document.removeEventListener("visibilitychange", checkPermissionsOnReturn);
    };
  }, [scope, session?.user?.id, activeOrganization?.organization_id, accessWindow?.allowed]);

  useEffect(() => {
    // Evita expirar técnicos antes da leitura do acesso da empresa ativa.
    if (scope !== "crm" || !session?.user || loading) return;

    const inactivityExempt = Boolean(
      activeOrganization?.organization_id
      && employee?.is_active !== false
      && employee?.disable_inactivity_logout === true
    );
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
      if (!inactivityExempt && isSessionInactive(lastActivityAt)) {
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
      inactivityTimer = null;
      refreshSharedActivity();
      if (inactivityExempt) return;
      inactivityTimer = window.setTimeout(
        expireIfInactive,
        Math.max(1, remainingSessionTime(lastActivityAt)),
      );
    };

    const recordActivity = () => {
      const now = Date.now();
      // Pointermove/scroll chegam dezenas de vezes por segundo; persistir
      // atividade a cada 5s é suficiente para a janela de 20 minutos e
      // reduz gravações síncronas no storage do navegador.
      if (now - lastAcceptedActivityAt < 5_000) return;
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
      if (!inactivityExempt && isSessionInactive(lastActivityAt)) {
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
  }, [scope, session?.user.id, loading, activeOrganization?.organization_id, employee?.is_active, employee?.disable_inactivity_logout]);

  // A sessão deve ser encerrada ao ultrapassar uma escala ativa, sem levar
  // o usuário para uma tela interna de bloqueio.
  function signOutForSchedule() {
    if (scheduleSignOutRef.current) return;
    scheduleSignOutRef.current = true;
    try {
      window.sessionStorage.setItem(LOGIN_NOTICE_KEY,
        "Seu horário de acesso ao CRM terminou. Entre novamente no próximo intervalo permitido.");
    } catch { /* Session storage is optional. */ }
    setLoading(true);
    void signOut();
  }

  // Programar o aviso e o fim do turno a partir do relógio do PostgreSQL.
  // Não é necessário consultar a API a cada 30 segundos.
  useEffect(() => {
    const organizationId = activeOrganization?.organization_id;
    const windowData = accessWindow;
    if (scope !== "crm" || loading || !session?.user?.id || !organizationId ||
      !windowData?.allowed || !windowData.restricted || !windowData.next_end_at || !windowData.server_now)
      return;
    const end = Date.parse(windowData.next_end_at);
    const serverNow = Date.parse(windowData.server_now);
    if (!Number.isFinite(end) || !Number.isFinite(serverNow)) return;
    const remaining = end - serverNow;
    const warningKey = `${session.user.id}:${organizationId}:${windowData.next_end_at}`;
    const warn = () => {
      if (scheduleWarningKeyRef.current === warningKey) return;
      scheduleWarningKeyRef.current = warningKey;
      const formattedEnd = new Date(end).toLocaleTimeString("pt-BR", {
        hour: "2-digit", minute: "2-digit", timeZone: windowData.timezone,
      });
      // A interface de notificações só é carregada quando o aviso é necessário;
      // não aumentar o bundle de autenticação com componentes do CRM.
      void import("@/shared/ui/admin/AdminFeedback")
        .then(({ notifyAdmin }) => notifyAdmin(
          `Seu acesso será encerrado às ${formattedEnd}, em até 10 minutos. Salve seu trabalho.`, "warning"))
        .catch(() => console.warn("[ACESSO] Não foi possível mostrar o aviso de fim de expediente."));
    };
    if (remaining <= 0) {
      signOutForSchedule();
      return;
    }
    const warningTimer = window.setTimeout(warn, Math.max(0, remaining - SCHEDULE_WARNING_MS));
    const logoutTimer = window.setTimeout(() => signOutForSchedule(), remaining);
    return () => {
      window.clearTimeout(warningTimer);
      window.clearTimeout(logoutTimer);
    };
  }, [scope, loading, session?.user?.id, activeOrganization?.organization_id,
    accessWindow?.allowed, accessWindow?.restricted, accessWindow?.next_end_at,
    accessWindow?.server_now, accessWindow?.timezone]);

  // Respeita alterações de expediente durante uma sessão já aberta.
  // Verificação no foco e a cada 5 minutos, não a cada 30 segundos.
  useEffect(() => {
    const organizationId = activeOrganization?.organization_id;
    if (scope !== "crm" || !session?.user?.id || !organizationId || loading) return;
    let disposed = false;
    let inFlight = false;
    let previousAllowed = accessWindow?.allowed ?? true;
    let lastVerifiedWindow = accessWindow;
    const checkWindow = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const status = await checkMyEmployeeAccessWindow(organizationId);
        if (disposed || activeOrganizationIdRef.current !== organizationId) return;
        lastVerifiedWindow = status;
        setAccessError(null);
        setAccessWindow(status);
        if (!status.allowed) {
          setPermissions([]);
          signOutForSchedule();
          return;
        }
        if (!previousAllowed && status.allowed) {
          accessLoadingKeyRef.current = null;
          void loadAccess(session.user.id, organizationId);
        }
        previousAllowed = status.allowed;
      } catch (error) {
        if (disposed || activeOrganizationIdRef.current !== organizationId) return;
        console.warn("[ACESSO] Falha na verificação de horários:", error);
        // Uma falha temporária no Supabase não revoga um acesso
        // anteriormente confirmado como irrestrito. A próxima verificação
        // continua agendada normalmente. Restrições ativas seguem fail-closed.
        if (lastVerifiedWindow?.allowed && lastVerifiedWindow.restricted === false) return;
        // Um usuário já autorizado para um intervalo vigente mantém a tela
        // enquanto a checagem de rede falha; o timer de saída e a RLS no
        // servidor continuam impondo o horário configurado.
        if (lastVerifiedWindow?.allowed && lastVerifiedWindow.restricted === true &&
          lastVerifiedWindow.next_end_at) return;
        setAccessError("Não foi possível verificar o horário de acesso. Tente novamente.");
        setAccessWindow({ allowed: false, restricted: true, timezone: "America/Sao_Paulo",
          server_now: null, next_end_at: null });
        setPermissions([]);
        previousAllowed = false;
      } finally {
        inFlight = false;
      }
    };
    const onFocus = () => { if (document.visibilityState === "visible") void checkWindow(); };
    const timer = window.setInterval(() => void checkWindow(), 5 * 60_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [scope, session?.user?.id, activeOrganization?.organization_id, loading]);

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
    setAccessWindow(null);
    scheduleSignOutRef.current = false;
    scheduleWarningKeyRef.current = "";

    if (notifyOrganizationChange) {
      // Mesmo sem empresa selecionada, um logout deve descartar os caches
      // de todas as organizações da sessão anterior.
      dispatchCompatibleEvent(
        ORGANIZATION_CHANGED_EVENT,
        LEGACY_ORGANIZATION_CHANGED_EVENT,
        { previousOrganizationId, organizationId: null },
      );
    }
  }

  function clearResolvedAccess() {
    const previousOrganizationId = activeOrganizationIdRef.current;
    activeOrganizationIdRef.current = null;
    setEmployee(null);
    setRole(null);
    setPermissions([]);
    setOrganizations([]);
    setActiveOrganizationState(null);
    setPendingTerms([]);
    setAccessWindow(null);
    if (previousOrganizationId) {
      // Falha de acesso também encerra o escopo dos dados da empresa anterior.
      dispatchCompatibleEvent(
        ORGANIZATION_CHANGED_EVENT,
        LEGACY_ORGANIZATION_CHANGED_EVENT,
        { previousOrganizationId, organizationId: null },
      );
    }
  }

  async function loadAccess(userId: string, preferredOrganizationId?: string | null, background = false) {
    const requestKey = `${userId}:${preferredOrganizationId ?? "auto"}`;
    if (accessLoadingKeyRef.current === requestKey) return;
    accessLoadingKeyRef.current = requestKey;

    try {
      await loadAccessData(userId, preferredOrganizationId, background);
    } catch (error) {
      // Erros de rede (incluindo 504 e TimeoutError) podem rejeitar a Promise.
      // Nunca deixar o painel preso em 42% sem um botão para tentar novamente.
      if (accessLoadingKeyRef.current === requestKey && signedInUserRef.current === userId) {
        console.error("Auth access request failed:", error);
        clearResolvedAccess();
        setProfile(null);
        setAccessError("O Supabase não respondeu ao carregar seu acesso. Tente novamente.");
        setLoading(false);
      }
    } finally {
      if (accessLoadingKeyRef.current === requestKey) {
        accessLoadingKeyRef.current = null;
      }
    }
  }

  async function loadAccessData(userId: string, preferredOrganizationId?: string | null, background = false) {
    const requestId = ++accessRequestRef.current;
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

    // Atualizar o acesso da empresa atual não desmonta o módulo aberto.
    // Login, troca de empresa e recuperação após erro continuam bloqueantes.
    if (shouldBlockAccessLoad(activeOrganizationIdRef.current, requestedOrganizationId, background)) {
      setLoading(true);
    }

    const { data, error } = await supabase.rpc("load_auth_access_v1", {
      p_preferred_organization_id: requestedOrganizationId,
    }).abortSignal(AbortSignal.timeout(18_000));

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
      setAccessWindow(null);
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

    let resolvedWindow: MyEmployeeAccessWindow;
    try {
      resolvedWindow = await resolveBootstrapAccessWindow(access,
        () => checkMyEmployeeAccessWindow(resolvedOrganization.organization_id));
    } catch (scheduleError) {
      if (requestId !== accessRequestRef.current) return;
      console.error("Access schedule validation error:", scheduleError);
      clearResolvedAccess();
      setAccessError("Não foi possível verificar o horário de acesso. Tente novamente.");
      setLoading(false);
      return;
    }
    if (requestId !== accessRequestRef.current) return;
    if (resolvedWindow.restricted && !resolvedWindow.allowed) {
      signOutForSchedule();
      return;
    }

    const previousOrganizationId = activeOrganizationIdRef.current;
    activeOrganizationIdRef.current = resolvedOrganization.organization_id;
    setOrganizations(resolvedOrganizations);
    setActiveOrganizationState(resolvedOrganization);
    setEmployee(access.employee ?? null);
    setRole(access.role ?? null);
    setAccessWindow(resolvedWindow);
    setPermissions(resolvedWindow.allowed ? permissionKeys.map(key => ({ key })) : []);
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
    await loadAccess(userId, activeOrganizationIdRef.current, true);
  }

  async function signOut() {
    if (signOutInProgressRef.current) return;
    signOutInProgressRef.current = true;
    try {
      if (scope === "customer") {
        // Logout público mantém suas próprias rotas e não registra saída de funcionário.
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error) throw error;
        return;
      }

      const userId = signedInUserRef.current;
      cancelScheduledAccessLoad();

      // Gravar antes de revogar o JWT; falhas de auditoria não bloqueiam a saída.
      await recordAuthActivity("logout");
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;

      if (userId) {
        localStorage.removeItem(activeOrganizationStorageKey(userId));
        localStorage.removeItem(legacyActiveOrganizationStorageKey(userId));
        removeSessionActivity(userId);
      }

      // SIGNED_OUT faz a limpeza normalmente. Só usar fallback quando o evento
      // não atualizou este provider; nunca limpar o cache/estado duas vezes.
      if (signedInUserRef.current === userId && userId) {
        signedInUserRef.current = null;
        resetAccessState(true);
        setSession(null);
        setLoading(false);
      }
      // A troca do CRM para a tela de login é feita pelo React, sem reload.
      // window.location.replace() fazia a tela de login montar duas vezes.
    } catch (error) {
      // Se o Supabase recusar a saída, não simular logout com sessão válida.
      console.error("[ACESSO] Não foi possível encerrar a sessão.", error);
      setLoading(false);
    } finally {
      signOutInProgressRef.current = false;
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
      accessWindow,
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
