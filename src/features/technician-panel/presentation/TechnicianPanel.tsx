import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useLocation, useMatch, useNavigate } from "react-router";
import { WifiOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { useAuth } from "@/lib/auth";
import { AdminCard, AdminCardContent, AdminDialog, AdminStickyToolbar, BtnPrimary, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { AdminSelect, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { TechnicianOrdersTable } from "./TechnicianOrdersTable";
import { TechnicianOrderItemsSection } from "./TechnicianOrderItemsSection";
import { TechnicianOrderHistoryDialog } from "./TechnicianOrderHistoryDialog";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  captureTechnicianLocation, changeMyTechnicianOrderSituation, finishMyTechnicianTask, getMyTechnicianOrderDetails, getTechnicianPhotoSignedUrl,
  countMyTechnicianPhotos, listMyTechnicianPhotos, loadMyTechnicianTasks, startMyTechnicianTask,
  updateMyTechnicianOrderDiagnosis, updateMyTechnicianOrderNote, uploadTechnicianPhoto, type TechnicianOrderDetails, type TechnicianTask, type TechnicianTaskStatus,
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
  const [orderDetails, setOrderDetails] = useState<TechnicianOrderDetails | null>(null);
  const [orderDetailsLoading, setOrderDetailsLoading] = useState(false);
  const [detailsRevision, setDetailsRevision] = useState(0);

  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [diagnosisDialogOpen, setDiagnosisDialogOpen] = useState(false);
  const [diagnosisDraft, setDiagnosisDraft] = useState("");
  const [noteField, setNoteField] = useState<"problem" | "internal_notes" | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const [photoCount, setPhotoCount] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  useEffect(() => { if (notice) notifyAdmin(notice.text, notice.kind); }, [notice]);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);

  const canStart = hasPermission("technician_panel.actions.start");
  const canComplete = hasPermission("technician_panel.actions.complete");
  const canSendPhotos = hasPermission("technician_panel.actions.photo");
  const canSeePhotos = hasPermission("technician_panel.data.photos");

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

  // Atualização pontual por evento, com reconciliação ao retornar à aba.
  // Não é necessário conceder acesso à tabela comercial de OS.
  useEffect(() => {
    if (!activeOrganizationId) return;
    const reconcile = () => {
      if (document.visibilityState !== "hidden" && navigator.onLine) {
        void refresh();
        if (routeOrderId) setDetailsRevision(current => current + 1);
      }
    };
    const channel = supabase.channel("technician-panel-tasks:" + activeOrganizationId)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "service_order_item_tasks",
        filter: "organization_id=eq." + activeOrganizationId,
      }, () => reconcile())
      .subscribe(status => { if (status === "SUBSCRIBED") reconcile(); });
    document.addEventListener("visibilitychange", reconcile);
    const fallback = window.setInterval(reconcile, 60000);
    return () => {
      window.clearInterval(fallback);
      document.removeEventListener("visibilitychange", reconcile);
      void supabase.removeChannel(channel);
    };
  }, [activeOrganizationId, routeOrderId, refresh]);

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
    setPhotoCount(0);
    setReport(selected?.execution_report || "");
    if (!selectedId || !(canSeePhotos || canSendPhotos)) return;
    let cancelled = false;
    setPhotoLoading(true);
    void (async () => {
      try {
        const count = await countMyTechnicianPhotos(selectedId);
        if (!cancelled) setPhotoCount(count);
        if (canSeePhotos) {
          const attachments = await listMyTechnicianPhotos(selectedId);
          const previews = await Promise.all(attachments.map(async attachment => ({
            id: attachment.id,
            url: await getTechnicianPhotoSignedUrl(attachment.path),
          })));
          if (!cancelled) setPhotos(previews);
        }
      } catch (error) {
        if (!cancelled) setNotice({ kind: "error", text: systemErrorMessage(error, "Não foi possível carregar as fotos.") });
      } finally {
        if (!cancelled) setPhotoLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId, canSeePhotos, canSendPhotos, selected?.execution_report]);


  // Leitura da OS inteira somente pela RPC de campos autorizados. A listagem
  // de serviços não substitui a verificação da atribuição no servidor.
  useEffect(() => {
    let cancelled = false;
    setOrderDetails(null);
    setDiagnosisDialogOpen(false);
    setNoteField(null);
    if (!activeOrganizationId || !routeOrderId) {
      setOrderDetailsLoading(false);
      return () => { cancelled = true; };
    }
    setOrderDetailsLoading(true);
    void getMyTechnicianOrderDetails(routeOrderId)
      .then(data => { if (!cancelled) setOrderDetails(data); })
      .catch(error => { if (!cancelled) setNotice({
        kind: "error",
        text: systemErrorMessage(error, "Não foi possível consultar a OS."),
      }); })
      .finally(() => { if (!cancelled) setOrderDetailsLoading(false); });
    return () => { cancelled = true; };
  }, [activeOrganizationId, routeOrderId, detailsRevision]);

  useEffect(() => { setHistoryDialogOpen(false); }, [routeOrderId]);

  const reloadCurrentOrder = () => {
    setDetailsRevision(current => current + 1);
    void refresh();
  };

  const onSituationChange = async (nextId: string) => {
    if (!routeOrderId || !orderDetails?.can_change_situation || busy ||
        !orderDetails.available_situations.some(situation => situation.id === nextId)) return;
    setBusy(true);
    setNotice(null);
    try {
      await changeMyTechnicianOrderSituation(routeOrderId, nextId);
      setDetailsRevision(current => current + 1);
      await refresh();
      setNotice({ kind: "success", text: "Situação da OS atualizada." });
    } catch (error) {
      setNotice({ kind: "error", text: systemErrorMessage(error, "Não foi possível alterar a situação.") });
    } finally { setBusy(false); }
  };

  const saveDiagnosis = async () => {
    if (!routeOrderId || !orderDetails?.can_edit_diagnosis || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await updateMyTechnicianOrderDiagnosis(routeOrderId, diagnosisDraft);
      setDiagnosisDialogOpen(false);
      setDetailsRevision(current => current + 1);
      await refresh();
      setNotice({ kind: "success", text: "Diagnóstico atualizado na OS." });
    } catch (error) {
      setNotice({ kind: "error", text: systemErrorMessage(error, "Não foi possível editar o diagnóstico.") });
    } finally { setBusy(false); }
  };

  const openNoteEditor = (field: "problem" | "internal_notes", value: string | null) => {
    setNoteField(field);
    setNoteDraft(value || "");
  };

  const saveOrderNote = async () => {
    if (!routeOrderId || !noteField || busy || noteDraft.length > 10000) return;
    const requiredPermission = noteField === "problem"
      ? "technician_panel.actions.edit_problem"
      : "technician_panel.actions.edit_internal_notes";
    if (!hasPermission(requiredPermission)) return;
    setBusy(true);
    setNotice(null);
    try {
      await updateMyTechnicianOrderNote(routeOrderId, noteField, noteDraft);
      setNoteField(null);
      reloadCurrentOrder();
      setNotice({ kind: "success", text: "Informação atualizada na OS." });
    } catch (error) {
      setNotice({ kind: "error", text: systemErrorMessage(error, "Não foi possível atualizar a OS.") });
    } finally {
      setBusy(false);
    }
  };

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
      const currentCount = await countMyTechnicianPhotos(selected.item_id);
      if (currentCount + selectedFiles.length > 3) {
        throw new Error("Limite de 3 imagens por serviço. Você pode enviar apenas mais " +
          Math.max(0, 3 - currentCount) + ".");
      }
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
      setPhotoCount(await countMyTechnicianPhotos(selected.item_id));
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
      <OrderDetailSectionTabs value={detailTab} onChange={setDetailTab} itemBadge={orderDetails?.items?.length ? { label: orderDetails.items.length + " itens", style: "border-border bg-muted text-muted-foreground" } : null} />
      {orderDetailsLoading && <p className="text-xs text-muted-foreground">Carregando detalhes autorizados da OS...</p>}
      {detailTab === "details" ? <>
      {orderDetails?.situation_name && <Section title="Situação da OS">
        <p className="text-sm font-semibold text-foreground">{orderDetails.situation_name}</p>
      </Section>}
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

      {hasPermission("technician_panel.data.problem") && <Section title="Descrição do problema"
        actions={hasPermission("technician_panel.actions.edit_problem") && orderDetails && !orderDetails.closed && !orderDetails.solved
          ? <BtnSecondary onClick={() => openNoteEditor("problem", selected.problem)}>Editar</BtnSecondary>
          : undefined}>
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">{selected.problem || "Ainda não informado."}</p>
      </Section>}
      {hasPermission("technician_panel.data.diagnosis") && orderDetails && <Section
        title="Diagnóstico"
        actions={orderDetails.can_edit_diagnosis && !orderDetails.closed && !orderDetails.solved
          ? <BtnSecondary onClick={() => { setDiagnosisDraft(orderDetails.diagnosis || ""); setDiagnosisDialogOpen(true); }}>Editar</BtnSecondary>
          : undefined}>
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">{orderDetails.diagnosis || "Ainda não informado."}</p>
      </Section>}
      {hasPermission("technician_panel.data.internal_notes") && orderDetails && <Section title="Observações internas"
        actions={hasPermission("technician_panel.actions.edit_internal_notes") && !orderDetails.closed && !orderDetails.solved
          ? <BtnSecondary onClick={() => openNoteEditor("internal_notes", orderDetails.internal_notes)}>Editar</BtnSecondary>
          : undefined}>
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">{orderDetails.internal_notes || "Ainda não informado."}</p>
      </Section>}
      </> : <>
      {hasPermission("technician_panel.data.order_items") && orderDetails && <TechnicianOrderItemsSection
        orderId={routeOrderId}
        items={orderDetails.items}
        canAddService={hasPermission("technician_panel.actions.add_service")}
        canAddProduct={hasPermission("technician_panel.actions.add_product")}
        canRemoveProduct={hasPermission("technician_panel.actions.remove_product")}
        blocked={orderDetails.closed || orderDetails.solved || !online}
        onChanged={reloadCurrentOrder}
        onFeedback={(text, kind) => setNotice({ text, kind })}
      />}
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
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="sr-only"
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
      </>}

      <AdminStickyToolbar className="flex-wrap">
        <BtnSecondary onClick={() => navigate("/admin/technician-panel")} disabled={busy || uploading}>Voltar</BtnSecondary>
        <BtnSecondary onClick={() => { void refresh(true); setDetailsRevision(current => current + 1); }} disabled={busy || uploading || loading}>Atualizar</BtnSecondary>
        {hasPermission("technician_panel.data.history") && <BtnSecondary
          disabled={busy || orderDetailsLoading} onClick={() => setHistoryDialogOpen(true)}>Histórico</BtnSecondary>}
        {detailTab === "details" && orderDetails?.can_change_situation && !orderDetails.closed && <div className="min-w-[180px] max-w-xs flex-1 sm:flex-none">
          <AdminSelect value={orderDetails.situation_id || ""}
            options={orderDetails.available_situations.map(situation => ({ value: situation.id, label: situation.name }))}
            onValueChange={value => { if (value) void onSituationChange(value); }}
            ariaLabel="Alterar situação da OS" disabled={busy || uploading || orderDetailsLoading}
            className="min-h-10 w-full min-w-0 text-xs font-bold" />
        </div>}
        {detailTab === "products-services" && selected.status === "pending" && canStart && <BtnPrimary
          disabled={busy || uploading || !online} loading={busy}
          onClick={() => void runWithGps("start")}>Iniciar serviço</BtnPrimary>}
        {detailTab === "products-services" && selected.status === "in_progress" && canComplete && <BtnPrimary
          disabled={busy || uploading || !online || report.trim().length < 10} loading={busy}
          onClick={() => void runWithGps("finish")}>Finalizar serviço</BtnPrimary>}
      </AdminStickyToolbar>
      <TechnicianOrderHistoryDialog open={historyDialogOpen}
        onClose={() => setHistoryDialogOpen(false)}
        orderId={routeOrderId} orderNumber={selected.os_number} />
      <AdminDialog open={Boolean(noteField)} onClose={() => { if (!busy) setNoteField(null); }}
        title={noteField === "problem" ? "Editar descrição do problema" : "Editar observações internas"}
        description={"OS " + selected.os_number}
        footer={<div className="flex justify-end gap-2">
          <BtnSecondary disabled={busy} onClick={() => setNoteField(null)}>Cancelar</BtnSecondary>
          <BtnPrimary disabled={busy || noteDraft.length > 10000} loading={busy}
            onClick={() => void saveOrderNote()}>Salvar</BtnPrimary>
        </div>}>
        <FTextarea label={noteField === "problem" ? "Descrição do problema" : "Observações internas"}
          value={noteDraft} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNoteDraft(event.target.value)}
          rows={7} maxLength={10000} placeholder="Descreva as informações da OS..." />
      </AdminDialog>
      <AdminDialog open={diagnosisDialogOpen} onClose={() => { if (!busy) setDiagnosisDialogOpen(false); }}
        title="Editar diagnóstico" description={"OS " + selected.os_number} footer={<div className="flex justify-end gap-2">
          <BtnSecondary onClick={() => setDiagnosisDialogOpen(false)} disabled={busy}>Cancelar</BtnSecondary>
          <BtnPrimary onClick={() => void saveDiagnosis()} disabled={busy || diagnosisDraft.length > 10000} loading={busy}>Salvar</BtnPrimary>
        </div>}>
        <FTextarea label="Diagnóstico da OS" value={diagnosisDraft}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDiagnosisDraft(event.target.value)}
          rows={7} maxLength={10000} placeholder="Descreva o diagnóstico do equipamento..." />
      </AdminDialog>
    </>}
  </div>;
}
