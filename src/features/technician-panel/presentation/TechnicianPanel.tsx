import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Camera, CheckCircle2, ClipboardList, MapPin, RefreshCw, WifiOff } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminButton, AdminCard, AdminCardContent } from "@/shared/ui/admin/AdminLayout";
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
  const [items, setItems] = useState<TechnicianTask[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const selected = items.find(item => item.item_id === selectedId) || null;
  const openTasks = useMemo(() => items.filter(item => item.status === "pending" || item.status === "in_progress"), [items]);

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
      setSelectedId(current => current && list.some(item => item.item_id === current) ? current : null);
    } catch (error) {
      setNotice({ kind: "error", text: systemErrorMessage(error, "Não foi possível carregar seus serviços.") });
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId]);

  useEffect(() => {
    setItems([]);
    setSelectedId(null);
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
      const attachments = await listMyTechnicianPhotos(selected.item_id);
      const previews = await Promise.all(attachments.map(async attachment => ({
        id: attachment.id,
        url: await getTechnicianPhotoSignedUrl(attachment.path),
      })));
      setPhotos(previews);
      setNotice({ kind: "success", text: "Fotos anexadas ao serviço." });
    } catch (error) {
      setNotice({ kind: "error", text: systemErrorMessage(error, "Não foi possível anexar todas as fotos.") });
    } finally {
      setUploading(false);
    }
  };

  return <div className="mx-auto max-w-6xl space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-black text-foreground sm:text-2xl">Painel do Técnico</h1>
        <p className="mt-1 text-sm text-muted-foreground">Seus serviços atribuídos, execução e registros técnicos.</p>
      </div>
      <div className="flex items-center gap-2">
        {!online && <span className="flex items-center gap-1 border border-amber-500/30 px-2 py-1 text-xs text-amber-700">
          <WifiOff size={13} /> Sem internet
        </span>}
        <AdminButton variant="secondary" onClick={() => void refresh(true)} disabled={busy || uploading || loading}>
          <RefreshCw size={15} /> Atualizar
        </AdminButton>
      </div>
    </div>

    {notice && <div role="status" className={`border px-3 py-2 text-sm ${notice.kind === "error"
      ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>{notice.text}</div>}

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

    <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
      <AdminCard>
        <AdminCardContent className="p-3 sm:p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-black"><ClipboardList size={17} /> Serviços atribuídos ({items.length})</h2>
          {loading ? <p className="py-8 text-center text-sm text-muted-foreground">Carregando serviços...</p>
            : !items.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum serviço atribuído a você nesta empresa.</p>
              : <div className="max-h-[65vh] space-y-2 overflow-y-auto">
                {[...openTasks, ...items.filter(item => item.status === "completed" || item.status === "cancelled")].map(item => (
                  <button key={item.item_id} type="button"
                    onClick={() => { setSelectedId(item.item_id); setNotice(null); }}
                    className={`w-full border p-3 text-left transition-colors hover:border-primary/50 ${selectedId === item.item_id ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-black text-foreground">OS {item.os_number}</span>
                      <span className={`shrink-0 border px-1.5 py-0.5 text-[10px] font-bold ${STATUS_CLASS[item.status]}`}>{STATUS_LABEL[item.status]}</span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-foreground">{item.title}</p>
                    {item.customer_name && <p className="mt-1 truncate text-xs text-muted-foreground">{item.customer_name}</p>}
                  </button>
                ))}
              </div>}
        </AdminCardContent>
      </AdminCard>

      <AdminCard>
        <AdminCardContent className="space-y-4 p-4 sm:p-5">
          {!selected ? <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <ClipboardList size={30} />
            <p className="text-sm">Selecione um serviço para ver os dados permitidos da OS e registrar a execução.</p>
          </div> : <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">OS {selected.os_number}</p>
                <h2 className="mt-1 text-lg font-black text-foreground">{selected.title}</h2>
              </div>
              <span className={`border px-2.5 py-1 text-xs font-bold ${STATUS_CLASS[selected.status]}`}>{STATUS_LABEL[selected.status]}</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {selected.customer_name && <div><p className="text-xs text-muted-foreground">Cliente</p><strong className="text-sm">{selected.customer_name}</strong></div>}
              {selected.customer_contact && <div><p className="text-xs text-muted-foreground">Contato</p><strong className="text-sm">{selected.customer_contact}</strong></div>}
              {selected.equipment && <div><p className="text-xs text-muted-foreground">Equipamento</p><strong className="text-sm">{selected.equipment}</strong></div>}
              {selected.scheduled_at && <div><p className="text-xs text-muted-foreground">Agendamento</p><strong className="text-sm">{formatDate(selected.scheduled_at)}</strong></div>}
            </div>
            {selected.description && <div className="border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground">Descrição do serviço</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{selected.description}</p>
            </div>}
            {selected.diagnosis && <div className="border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground">Diagnóstico</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{selected.diagnosis}</p>
            </div>}

            {canSeeLocation && <div className="space-y-3 border-t border-border pt-3">
              <LocationRecord value={selected.start_location} label="Local de início" />
              <LocationRecord value={selected.finish_location} label="Local de conclusão" />
            </div>}

            {selected.status === "pending" && canStart && <div className="space-y-2 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">Para iniciar, permita a localização precisa no navegador. O ponto e o horário serão registrados na OS.</p>
              <AdminButton disabled={busy || !online} loading={busy} onClick={() => void runWithGps("start")}>
                <MapPin size={15} /> Iniciar serviço
              </AdminButton>
            </div>}

            {selected.status === "in_progress" && <div className="space-y-4 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">Iniciado em {formatDate(selected.started_at)}</p>
              {canComplete && <div>
                <label htmlFor="technician-report" className="mb-1.5 block text-xs font-bold text-foreground">O que foi realizado? *</label>
                <textarea id="technician-report" value={report} onChange={event => setReport(event.target.value)}
                  rows={5} maxLength={10000} placeholder="Descreva detalhadamente o serviço executado..."
                  className="w-full resize-y border border-border bg-card p-3 text-sm text-foreground outline-none focus:border-primary" />
              </div>}
              {canSendPhotos && <div className="space-y-2">
                <label htmlFor="technician-photos" className={`inline-flex cursor-pointer items-center gap-2 border border-border bg-card px-3 py-2 text-xs font-bold ${uploading ? "pointer-events-none opacity-50" : ""}`}>
                  <Camera size={15} /> {uploading ? "Enviando fotos..." : "Adicionar fotos"}
                </label>
                <input id="technician-photos" className="sr-only" type="file"
                  accept="image/jpeg,image/png,image/webp" multiple disabled={uploading || !online}
                  onChange={event => void onUpload(event)} />
                <p className="text-[11px] text-muted-foreground">JPG, PNG ou WEBP. Até 5 MB por foto. Arquivos privados.</p>
              </div>}
              {canComplete && <AdminButton disabled={busy || !online || report.trim().length < 10} loading={busy}
                onClick={() => void runWithGps("finish")}>
                <CheckCircle2 size={15} /> Finalizar serviço
              </AdminButton>}
            </div>}

            {selected.status === "completed" && <div className="space-y-2 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">Finalizado em {formatDate(selected.completed_at)}</p>
              {selected.execution_report && <><p className="text-xs font-bold text-foreground">Serviço realizado</p>
                <p className="whitespace-pre-wrap text-sm">{selected.execution_report}</p></>}
            </div>}
            {selected.status === "cancelled" && <p className="border-t border-border pt-3 text-sm text-muted-foreground">
              Este serviço foi cancelado. Consulte o responsável pela OS.
            </p>}
            {canSeePhotos && <div className="border-t border-border pt-4">
              <h3 className="mb-2 text-xs font-black">Fotos da execução</h3>
              {photoLoading ? <p className="text-xs text-muted-foreground">Carregando imagens...</p> :
                photos.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {photos.map(photo => <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" title="Abrir foto">
                    <img src={photo.url} alt="Foto da execução técnica" loading="lazy" className="aspect-square w-full border border-border object-cover" />
                  </a>)}
                </div> : <p className="text-xs text-muted-foreground">Nenhuma foto enviada.</p>}
            </div>}
          </>}
        </AdminCardContent>
      </AdminCard>
    </div>
    <p className="text-xs text-muted-foreground">
      O trabalho offline, com armazenamento local e sincronização automática, será habilitado na etapa seguinte.
      No momento, é necessária conexão para registrar ações e enviar fotos.
    </p>
  </div>;
}
