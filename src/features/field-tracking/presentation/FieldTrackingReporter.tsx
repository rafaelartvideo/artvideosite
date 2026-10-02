import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import { updateMyFieldLocation } from "../infrastructure/field-tracking.repository";

export const FIELD_TRACKING_PREFERENCE_EVENT = "field-tracking-preference-changed";

function preferenceKey(organizationId: string, userId: string) {
  return `field-tracking:${organizationId}:${userId}`;
}

function requiredVerificationKey(
  organizationId: string,
  userId: string,
  lastSignInAt?: string | null,
) {
  return `field-tracking-required:${organizationId}:${userId}:${lastSignInAt || "session"}`;
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
    return "A permissão de localização foi recusada.";
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
    signOut,
  } = useAuth();
  const [preferenceVersion, setPreferenceVersion] = useState(0);
  const [verificationVersion, setVerificationVersion] = useState(0);
  const [activationBusy, setActivationBusy] = useState(false);
  const [gateError, setGateError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(60);
  const lastSentAtRef = useRef(0);
  const signingOutRef = useRef(false);

  const locationRequired = hasModule("field_tracking")
    && employee?.is_active !== false
    && employee?.field_tracking_prompt_on_login === true;

  const canShare = hasPermission("field_tracking.share") || locationRequired;

  const optionalEnabled = useMemo(
    () => isFieldTrackingEnabled(activeOrganizationId, user?.id),
    [activeOrganizationId, user?.id, preferenceVersion],
  );

  const verificationKey = useMemo(() => {
    if (!locationRequired || !activeOrganizationId || !user?.id) return "";
    return requiredVerificationKey(activeOrganizationId, user.id, user.last_sign_in_at);
  }, [locationRequired, activeOrganizationId, user?.id, user?.last_sign_in_at]);

  const requiredVerified = useMemo(() => {
    if (!locationRequired || !verificationKey || typeof window === "undefined") return false;
    return window.localStorage.getItem(verificationKey) === "1";
  }, [locationRequired, verificationKey, verificationVersion]);

  const enabled = locationRequired ? requiredVerified : optionalEnabled;
  const showRequiredGate = locationRequired && !requiredVerified;

  useEffect(() => {
    const handlePreference = () => setPreferenceVersion(value => value + 1);
    window.addEventListener(FIELD_TRACKING_PREFERENCE_EVENT, handlePreference);
    return () => window.removeEventListener(FIELD_TRACKING_PREFERENCE_EVENT, handlePreference);
  }, []);

  useEffect(() => {
    signingOutRef.current = false;

    // Este cronômetro só existe quando a empresa marcou a localização
    // como obrigatória para este funcionário.
    if (!showRequiredGate) {
      setSecondsLeft(60);
      return;
    }

    const deadline = Date.now() + 60_000;
    const expireRequiredLocation = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining > 0 || signingOutRef.current) return;
      signingOutRef.current = true;
      void signOut();
    };

    expireRequiredLocation();
    const interval = window.setInterval(expireRequiredLocation, 250);
    const timeout = window.setTimeout(expireRequiredLocation, 60_000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [showRequiredGate, activeOrganizationId, user?.id, signOut]);

  const activateBrowserTracking = useCallback(async () => {
    if (!activeOrganizationId || !user?.id || !canShare || activationBusy) return;
    if (!navigator.geolocation) {
      setGateError("Este navegador não disponibiliza geolocalização. Use um navegador ou dispositivo compatível.");
      return;
    }

    setActivationBusy(true);
    setGateError("");

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

      if (locationRequired && verificationKey) {
        window.localStorage.setItem(verificationKey, "1");
        setVerificationVersion(value => value + 1);
      }
    } catch (error) {
      if (error && typeof error === "object" && "code" in error) {
        const geoError = error as GeolocationPositionError;
        if (locationRequired && geoError.code === geoError.PERMISSION_DENIED) {
          signingOutRef.current = true;
          void signOut();
          return;
        }
        setGateError(geolocationErrorMessage(geoError));
      } else {
        setGateError("Não foi possível iniciar o compartilhamento da localização. Tente novamente.");
      }
    } finally {
      setActivationBusy(false);
    }
  }, [
    activeOrganizationId,
    user?.id,
    canShare,
    activationBusy,
    locationRequired,
    verificationKey,
    signOut,
  ]);

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
        if (locationRequired) {
          // Falha temporária de GPS não deve derrubar a sessão.
          // Só tratamos como perda da localização obrigatória quando
          // o navegador informa que a permissão foi negada/revogada.
          if (error.code !== error.PERMISSION_DENIED) return;

          setFieldTrackingEnabled(activeOrganizationId, user.id, false);
          if (verificationKey) window.localStorage.removeItem(verificationKey);
          setGateError(geolocationErrorMessage(error));
          setVerificationVersion(value => value + 1);

          if (!signingOutRef.current) {
            signingOutRef.current = true;
            void signOut();
          }
          return;
        }

        if (error.code === error.PERMISSION_DENIED) {
          setFieldTrackingEnabled(activeOrganizationId, user.id, false);
          setPreferenceVersion(value => value + 1);
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 20_000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [
    activeOrganizationId,
    user?.id,
    canShare,
    enabled,
    locationRequired,
    verificationKey,
    signOut,
  ]);

  if (!showRequiredGate) return null;

  return <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
    <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <div className="border-b border-border px-5 py-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <MapPin size={21} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-black text-foreground">Localização obrigatória</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              O compartilhamento da localização é obrigatório para este usuário enquanto estiver usando o sistema.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="text-sm font-black">Ative a localização do navegador para continuar.</p>
          <p className="mt-1 text-xs leading-5">
            Esta exigência está ativada para o seu usuário. Se você recusar a permissão, a sessão será encerrada imediatamente. Se não ativar em até 1 minuto, o sistema fará logout automaticamente.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Tempo restante</span>
          <strong className="font-mono text-lg font-black text-foreground">
            00:{String(secondsLeft).padStart(2, "0")}
          </strong>
        </div>

        {gateError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold leading-5 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {gateError}
        </div>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AdminButton variant="secondary" disabled={activationBusy} onClick={() => void signOut()}>
            Sair
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
