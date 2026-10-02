import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import { updateMyFieldLocation } from "../infrastructure/field-tracking.repository";

export const FIELD_TRACKING_PREFERENCE_EVENT = "field-tracking-preference-changed";

function preferenceKey(organizationId: string, userId: string) {
  return `field-tracking:${organizationId}:${userId}`;
}

function loginPromptKey(
  organizationId: string,
  userId: string,
  lastSignInAt?: string | null,
) {
  return `field-tracking-login-prompt:${organizationId}:${userId}:${lastSignInAt || "session"}`;
}

export function isFieldTrackingEnabled(organizationId?: string | null, userId?: string | null) {
  if (!organizationId || !userId || typeof window === "undefined") return false;
  return window.localStorage.getItem(preferenceKey(organizationId, userId)) === "1";
}

export function setFieldTrackingEnabled(organizationId: string, userId: string, enabled: boolean) {
  window.localStorage.setItem(preferenceKey(organizationId, userId), enabled ? "1" : "0");
  window.dispatchEvent(new CustomEvent(FIELD_TRACKING_PREFERENCE_EVENT));
}

function currentDeviceLabel() {
  if (typeof navigator === "undefined") return "Dispositivo";
  const agent = navigator.userAgent;
  if (/iPhone/i.test(agent)) return "iPhone";
  if (/iPad/i.test(agent)) return "iPad";
  if (/Android/i.test(agent)) return "Android";
  if (/Windows/i.test(agent)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(agent)) return "Mac";
  return "Navegador";
}

function positionPayload(position: GeolocationPosition) {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    speed: position.coords.speed,
    heading: position.coords.heading,
    recordedAt: new Date(position.timestamp).toISOString(),
    deviceLabel: currentDeviceLabel(),
  };
}

function geolocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "A permissão de localização foi recusada. Autorize a localização deste site no navegador e tente novamente.";
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return "O dispositivo não conseguiu determinar sua localização. Verifique se a localização do aparelho está ligada.";
  }
  return "A localização demorou para responder. Tente novamente.";
}

export function FieldTrackingReporter() {
  const {
    user,
    employee,
    activeOrganizationId,
    hasPermission,
    hasModule,
  } = useAuth();
  const [preferenceVersion, setPreferenceVersion] = useState(0);
  const [promptVersion, setPromptVersion] = useState(0);
  const [activationBusy, setActivationBusy] = useState(false);
  const [promptError, setPromptError] = useState("");
  const lastSentAtRef = useRef(0);

  const canShare = hasPermission("field_tracking.share");
  const enabled = useMemo(
    () => isFieldTrackingEnabled(activeOrganizationId, user?.id),
    [activeOrganizationId, user?.id, preferenceVersion],
  );

  const promptKey = useMemo(() => {
    if (!activeOrganizationId || !user?.id) return "";
    return loginPromptKey(activeOrganizationId, user.id, user.last_sign_in_at);
  }, [activeOrganizationId, user?.id, user?.last_sign_in_at]);

  const promptOnLogin = hasModule("field_tracking")
    && employee?.is_active !== false
    && employee?.field_tracking_prompt_on_login === true
    && canShare;

  const promptDismissed = useMemo(() => {
    if (!promptKey || typeof window === "undefined") return false;
    return window.sessionStorage.getItem(promptKey) === "dismissed";
  }, [promptKey, promptVersion]);

  const showPrompt = promptOnLogin && !enabled && !promptDismissed;

  useEffect(() => {
    const handlePreference = () => setPreferenceVersion(value => value + 1);
    window.addEventListener(FIELD_TRACKING_PREFERENCE_EVENT, handlePreference);
    return () => window.removeEventListener(FIELD_TRACKING_PREFERENCE_EVENT, handlePreference);
  }, []);

  const activateBrowserTracking = useCallback(async () => {
    if (!activeOrganizationId || !user?.id || !canShare || activationBusy) return;
    if (!navigator.geolocation) {
      setPromptError("Este navegador não disponibiliza geolocalização. Use um navegador ou dispositivo compatível.");
      return;
    }

    setActivationBusy(true);
    setPromptError("");

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 5_000,
          timeout: 15_000,
        });
      });

      await updateMyFieldLocation(activeOrganizationId, positionPayload(position));
      lastSentAtRef.current = Date.now();
      setFieldTrackingEnabled(activeOrganizationId, user.id, true);
      if (promptKey) window.sessionStorage.removeItem(promptKey);
      setPromptVersion(value => value + 1);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error) {
        setPromptError(geolocationErrorMessage(error as GeolocationPositionError));
      } else {
        setPromptError("Não foi possível iniciar o compartilhamento da localização. Tente novamente.");
      }
    } finally {
      setActivationBusy(false);
    }
  }, [activeOrganizationId, user?.id, canShare, activationBusy, promptKey]);

  const dismissPrompt = useCallback(() => {
    if (promptKey) window.sessionStorage.setItem(promptKey, "dismissed");
    setPromptError("");
    setPromptVersion(value => value + 1);
  }, [promptKey]);

  useEffect(() => {
    if (!activeOrganizationId || !user?.id || !canShare || !enabled || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      position => {
        const now = Date.now();
        if (now - lastSentAtRef.current < 12_000) return;
        lastSentAtRef.current = now;
        void updateMyFieldLocation(activeOrganizationId, positionPayload(position)).catch(() => undefined);
      },
      error => {
        if (error.code !== error.PERMISSION_DENIED) return;
        setFieldTrackingEnabled(activeOrganizationId, user.id, false);
        setPromptError(geolocationErrorMessage(error));
        setPromptVersion(value => value + 1);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 20_000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [activeOrganizationId, user?.id, canShare, enabled]);

  if (!showPrompt) return null;

  return <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
    <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <div className="border-b border-border px-5 py-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <MapPin size={21} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-black text-foreground">Compartilhar localização</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Esta empresa utiliza o Mapa de Campo e solicita sua localização durante o uso do sistema.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="rounded-xl border border-border bg-muted/60 p-4">
          <p className="text-sm font-bold text-foreground">Deseja ativar a localização neste navegador?</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Ao ativar, sua posição será enviada ao Mapa de Campo enquanto este navegador estiver compartilhando a localização.
          </p>
        </div>

        {promptError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold leading-5 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {promptError}
        </div>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AdminButton variant="secondary" disabled={activationBusy} onClick={dismissPrompt}>
            Agora não
          </AdminButton>
          <AdminButton
            loading={activationBusy}
            loadingText="Ativando..."
            onClick={() => void activateBrowserTracking()}
          >
            Ativar localização
          </AdminButton>
        </div>
      </div>
    </div>
  </div>;
}
