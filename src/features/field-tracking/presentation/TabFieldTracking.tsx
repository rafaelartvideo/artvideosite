import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CarFront,
  Copy,
  Crosshair,
  MapPinned,
  Navigation,
  Plus,
  Server,
  Settings2,
  Smartphone,
  UserRound,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useAuth } from "@/lib/auth";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { cn } from "@/shared/domain/formatters";
import { AdminButton, AdminCard, AdminDialog, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { AdminSelect, FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import { QRCodeSVG } from "qrcode.react";
import { LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import {
  fieldTrackingStatus,
  fieldTrackingStatusLabel,
  type FieldTrackingStatus,
  type FieldTrackingUnit,
  type FieldTrackingUnitType,
} from "../domain/field-tracking";
import {
  createTraccarFieldTrackingUnit,
  getTraccarForwardIntegration,
  listFieldTrackingUnits,
  rotateTraccarFieldTrackingIdentifier,
  rotateTraccarForwardToken,
  stopMyFieldTracking,
  subscribeFieldTracking,
  TRACCAR_INGEST_URL,
  updateMyFieldLocation,
  type TraccarDeviceSetup,
  type TraccarForwardIntegration,
} from "../infrastructure/field-tracking.repository";
import {
  isFieldTrackingEnabled,
  setFieldTrackingEnabled,
} from "./FieldTrackingReporter";

const BRAZIL_CENTER: [number, number] = [-14.235, -51.9253];

const TYPE_OPTIONS = [
  { value: "", label: "Todos os rastreadores" },
  { value: "technician", label: "Técnicos" },
  { value: "vehicle", label: "Veículos" },
  { value: "device", label: "Dispositivos" },
];

const MANAGED_TYPE_OPTIONS = [
  { value: "technician", label: "Técnico" },
  { value: "vehicle", label: "Veículo" },
  { value: "device", label: "Celular / dispositivo" },
];

const IDENTIFIER_OPTIONS = [
  { value: "", label: "Sem identificador" },
  { value: "plate", label: "Placa" },
  { value: "imei", label: "IMEI" },
  { value: "serial", label: "Número de série" },
  { value: "other", label: "Outro" },
];

const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "online", label: "Ao vivo" },
  { value: "lost", label: "Sem sinal" },
  { value: "paused", label: "Pausados" },
  { value: "unknown", label: "Sem posição" },
];

function unitIcon(type: FieldTrackingUnitType) {
  if (type === "vehicle") return CarFront;
  if (type === "device") return Smartphone;
  return UserRound;
}

function statusColor(status: FieldTrackingStatus) {
  if (status === "online") return "#16a34a";
  if (status === "lost") return "#dc2626";
  if (status === "paused") return "#64748b";
  return "#94a3b8";
}

function statusClasses(status: FieldTrackingStatus) {
  if (status === "online") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "lost") return "border-red-200 bg-red-50 text-red-700";
  if (status === "paused") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-border bg-muted text-muted-foreground";
}

function formatLastSeen(value?: string | null) {
  if (!value) return "Sem atualização";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem atualização";
  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSeconds < 60) return `há ${diffSeconds}s`;
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function MapViewport({
  units,
  selectedId,
}: {
  units: FieldTrackingUnit[];
  selectedId: string | null;
}) {
  const map = useMap();

  useEffect(() => {
    const selected = selectedId ? units.find(unit => unit.id === selectedId) : null;
    if (selected?.latitude != null && selected.longitude != null) {
      map.flyTo([selected.latitude, selected.longitude], Math.max(map.getZoom(), 15), { duration: 0.65 });
      return;
    }

    const points = units
      .filter(unit => unit.latitude != null && unit.longitude != null)
      .map(unit => [Number(unit.latitude), Number(unit.longitude)] as [number, number]);

    if (points.length === 1) {
      map.setView(points[0], 14);
    } else if (points.length > 1) {
      map.fitBounds(points, { padding: [44, 44], maxZoom: 15 });
    }
  }, [map, selectedId, units]);

  return null;
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return <AdminCard className="flex min-h-[72px] items-center gap-3 p-3">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
      <Icon size={17} />
    </span>
    <span className="min-w-0">
      <strong className="block text-xl font-black leading-none text-foreground">{value}</strong>
      <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
    </span>
  </AdminCard>;
}

export function TabFieldTracking() {
  const { user, profile, activeOrganizationId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canView = hasPermission("field_tracking.view");
  const canShare = hasPermission("field_tracking.share");
  const canManage = hasPermission("field_tracking.manage");
  const [now, setNow] = useState(Date.now());
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trackingEnabled, setTrackingEnabledState] = useState(false);
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [trackerDialogOpen, setTrackerDialogOpen] = useState(false);
  const [trackerSaving, setTrackerSaving] = useState(false);
  const [traccarSetup, setTraccarSetup] = useState<TraccarDeviceSetup | null>(null);
  const [serverDialogOpen, setServerDialogOpen] = useState(false);
  const [serverBusy, setServerBusy] = useState(false);
  const [serverToken, setServerToken] = useState("");
  const [serverInfo, setServerInfo] = useState<TraccarForwardIntegration | null>(null);
  const [trackerForm, setTrackerForm] = useState({
    name: "",
    unitType: "technician" as "technician" | "vehicle" | "device",
    identifierType: "imei" as "" | "plate" | "imei" | "serial" | "other",
    identifierValue: "",
  });
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    setTrackingEnabledState(isFieldTrackingEnabled(activeOrganizationId, user?.id));
  }, [activeOrganizationId, user?.id]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const unitsQuery = useQuery({
    queryKey: ["field-tracking-units", activeOrganizationId],
    enabled: Boolean(activeOrganizationId && canView),
    queryFn: () => listFieldTrackingUnits(activeOrganizationId!),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!activeOrganizationId || !canView) return;
    return subscribeFieldTracking(activeOrganizationId, () => {
      void queryClient.invalidateQueries({ queryKey: ["field-tracking-units", activeOrganizationId] });
    });
  }, [activeOrganizationId, canView, queryClient]);

  const units = unitsQuery.data || [];
  const enriched = useMemo(
    () => units.map(unit => ({ ...unit, trackingStatus: fieldTrackingStatus(unit, now) })),
    [units, now],
  );
  const visibleUnits = enriched.filter(unit => {
    if (typeFilter && unit.unit_type !== typeFilter) return false;
    if (statusFilter && unit.trackingStatus !== statusFilter) return false;
    return true;
  });
  const mappedUnits = visibleUnits.filter(unit => unit.latitude != null && unit.longitude != null);
  const online = enriched.filter(unit => unit.trackingStatus === "online").length;
  const lost = enriched.filter(unit => unit.trackingStatus === "lost").length;
  const technicians = enriched.filter(unit => unit.unit_type === "technician").length;
  const vehicles = enriched.filter(unit => unit.unit_type === "vehicle").length;

  const enableTracking = () => {
    if (!activeOrganizationId || !user?.id || !canShare) return;
    if (!navigator.geolocation) {
      setToast({ msg: "Este dispositivo não disponibiliza geolocalização no navegador.", type: "error" });
      return;
    }

    setTrackingBusy(true);
    navigator.geolocation.getCurrentPosition(
      position => {
        void updateMyFieldLocation(activeOrganizationId, {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          heading: position.coords.heading,
          recordedAt: new Date(position.timestamp).toISOString(),
          deviceLabel: /Android/i.test(navigator.userAgent)
            ? "Android"
            : /iPhone/i.test(navigator.userAgent)
              ? "iPhone"
              : /iPad/i.test(navigator.userAgent)
                ? "iPad"
                : /Windows/i.test(navigator.userAgent)
                  ? "Windows"
                  : "Navegador",
        }).then(() => {
          setFieldTrackingEnabled(activeOrganizationId, user.id, true);
          setTrackingEnabledState(true);
          setToast({ msg: "Rastreamento deste dispositivo ativado.", type: "success" });
          void unitsQuery.refetch();
        }).catch(error => {
          setToast({ msg: `Não foi possível iniciar o rastreamento: ${systemErrorMessage(error)}`, type: "error" });
        }).finally(() => setTrackingBusy(false));
      },
      error => {
        setTrackingBusy(false);
        setToast({
          msg: error.code === error.PERMISSION_DENIED
            ? "Permita o acesso à localização para iniciar o rastreamento."
            : "Não foi possível obter a localização deste dispositivo.",
          type: "error",
        });
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
  };

  const disableTracking = async () => {
    if (!activeOrganizationId || !user?.id) return;
    setTrackingBusy(true);
    try {
      setFieldTrackingEnabled(activeOrganizationId, user.id, false);
      await stopMyFieldTracking(activeOrganizationId);
      setTrackingEnabledState(false);
      setToast({ msg: "Rastreamento pausado neste dispositivo.", type: "success" });
      await unitsQuery.refetch();
    } catch (error) {
      setToast({ msg: `Não foi possível pausar o rastreamento: ${systemErrorMessage(error)}`, type: "error" });
    } finally {
      setTrackingBusy(false);
    }
  };

  const openNewTracker = () => {
    setTraccarSetup(null);
    setTrackerForm({
      name: "",
      unitType: "technician",
      identifierType: "imei",
      identifierValue: "",
    });
    setTrackerDialogOpen(true);
  };

  const handleCreateTracker = async () => {
    if (!activeOrganizationId || !canManage || !trackerForm.name.trim()) return;
    const identifier = trackerForm.identifierValue.trim();
    if (trackerForm.identifierType === "imei" && identifier && !/^\d{15}$/.test(identifier.replace(/\D/g, ""))) {
      setToast({ msg: "IMEI deve possuir 15 dígitos.", type: "error" });
      return;
    }

    setTrackerSaving(true);
    try {
      const setup = await createTraccarFieldTrackingUnit(activeOrganizationId, {
        unitType: trackerForm.unitType,
        name: trackerForm.name.trim(),
        identifierType: trackerForm.identifierType || null,
        identifierValue: identifier || null,
      });
      setTraccarSetup(setup);
      setToast({ msg: "Rastreador criado. Configure estes dados no Traccar Client.", type: "success" });
      await unitsQuery.refetch();
    } catch (error) {
      setToast({ msg: `Não foi possível criar o rastreador: ${systemErrorMessage(error)}`, type: "error" });
    } finally {
      setTrackerSaving(false);
    }
  };

  const regenerateTraccarIdentifier = async (unit: FieldTrackingUnit) => {
    if (!activeOrganizationId || !canManage) return;
    setTrackerSaving(true);
    try {
      const identifier = await rotateTraccarFieldTrackingIdentifier(activeOrganizationId, unit.id);
      setTraccarSetup({
        unit_id: unit.id,
        unit_name: unit.name,
        device_identifier: identifier,
      });
      setTrackerDialogOpen(true);
      setToast({ msg: "Novo identificador gerado. O identificador anterior deixou de funcionar.", type: "success" });
      await unitsQuery.refetch();
    } catch (error) {
      setToast({ msg: `Não foi possível gerar um novo identificador: ${systemErrorMessage(error)}`, type: "error" });
    } finally {
      setTrackerSaving(false);
    }
  };

  const openServerConfig = async () => {
    if (!activeOrganizationId || !canManage) return;
    setServerDialogOpen(true);
    setServerToken("");
    setServerBusy(true);
    try {
      setServerInfo(await getTraccarForwardIntegration(activeOrganizationId));
    } catch (error) {
      setToast({ msg: `Não foi possível carregar a integração: ${systemErrorMessage(error)}`, type: "error" });
    } finally {
      setServerBusy(false);
    }
  };

  const rotateServerToken = async () => {
    if (!activeOrganizationId || !canManage) return;
    setServerBusy(true);
    try {
      const result = await rotateTraccarForwardToken(activeOrganizationId);
      setServerToken(result.token);
      setServerInfo(current => ({
        configured: true,
        token_hint: result.token_hint,
        last_received_at: current?.last_received_at ?? null,
      }));
      setToast({ msg: "Token do Traccar Server gerado. Copie agora; ele não será exibido novamente.", type: "success" });
    } catch (error) {
      setToast({ msg: `Não foi possível gerar o token: ${systemErrorMessage(error)}`, type: "error" });
    } finally {
      setServerBusy(false);
    }
  };

  const copyValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setToast({ msg: `${label} copiado.`, type: "success" });
    } catch {
      setToast({ msg: "Não foi possível copiar automaticamente.", type: "error" });
    }
  };

  const traccarForwardSnippet = serverToken
    ? `<entry key='forward.type'>json</entry>\n<entry key='forward.url'>${TRACCAR_INGEST_URL}</entry>\n<entry key='forward.header'>Authorization: Bearer ${serverToken}</entry>\n<entry key='forward.retry.enable'>true</entry>`
    : "";

  return <div className="min-w-0 space-y-4">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    <PageHeader
      title="Mapa de Campo"
      subtitle="Rastreamento em tempo real por Traccar Client, Traccar Server e dispositivos vinculados."
      actions={(canShare || canManage) ? <div className="flex flex-wrap justify-end gap-2">
        {canManage && <AdminButton variant="secondary" onClick={() => void openServerConfig()}>
          <Settings2 size={15} /> Traccar Server
        </AdminButton>}
        {canManage && <AdminButton variant="primary" onClick={openNewTracker}>
          <Plus size={15} /> Novo rastreador
        </AdminButton>}
        {canShare && <AdminButton
          variant={trackingEnabled ? "secondary" : "primary"}
          loading={trackingBusy}
          loadingText={trackingEnabled ? "Pausando..." : "Ativando..."}
          onClick={() => trackingEnabled ? void disableTracking() : enableTracking()}
        >
          {trackingEnabled ? <WifiOff size={15} /> : <Navigation size={15} />}
          {trackingEnabled ? "Pausar teste" : "Teste pelo navegador"}
        </AdminButton>}
      </div> : undefined}
    />

    {canShare && <AdminCard className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-black text-foreground">Compartilhamento deste dispositivo</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {trackingEnabled
            ? `${profile?.full_name || "Seu usuário"} está enviando a localização pelo navegador. Para uso contínuo em segundo plano, prefira o Traccar Client.`
            : "Esta opção serve como teste rápido. Para o uso diário em campo, cadastre o aparelho em Novo rastreador e configure o Traccar Client."}
        </p>
      </div>
      <span className={cn(
        "inline-flex w-fit shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide",
        trackingEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border bg-muted text-muted-foreground",
      )}>
        <span className={cn("h-2 w-2 rounded-full", trackingEnabled ? "bg-emerald-500 field-tracking-live-dot" : "bg-slate-400")} />
        {trackingEnabled ? "Compartilhando" : "Desativado"}
      </span>
    </AdminCard>}

    {!canView ? (
      <AdminCard className="p-8 text-center">
        <Navigation className="mx-auto text-primary" size={28} />
        <h2 className="mt-3 text-base font-black text-foreground">Rastreamento do dispositivo</h2>
        <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
          Seu perfil pode compartilhar a própria localização, mas não possui permissão para visualizar o mapa e a posição dos demais rastreadores.
        </p>
      </AdminCard>
    ) : unitsQuery.isPending ? <LoadingState text="Carregando mapa de campo..." /> : (
      <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Ao vivo" value={online} icon={Wifi} />
          <Metric label="Sem sinal" value={lost} icon={WifiOff} />
          <Metric label="Técnicos" value={technicians} icon={UserRound} />
          <Metric label="Veículos" value={vehicles} icon={CarFront} />
        </div>

        <AdminCard className="relative isolate z-0 overflow-hidden p-0">
          <div className="relative z-20 flex flex-col gap-3 border-b border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black text-foreground">Posições em tempo real</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Verde = recebendo posição · vermelho = conexão perdida.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="w-44">
                <AdminSelect value={typeFilter} onValueChange={setTypeFilter} options={TYPE_OPTIONS} ariaLabel="Filtrar tipo de rastreador" />
              </div>
              <div className="w-40">
                <AdminSelect value={statusFilter} onValueChange={setStatusFilter} options={STATUS_OPTIONS} ariaLabel="Filtrar status do rastreador" />
              </div>
            </div>
          </div>

          <div className="relative z-0 grid min-h-[560px] lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="field-tracking-map-shell relative isolate z-0 min-h-[420px] overflow-hidden border-b border-border lg:border-b-0 lg:border-r">
              <MapContainer
                center={BRAZIL_CENTER}
                zoom={4}
                scrollWheelZoom
                className="field-tracking-map relative z-0 h-full min-h-[560px] w-full bg-muted"
              >
                <TileLayer
                  attribution='&copy; OpenStreetMap contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapViewport units={mappedUnits} selectedId={selectedId} />
                {mappedUnits.map(unit => {
                  const status = unit.trackingStatus;
                  const color = statusColor(status);
                  const point: [number, number] = [Number(unit.latitude), Number(unit.longitude)];
                  return <Fragment key={unit.id}>
                    {status === "online" && <CircleMarker
                      center={point}
                      radius={15}
                      pathOptions={{ color, fillColor: color, fillOpacity: 0.10, weight: 2, className: "field-tracking-map-pulse" }}
                    />}
                    <CircleMarker
                      center={point}
                      radius={8}
                      eventHandlers={{ click: () => setSelectedId(unit.id) }}
                      pathOptions={{ color: "#fff", fillColor: color, fillOpacity: 1, weight: 3 }}
                    >
                      <Popup>
                        <div className="min-w-[170px]">
                          <strong>{unit.name}</strong>
                          <div>{fieldTrackingStatusLabel(status)} · {formatLastSeen(unit.last_seen_at)}</div>
                          <div>{unit.tracking_provider === "traccar_client" ? "Traccar Client" : unit.tracking_provider === "traccar_server" ? "Traccar Server" : "Navegador"}</div>
                          {unit.battery_level != null && <div>Bateria: {Math.round(Number(unit.battery_level))}%{unit.charging ? " · carregando" : ""}</div>}
                          {unit.accuracy_m != null && <div>Precisão: ~{Math.round(Number(unit.accuracy_m))} m</div>}
                        </div>
                      </Popup>
                    </CircleMarker>
                  </Fragment>;
                })}
              </MapContainer>

              {mappedUnits.length === 0 && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
                <div className="rounded-xl border border-border bg-card/95 px-5 py-4 text-center shadow-lg backdrop-blur">
                  <MapPinned className="mx-auto text-primary" size={24} />
                  <p className="mt-2 text-sm font-black text-foreground">Nenhuma posição disponível</p>
                  <p className="mt-1 text-xs text-muted-foreground">Ative um dispositivo de campo para o primeiro ponto aparecer no mapa.</p>
                </div>
              </div>}
            </div>

            <aside className="relative z-10 max-h-[560px] overflow-y-auto bg-card">
              <div className="sticky top-0 z-10 border-b border-border bg-card px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.1em] text-muted-foreground">
                  Rastreadores ({visibleUnits.length})
                </p>
              </div>
              <div className="divide-y divide-border">
                {visibleUnits.map(unit => {
                  const Icon = unitIcon(unit.unit_type);
                  const status = unit.trackingStatus;
                  return <div
                    key={unit.id}
                    className={cn(
                      "flex items-stretch transition-colors hover:bg-muted",
                      selectedId === unit.id && "bg-primary-soft",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(unit.id)}
                      className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left"
                    >
                      <span className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
                        <Icon size={16} />
                        <span
                          className={cn("absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-card", status === "online" && "field-tracking-live-dot")}
                          style={{ backgroundColor: statusColor(status) }}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-black text-foreground">{unit.name}</span>
                        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                          {unit.identifier_value
                            ? `${unit.identifier_type === "plate" ? "Placa" : unit.identifier_type === "imei" ? "IMEI" : unit.identifier_type === "serial" ? "Série" : "ID"}: ${unit.identifier_value}`
                            : unit.device_label || (unit.unit_type === "vehicle" ? "Veículo" : unit.unit_type === "device" ? "Dispositivo" : "Técnico")}
                        </span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide", statusClasses(status))}>
                            {fieldTrackingStatusLabel(status)}
                          </span>
                          <span className="text-[9px] font-semibold text-muted-foreground">{formatLastSeen(unit.last_seen_at)}</span>
                          {unit.battery_level != null && <span className="text-[9px] font-semibold text-muted-foreground">{Math.round(Number(unit.battery_level))}% bateria</span>}
                        </span>
                      </span>
                      <Crosshair size={14} className="mt-2 shrink-0 text-primary" />
                    </button>
                    {canManage && unit.tracking_provider !== "native" && <button
                      type="button"
                      onClick={() => void regenerateTraccarIdentifier(unit)}
                      title="Gerar novo identificador do Traccar Client"
                      aria-label={`Reconfigurar ${unit.name} no Traccar Client`}
                      className="flex w-10 shrink-0 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:text-primary"
                    >
                      <Smartphone size={15} />
                    </button>}
                  </div>;
                })}
                {visibleUnits.length === 0 && <div className="p-6 text-center text-xs font-semibold text-muted-foreground">
                  Nenhum rastreador corresponde aos filtros.
                </div>}
              </div>
            </aside>
          </div>
        </AdminCard>

        <p className="text-[10px] leading-5 text-muted-foreground">
          Para técnicos e celulares corporativos, use o Traccar Client com o identificador gerado pelo CRM. O rastreamento pelo navegador acima fica apenas como alternativa de teste.
        </p>
      </>
    )}

    <AdminDialog
      open={trackerDialogOpen}
      onClose={() => {
        if (trackerSaving) return;
        setTrackerDialogOpen(false);
        setTraccarSetup(null);
      }}
      title={traccarSetup ? `Configurar ${traccarSetup.unit_name}` : "Novo rastreador"}
      description={traccarSetup
        ? "Copie os dados abaixo para o Traccar Client instalado no celular. O identificador é exclusivo deste rastreador."
        : "Cadastre o técnico, veículo ou dispositivo. O CRM gera automaticamente um identificador seguro para o Traccar Client."}
      className="max-w-xl"
    >
      {!traccarSetup ? <div className="space-y-4">
        <FInput
          label="Nome do rastreador"
          value={trackerForm.name}
          disabled={trackerSaving}
          onChange={(event: any) => setTrackerForm(current => ({ ...current, name: event.target.value }))}
          placeholder={trackerForm.unitType === "vehicle" ? "Ex.: Carro 01" : trackerForm.unitType === "technician" ? "Ex.: João - Técnico" : "Ex.: Celular técnico 02"}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FSelect
            label="Tipo"
            value={trackerForm.unitType}
            disabled={trackerSaving}
            onChange={(event: any) => {
              const nextType = event.target.value as "technician" | "vehicle" | "device";
              setTrackerForm(current => ({
                ...current,
                unitType: nextType,
                identifierType: nextType === "vehicle" ? "plate" : "imei",
                identifierValue: "",
              }));
            }}
            options={MANAGED_TYPE_OPTIONS}
          />
          <FSelect
            label="Identificador físico"
            value={trackerForm.identifierType}
            disabled={trackerSaving}
            onChange={(event: any) => setTrackerForm(current => ({
              ...current,
              identifierType: event.target.value,
              identifierValue: "",
            }))}
            options={IDENTIFIER_OPTIONS}
          />
        </div>
        {trackerForm.identifierType && <FInput
          label={trackerForm.identifierType === "imei" ? "IMEI (opcional)" : trackerForm.identifierType === "plate" ? "Placa (opcional)" : trackerForm.identifierType === "serial" ? "Número de série (opcional)" : "Identificador (opcional)"}
          value={trackerForm.identifierValue}
          disabled={trackerSaving}
          onChange={(event: any) => setTrackerForm(current => ({
            ...current,
            identifierValue: trackerForm.identifierType === "imei"
              ? String(event.target.value).replace(/\D/g, "").slice(0, 15)
              : event.target.value,
          }))}
          placeholder={trackerForm.identifierType === "imei" ? "15 dígitos" : trackerForm.identifierType === "plate" ? "ABC1D23" : "Identificação física"}
        />}
        <p className="text-xs leading-5 text-muted-foreground">
          IMEI, placa e série servem apenas para identificar o equipamento. A autenticação do rastreamento usa um ID aleatório gerado pelo Union World.
        </p>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <AdminButton variant="secondary" disabled={trackerSaving} onClick={() => setTrackerDialogOpen(false)}>Cancelar</AdminButton>
          <AdminButton
            loading={trackerSaving}
            loadingText="Criando..."
            disabled={!trackerForm.name.trim()}
            onClick={() => void handleCreateTracker()}
          >
            Criar rastreador
          </AdminButton>
        </div>
      </div> : <div className="space-y-4">
        <div className="rounded-xl border border-primary/20 bg-primary-soft/50 p-4">
          <p className="text-xs font-black text-foreground">No Traccar Client</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Instale o app no celular e preencha exatamente os dois campos abaixo. Depois ative o serviço de rastreamento no aplicativo.
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Server URL</p>
          <div className="flex gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-muted px-3 py-2.5 text-xs text-foreground">{TRACCAR_INGEST_URL}</code>
            <AdminButton variant="secondary" className="shrink-0" onClick={() => void copyValue(TRACCAR_INGEST_URL, "Server URL")}>
              <Copy size={14} />
            </AdminButton>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Device identifier</p>
          <div className="flex gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-muted px-3 py-2.5 font-mono text-xs font-black text-foreground">{traccarSetup.device_identifier}</code>
            <AdminButton variant="secondary" className="shrink-0" onClick={() => void copyValue(traccarSetup.device_identifier, "Device identifier")}>
              <Copy size={14} />
            </AdminButton>
          </div>
        </div>

        <div className="rounded-xl border border-border p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Configuração recomendada</p>
          <div className="mt-2 grid gap-2 text-xs text-foreground sm:grid-cols-2">
            <span><strong>Precisão:</strong> High</span>
            <span><strong>Distância:</strong> 30 m</span>
            <span><strong>Intervalo:</strong> 30 s</span>
            <span><strong>Status:</strong> Serviço ligado</span>
          </div>
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          Guarde o Device Identifier no aplicativo. Por segurança o valor completo não fica visível depois que este modal for fechado; se precisar configurar outro aparelho, gere um novo identificador pelo ícone de celular na lista.
        </p>

        <div className="flex justify-end border-t border-border pt-4">
          <AdminButton onClick={() => {
            setTrackerDialogOpen(false);
            setTraccarSetup(null);
          }}>Concluir</AdminButton>
        </div>
      </div>}
    </AdminDialog>

    <AdminDialog
      open={serverDialogOpen}
      onClose={() => {
        if (serverBusy) return;
        setServerDialogOpen(false);
        setServerToken("");
      }}
      title="Traccar Server"
      description="Opcional. Use quando quiser concentrar celulares e rastreadores GPS físicos em um servidor Traccar antes de encaminhar as posições ao Union World."
      className="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Integração</p>
            <p className="mt-1 text-sm font-black text-foreground">{serverInfo?.configured ? "Configurada" : "Não configurada"}</p>
            {serverInfo?.token_hint && <p className="mt-1 text-xs text-muted-foreground">Token atual termina em •••{serverInfo.token_hint}</p>}
          </div>
          <div className="rounded-xl border border-border p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Última posição recebida</p>
            <p className="mt-1 text-sm font-black text-foreground">
              {serverInfo?.last_received_at
                ? new Date(serverInfo.last_received_at).toLocaleString("pt-BR")
                : "Nenhuma ainda"}
            </p>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Forward URL</p>
          <div className="flex gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-muted px-3 py-2.5 text-xs text-foreground">{TRACCAR_INGEST_URL}</code>
            <AdminButton variant="secondary" onClick={() => void copyValue(TRACCAR_INGEST_URL, "Forward URL")}><Copy size={14} /></AdminButton>
          </div>
        </div>

        {serverToken && <div>
          <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Novo token — copie agora</p>
          <div className="flex gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-muted px-3 py-2.5 font-mono text-xs text-foreground">{serverToken}</code>
            <AdminButton variant="secondary" onClick={() => void copyValue(serverToken, "Token")}><Copy size={14} /></AdminButton>
          </div>
        </div>}

        {traccarForwardSnippet && <div>
          <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">traccar.xml</p>
          <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-muted p-4 text-[11px] leading-5 text-foreground">{traccarForwardSnippet}</pre>
          <AdminButton variant="secondary" className="mt-2" onClick={() => void copyValue(traccarForwardSnippet, "Configuração")}>
            <Copy size={14} /> Copiar configuração
          </AdminButton>
        </div>}

        <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-muted-foreground">
            Gerar um novo token invalida o token anterior e exige atualizar o Traccar Server.
          </p>
          <AdminButton loading={serverBusy} loadingText="Gerando..." onClick={() => void rotateServerToken()}>
            <Server size={14} /> {serverInfo?.configured ? "Gerar novo token" : "Gerar token"}
          </AdminButton>
        </div>
      </div>
    </AdminDialog>
  </div>;
}
