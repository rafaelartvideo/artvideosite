import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useLocation, useMatch, useNavigate } from "react-router";
import { ClipboardList, MapPin, WifiOff } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminCard, AdminCardContent, AdminStickyToolbar, BtnPrimary, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  captureTechnicianLocation, finishMyTechnicianTask, getTechnicianPhotoSignedUrl,
  listMyTechnicianPhotos, loadMyTechnicianTasks, startMyTechnicianTask,
  uploadTechnicianPhoto, type TechnicianTask, type TechnicianTaskStatus,
  type TechnicianLocation,
} from "../infrastructure/technician-tasks.repository";

type Notice = { kind: "success" | "error"; text: string };
type PhotoPreview = { id: string; url: string };

const STATUS_LABEL: Record<TechnicianTaskStatus, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
};
const STATUS_CLASS: Record<TechnicianTaskStatus, string> = {
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  in_progress: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  cancelled: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function LocationRecord({ value, label }: { value: TechnicianLocation | null; label: string }) {
  if (value?.lat == null || value.lng == null) return null;
  const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(`${value.lat},${value.lng}`)}`;
  return <a href={mapUrl} target="_blank" rel="noreferrer"
    className="flex items-start gap-2 text-xs font-semibold text-primary underline-offset-2 hover:underline">
    <MapPin size={15} className="mt-0.5 shrink-0" />
    <span>{label}: {value.lat}, {value.lng}
      {value.accuracy_m ? ` (precisão ±${Math.round(value.accuracy_m)} m)` : ""}
      <span className="block font-normal text-muted-foreground">{formatDate(value.captured_at)}</span>
    </span>
  </a>;
}

export function TechnicianPanel() {
  const { activeOrganizationId, hasPermission } = useAuth();
  const navigate = useNavigate();
  const { search } = useLocation();
  const orderMatch = useMatch("/admin/technician-panel/os/:orderId");
  const routeOrderId = orderMatch?.params.orderId || null;
  const routeServiceId = new URLSearchParams(search).get("service");
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<TechnicianTask[]>([]);
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);

  const canStart = hasPermission("technician_panel.actions.start");
  const canComplete = hasPermission("technician_panel.actions.complete");
  const canSendPhotos = hasPermission("technician_panel.actions.photo");
  const canSeePhotos = hasPermission("technician_panel.data.photos");
  const canSeeLocation = hasPermission("technician_panel.data.location");
  const assignedOrders = useMemo(() => {
    const grouped = new Map<string, TechnicianTask[]>();
    for (const item of items) grouped.set(item.service_order_id, [...(grouped.get(item.service_order_id) || []), item]);
    return Array.from(grouped.values());
  }, [items]);
  const orderServices = useMemo(() => routeOrderId
    ? items.filter(item => item.service_order_id === routeOrderId) : [], [items, routeOrderId]);
  const selected = orderServices.find(item => item.item_id === routeServiceId) || orderServices[0] || null;
  const selectedId = selected?.item_id || null;
  const openService = (item: TechnicianTask) => navigate("/admin/technician-panel/os/" + encodeURIComponent(item.service_order_id) + "?service=" + encodeURIComponent(item.item_id));

  const refresh = useCallback(async (showLoading = false) => {
    if (!activeOrganizationId) {
      setItems([]);
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    try {
      const list = await loadMyTechnicianTasks(activeOrganizationId);
      setItems(list);
    } catch (error) {
      setNotice({ kind: "error", text: systemErrorMessage(error, "Não foi possível carregar seus serviços.") });
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId]);

  useEffect(() => {
    setItems([]);
    setNotice(null);
    void refresh(true);
  }, [refresh]);

  useEffect(() => {
    const handleOnline = () => { setOnline(true); void refresh(); };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refresh]);

  useEffect(() => {
    setPhotos([]);
    setReport(selected?.execution_report || "");
    if (!selectedId || !canSeePhotos) return;
    let cancelled = false;
    setPhotoLoading(true);
    void (async () => {
      try {
        const attachments = await listMyTechnicianPhotos(selectedId);
        const previews = await Promise.all(attachments.map(async attachment => ({
          id: attachment.id,
          url: await getTechnicianPhotoSignedUrl(attachment.path),
        })));
        if (!cancelled) setPhotos(previews);
      } catch (error) {
        if (!cancelled) setNotice({ kind: "error", text: systemErrorMessage(error, "Não foi possível carregar as fotos.") });
      } finally {
        if (!cancelled) setPhotoLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId, canSeePhotos, selected?.execution_report]);

  const runWithGps = async (action: "start" | "finish") => {
    if (!selected || busy) return;
    if (!navigator.onLine) {
      setNotice({ kind: "error", text: "A execução offline será liberada em uma próxima etapa. Conecte-se para registrar esta ação." });
      return;
    }
    if (action === "finish" && report.trim().length < 10) {
      setNotice({ kind: "error", text: "Descreva o que foi realizado com pelo menos 10 caracteres." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const coordinates = await captureTechnicianLocation();
      if (action === "start") await startMyTechnicianTask(selected.item_id, coordinates);
      else await finishMyTechnicianTask(selected.item_id, report, coordinates);
      await refresh();
      setNotice({ kind: "success", text: action === "start" ? "Serviço iniciado. Localização registrada." : "Serviço concluído. Relatório e localização salvos." });
    } catch (error) {
      setNotice({ kind: "error", text: systemErrorMessage(error, "Não foi possível registrar a execução.") });
    } finally {
      setBusy(false);
    }
  };

  const onUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    if (!activeOrganizationId || !selected || !selectedFiles.length || uploading) return;
    if (!navigator.onLine) {
      setNotice({ kind: "error", text: "O envio de fotos offline estará disponível na próxima etapa." });
      return;
    }
    setUploading(true);
    setNotice(null);
    try {
      for (const file of selectedFiles) {
        await uploadTechnicianPhoto(activeOrganizationId, selected.item_id, file);
      }
      // Enviar e visualizar fotos são permissões independentes. Não consultar
      // a galeria caso o cargo tenha só autorização de envio.
      if (canSeePhotos) {
        const attachments = await listMyTechnicianPhotos(selected.item_id);
        const previews = await Promise.all(attachments.map(async attachment => ({
          id: attachment.id,
          url: await getTechnicianPhotoSignedUrl(attachment.path),
        })));
        setPhotos(previews);
      }
      setNotice({ kind: "success", text: "Fotos anexadas ao serviço." });
    } catch (error) {
      setNotice({ kind: "error", text: systemErrorMessage(error, "Não foi possível anexar todas as fotos.") });
    } finally {
      setUploading(false);
    }
  };

  const address = selected?.service_address;
  const formattedAddress = address ? [
    [address.street, address.number].filter(Boolean).join(", "),
    address.complement,
    address.neighborhood,
    [address.city, address.state].filter(Boolean).join(" / "),
    address.zip_code ? "CEP " + address.zip_code : null,
  ].filter(Boolean).join(" — ") : "";

  const info = (label: string, value: string | number | null | undefined) =>
    value ? <div className="min-w-0">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-semibold text-foreground">{value}</p>
    </div> : null;

  return <div className="mx-auto max-w-6xl space-y-4">
    <PageHeader
      eyebrow="Atendimento"
      title={routeOrderId ? (selected ? "OS " + selected.os_number : "Ordem de Serviço") : "Painel do Técnico"}
      subtitle={routeOrderId
        ? "Dados e serviços da OS atribuídos a você, conforme suas permissões."
        : "Ordens de serviço com atividades atribuídas a você."}
      actions={!online ? <span className="inline-flex items-center gap-2 text-xs font-semibold text-amber-700"><WifiOff size={16} /> Sem internet</span> : undefined}
    />

    {notice && <div role="status" className={notice.kind === "error"
      ? "border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700"
      : "border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700"}>{notice.text}</div>}

    {!routeOrderId ? <>
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { name: "Pendentes", count: items.filter(item => item.status === "pending").length },
          { name: "Em andamento", count: items.filter(item => item.status === "in_progress").length },
          { name: "Concluídos", count: items.filter(item => item.status === "completed").length },
        ].map(card => <AdminCard key={card.name}><AdminCardContent className="p-3 sm:p-4">
          <p className="text-[11px] font-semibold text-muted-foreground">{card.name}</p>
          <p className="mt-1 text-2xl font-black text-foreground">{card.count}</p>
        </AdminCardContent></AdminCard>)}
      </div>

      <Section title="Minhas ordens de serviço" description="Abra a OS para consultar os dados e executar os serviços atribuídos." flush>
        {loading ? <p className="p-6 text-sm text-muted-foreground">Carregando suas ordens de serviço...</p>
          : !assignedOrders.length ? <p className="p-6 text-sm text-muted-foreground">Nenhum serviço foi atribuído a você nesta empresa.</p>
          : <div className="divide-y divide-border">
            {assignedOrders.map(services => {
              const first = services[0];
              const inProgress = services.filter(item => item.status === "in_progress").length;
              const pending = services.filter(item => item.status === "pending").length;
              return <button key={first.service_order_id} type="button" onClick={() => openService(first)}
                className="flex w-full cursor-pointer flex-col gap-2 px-4 py-4 text-left transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-black text-foreground">OS {first.os_number}</p>
                  <p className="mt-1 break-words text-xs font-medium text-muted-foreground">{services.map(item => item.title).join(" · ")}</p>
                  {first.customer_name && <p className="mt-1 text-xs text-muted-foreground">{first.customer_name}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {inProgress > 0 && <span className={"border px-2 py-1 text-xs font-bold " + STATUS_CLASS.in_progress}>{inProgress} em andamento</span>}
                  {pending > 0 && <span className={"border px-2 py-1 text-xs font-bold " + STATUS_CLASS.pending}>{pending} pendente{pending > 1 ? "s" : ""}</span>}
                  {!inProgress && !pending && <span className="text-xs text-muted-foreground">{services.length} serviço{services.length > 1 ? "s" : ""}</span>}
                  <span className="text-xs font-bold text-primary">Abrir OS</span>
                </div>
              </button>;
            })}
          </div>}
      </Section>

      <AdminStickyToolbar>
        <BtnSecondary onClick={() => void refresh(true)} disabled={busy || uploading || loading} loading={loading}>Atualizar</BtnSecondary>
      </AdminStickyToolbar>
    </> : !selected ? <>
      <Section title="Ordem de Serviço não disponível">
        <p className="text-sm text-muted-foreground">{loading
          ? "Verificando as suas atribuições..."
          : "Esta OS não possui serviços atribuídos a você nesta empresa."}</p>
      </Section>
      <AdminStickyToolbar>
        <BtnSecondary onClick={() => navigate("/admin/technician-panel")}>Voltar</BtnSecondary>
      </AdminStickyToolbar>
    </> : <>
      <Section title="Dados da OS" description="Somente informações autorizadas para o seu perfil.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {info("Cliente", selected.customer_name)}
          {info("Contato", selected.customer_contact)}
          {info("Equipamento", selected.equipment)}
          {info("Modelo", selected.equipment_model)}
          {info("Número de série", selected.serial_number)}
          {info("Agendamento", selected.scheduled_at ? formatDate(selected.scheduled_at) : null)}
          {info("Endereço", formattedAddress)}
        </div>
      </Section>

      {selected.problem && <Section title="Descrição do problema">
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">{selected.problem}</p>
      </Section>}
      {selected.diagnosis && <Section title="Diagnóstico">
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">{selected.diagnosis}</p>
      </Section>}

      <Section title="Serviços atribuídos nesta OS" description="Cada serviço possui andamento independente da situação geral da OS.">
        <div className="grid gap-2 sm:grid-cols-2">
          {orderServices.map(service => <button key={service.item_id} type="button" onClick={() => openService(service)}
            aria-pressed={service.item_id === selectedId}
            className={"flex min-w-0 cursor-pointer flex-col gap-2 border p-3 text-left transition-colors hover:border-primary/60 " + (service.item_id === selectedId ? "border-primary bg-primary/5" : "border-border bg-card")}>
            <span className="break-words text-sm font-bold text-foreground">{service.title}</span>
            <span className={"self-start border px-2 py-1 text-[10px] font-bold " + STATUS_CLASS[service.status]}>{STATUS_LABEL[service.status]}</span>
          </button>)}
        </div>
      </Section>

      <Section title="Execução do serviço">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-foreground">{selected.title}</p>
            <span className={"border px-2.5 py-1 text-xs font-bold " + STATUS_CLASS[selected.status]}>{STATUS_LABEL[selected.status]}</span>
          </div>
          {selected.description && <div>
            <p className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">Descrição do serviço</p>
            <p className="whitespace-pre-wrap break-words text-sm">{selected.description}</p>
          </div>}
          {selected.started_at && info("Iniciado em", formatDate(selected.started_at))}
          {selected.status === "pending" && canStart && <p className="text-xs text-muted-foreground">
            Para iniciar, permita o GPS. O local e o horário serão registrados na OS.
          </p>}
          {selected.status === "in_progress" && canComplete && <FTextarea
            id="technician-report" label="O que foi realizado? *"
            value={report} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setReport(event.target.value)}
            rows={5} maxLength={10000} placeholder="Descreva o serviço executado..."
          />}
          {selected.status === "completed" && <>
            {info("Finalizado em", formatDate(selected.completed_at))}
            {selected.execution_report && <div>
              <p className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">Serviço realizado</p>
              <p className="whitespace-pre-wrap text-sm">{selected.execution_report}</p>
            </div>}
          </>}
          {selected.status === "cancelled" && <p className="text-sm text-muted-foreground">Serviço cancelado. Consulte o responsável pela OS.</p>}
        </div>
      </Section>

      {(canSendPhotos || canSeePhotos) && <Section title="Imagens do serviço"
        description="Imagens privadas vinculadas a este serviço. JPG, PNG ou WEBP, até 5 MB por imagem.">
        <div className="space-y-3">
          {selected.status === "in_progress" && canSendPhotos && <div className="flex flex-wrap gap-2">
            <BtnSecondary onClick={() => cameraInputRef.current?.click()} disabled={!online || busy || uploading} loading={uploading}>Abrir câmera</BtnSecondary>
            <BtnSecondary onClick={() => galleryInputRef.current?.click()} disabled={!online || busy || uploading} loading={uploading}>Selecionar imagem</BtnSecondary>
          </div>}
          <input ref={cameraInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only"
            aria-label="Capturar foto com a câmera" disabled={!online || uploading || busy} onChange={event => void onUpload(event)} />
          <input ref={galleryInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple className="sr-only"
            aria-label="Selecionar imagens do dispositivo" disabled={!online || uploading || busy} onChange={event => void onUpload(event)} />
          {canSeePhotos && (photoLoading ? <p className="text-xs text-muted-foreground">Carregando imagens...</p>
            : photos.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {photos.map(photo => <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" title="Abrir foto">
                <img src={photo.url} alt="Foto da execução técnica" loading="lazy" className="aspect-square w-full border border-border object-cover" />
              </a>)}
            </div> : <p className="text-xs text-muted-foreground">Nenhuma foto enviada.</p>)}
        </div>
      </Section>}

      {canSeeLocation && <Section title="Localização da execução">
        <div className="space-y-3">
          <LocationRecord value={selected.start_location} label="Local de início" />
          <LocationRecord value={selected.finish_location} label="Local de conclusão" />
          {!selected.start_location?.lat && !selected.finish_location?.lat && <p className="text-xs text-muted-foreground">Nenhuma localização registrada.</p>}
        </div>
      </Section>}

      <AdminStickyToolbar className="flex-wrap">
        <BtnSecondary onClick={() => navigate("/admin/technician-panel")} disabled={busy || uploading}>Voltar</BtnSecondary>
        <BtnSecondary onClick={() => void refresh(true)} disabled={busy || uploading || loading}>Atualizar</BtnSecondary>
        {selected.status === "pending" && canStart && <BtnPrimary
          disabled={busy || uploading || !online} loading={busy}
          onClick={() => void runWithGps("start")}>Iniciar serviço</BtnPrimary>}
        {selected.status === "in_progress" && canComplete && <BtnPrimary
          disabled={busy || uploading || !online || report.trim().length < 10} loading={busy}
          onClick={() => void runWithGps("finish")}>Finalizar serviço</BtnPrimary>}
      </AdminStickyToolbar>
    </>}
  </div>;
}
