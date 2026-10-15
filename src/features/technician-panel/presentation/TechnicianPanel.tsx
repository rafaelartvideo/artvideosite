import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useLocation, useMatch, useNavigate } from "react-router";
import { Check, History, Pencil, Play, WifiOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { useAuth } from "@/lib/auth";
import { AdminButton, AdminCard, AdminCardContent, AdminDialog, AdminPage, AdminStickyToolbar, BtnPrimary, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { formatCpf, formatCnpj, formatPhone } from "@/shared/domain/formatters";
import { OrderDetailSectionTabs, type OrderDetailTab } from "@/features/orders/presentation/OrderDetailSectionTabs";
import { TechnicianOrdersTable } from "./TechnicianOrdersTable";
import { isTechnicianOrderCompleted } from "../domain/technician-order-progress";
import { TechnicianOrderItemsSection } from "./TechnicianOrderItemsSection";
import { OrderHistoryPage } from "@/features/orders/presentation/OrderHistoryPage";
import { OrderImageLightbox, OrderImageThumb, type OrderImage } from "@/features/orders/presentation/OrderImages";
import { useTechnicianOrderRecords } from "../application/useTechnicianOrderRecords";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  captureTechnicianLocation, finishMyTechnicianTask, getMyTechnicianOrderDetails, getTechnicianPhotoSignedUrl,
  countMyTechnicianPhotos, listMyTechnicianPhotos, loadMyTechnicianTasks, startMyTechnicianTask, getMyTechnicianEquipmentPhotoUrl,
  updateMyTechnicianOrderDiagnosis, uploadTechnicianPhoto, type TechnicianOrderDetails, type TechnicianTask, type TechnicianTaskStatus,
 } from "../infrastructure/technician-tasks.repository";

type Notice = { kind: "success" | "error"; text: string };
type PhotoPreview = { id: string; url: string };
type ServicePhotoCache = { count: number; photos: PhotoPreview[] };

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
  const activeOrderIdRef = useRef(routeOrderId);
  activeOrderIdRef.current = routeOrderId;
  const routeServiceId = new URLSearchParams(search).get("service");
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<TechnicianTask[]>([]);
  const [orderDetails, setOrderDetails] = useState<TechnicianOrderDetails | null>(null);
  const [orderDetailsLoading, setOrderDetailsLoading] = useState(false);
  const [detailsRevision, setDetailsRevision] = useState(0);
  const [detailTab, setDetailTab] = useState<OrderDetailTab>("details");
  const [equipmentPhotoUrls, setEquipmentPhotoUrls] = useState<Record<string, string>>({});
  const [viewEquipmentImage, setViewEquipmentImage] = useState<OrderImage | null>(null);

  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const writtenHistory = useTechnicianOrderRecords(routeOrderId, historyDialogOpen);
  const [diagnosisDialogOpen, setDiagnosisDialogOpen] = useState(false);
  const [diagnosisDraft, setDiagnosisDraft] = useState("");
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Galerias consultadas uma vez por serviço; a seleção não desmonta a OS.
  const [photoCache, setPhotoCache] = useState<Record<string, ServicePhotoCache>>({});
  const [orderLoadError, setOrderLoadError] = useState<string | null>(null);
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
  const completedOrderCount = useMemo(() => assignedOrders.filter(isTechnicianOrderCompleted).length, [assignedOrders]);
  const openOrderCount = assignedOrders.length - completedOrderCount;
  const orderServices = useMemo(() => routeOrderId
    ? items.filter(item => item.service_order_id === routeOrderId) : [], [items, routeOrderId]);
  const selected = orderServices.find(item => item.item_id === routeServiceId) || orderServices[0] || null;
  const selectedId = selected?.item_id || null;
  const servicePhotos = selectedId ? photoCache[selectedId] : undefined;
  const photos = servicePhotos?.photos || [];
  const photoCount = servicePhotos?.count || 0;
  const photoLoading = Boolean(selectedId && (canSeePhotos || canSendPhotos) && !servicePhotos);
  const openService = (item: TechnicianTask) => {
    if (item.item_id === selectedId && item.service_order_id === routeOrderId) return;
    navigate("/admin/technician-panel/os/" + encodeURIComponent(item.service_order_id) + "?service=" + encodeURIComponent(item.item_id));
  };

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

  // Eventos em tempo real são a fonte primária. Não consultar a situação
  // a cada minuto enquanto o canal estiver conectado.
  useEffect(() => {
    if (!activeOrganizationId) return;
    let connected = false;
    let subscribedBefore = false;
    let wasHidden = document.visibilityState === "hidden";
    const reconcile = () => {
      if (document.visibilityState === "hidden" || !navigator.onLine) return;
      void refresh();
      if (activeOrderIdRef.current) setDetailsRevision(current => current + 1);
    };
    const visibilityChanged = () => {
      if (document.visibilityState === "hidden") { wasHidden = true; return; }
      if (wasHidden) { wasHidden = false; reconcile(); }
    };
    const channel = supabase.channel("technician-panel-tasks:" + activeOrganizationId)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "service_order_item_tasks",
        filter: "organization_id=eq." + activeOrganizationId,
      }, payload => {
        if (document.visibilityState === "hidden") { wasHidden = true; return; }
        void refresh();
        const eventOrderId = (payload.new as { service_order_id?: string } | null)?.service_order_id
          || (payload.old as { service_order_id?: string } | null)?.service_order_id;
        if (eventOrderId && eventOrderId === activeOrderIdRef.current) {
          setDetailsRevision(current => current + 1);
        }
      })
      .subscribe(status => {
        const wasConnected = connected;
        connected = status === "SUBSCRIBED";
        if (connected && subscribedBefore && !wasConnected) reconcile();
        if (connected) subscribedBefore = true;
      });
    document.addEventListener("visibilitychange", visibilityChanged);
    // Apenas reconciliação de contingência quando o Realtime estiver indisponível.
    const fallback = window.setInterval(() => { if (!connected) reconcile(); }, 120000);
    return () => {
      window.clearInterval(fallback);
      document.removeEventListener("visibilitychange", visibilityChanged);
      void supabase.removeChannel(channel);
    };
  }, [activeOrganizationId, refresh]);

  useEffect(() => {
    const handleOnline = () => { setOnline(true); void refresh(); if (activeOrderIdRef.current) setDetailsRevision(current => current + 1); };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refresh]);

  useEffect(() => {
    setReport(selected?.execution_report || "");
  }, [selectedId, selected?.execution_report]);

  useEffect(() => {
    if (!selectedId || !(canSeePhotos || canSendPhotos) || photoCache[selectedId]) return;
    let cancelled = false;
    void (async () => {
      try {
        const count = await countMyTechnicianPhotos(selectedId);
        const previews = canSeePhotos
          ? await (async () => {
              const attachments = await listMyTechnicianPhotos(selectedId);
              return Promise.all(attachments.map(async attachment => ({
                id: attachment.id,
                url: await getTechnicianPhotoSignedUrl(attachment.path),
              })));
            })()
          : [];
        if (!cancelled) setPhotoCache(current => ({
          ...current, [selectedId]: { count, photos: previews },
        }));
      } catch (error) {
        if (!cancelled) {
          setPhotoCache(current => ({ ...current, [selectedId]: { count: 0, photos: [] } }));
          setNotice({ kind: "error", text: systemErrorMessage(error, "Não foi possível carregar as fotos.") });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId, canSeePhotos, canSendPhotos, photoCache]);

  // Leitura da OS inteira somente pela RPC de campos autorizados. A listagem
  // de serviços não substitui a verificação da atribuição no servidor.
  useEffect(() => {
    setOrderDetails(null);
    setEquipmentPhotoUrls({});
    setPhotoCache({});
    setOrderLoadError(null);
    setDiagnosisDialogOpen(false);
  }, [activeOrganizationId, routeOrderId]);

  useEffect(() => {
    let cancelled = false;
    if (!activeOrganizationId || !routeOrderId) {
      setOrderDetailsLoading(false);
      return () => { cancelled = true; };
    }
    setOrderDetailsLoading(true);
    void (async () => {
      try {
        const data = await getMyTechnicianOrderDetails(routeOrderId);
        // Resolve as mídias autorizadas antes de mostrar a OS; nada aparece incompleto.
        const signed = await Promise.allSettled((data.equipment_photos || []).map(async media => ({
          path: media.path, url: await getMyTechnicianEquipmentPhotoUrl(media.path),
        })));
        if (!cancelled) {
          setEquipmentPhotoUrls(Object.fromEntries(signed
            .filter((item): item is PromiseFulfilledResult<{ path: string; url: string }> => item.status === "fulfilled")
            .map(item => [item.value.path, item.value.url])));
          setOrderDetails(data);
          setOrderLoadError(null);
        }
      } catch (error) {
        if (!cancelled) {
          const message = systemErrorMessage(error, "Não foi possível consultar a OS.");
          setOrderLoadError(message);
          setNotice({ kind: "error", text: message });
        }
      } finally {
        if (!cancelled) setOrderDetailsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeOrganizationId, routeOrderId, detailsRevision]);

  useEffect(() => {
    setHistoryDialogOpen(false);
    setDetailTab("details");
  }, [routeOrderId]);

  const reloadCurrentOrder = () => {
    setDetailsRevision(current => current + 1);
    void refresh();
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
      // Atualiza apenas o cache do serviço enviado, sem reabrir a página.
      const serviceId = selected.item_id;
      const previews = canSeePhotos
        ? await (async () => {
            const attachments = await listMyTechnicianPhotos(serviceId);
            return Promise.all(attachments.map(async attachment => ({
              id: attachment.id,
              url: await getTechnicianPhotoSignedUrl(attachment.path),
            })));
          })()
        : (photoCache[serviceId]?.photos || []);
      const nextCount = await countMyTechnicianPhotos(serviceId);
      setPhotoCache(current => ({ ...current, [serviceId]: { count: nextCount, photos: previews } }));
      setNotice({ kind: "success", text: "Fotos anexadas ao serviço." });
    } catch (error) {
      setNotice({ kind: "error", text: systemErrorMessage(error, "Não foi possível anexar todas as fotos.") });
    } finally {
      setUploading(false);
    }
  };

  const address = orderDetails?.customer_address || selected?.service_address;
  const info = (label: string, value: string | number | null | undefined) =>
    value ? <div className="min-w-0">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-semibold text-foreground">{value}</p>
    </div> : null;

  const pendingServices = orderServices.filter(service => service.status === "pending").length;
  const ongoingServices = orderServices.filter(service => service.status === "in_progress").length;
  const completedServices = orderServices.filter(service => service.status === "completed").length;

  const renderEquipmentPhotos = (kind: "equipment" | "label") => {
    const files = (orderDetails?.equipment_photos || []).filter(image => image.kind === kind);
    if (!files.length) return <p className="text-xs text-muted-foreground">
      {kind === "label" ? "Nenhuma foto da etiqueta cadastrada." : "Nenhuma foto do equipamento cadastrada."}
    </p>;
    return <div className="flex flex-wrap gap-3">
      {files.map(image => {
        const view = { key: image.id, name: image.name || "Imagem do equipamento", kind, url: equipmentPhotoUrls[image.path] };
        return <OrderImageThumb key={image.id} image={view}
          onView={() => { if (view.url) setViewEquipmentImage(view); }} />;
      })}
    </div>;
  };

  return <div className="mx-auto max-w-6xl space-y-4">
    {!routeOrderId && <PageHeader title="Painel do Técnico"
      subtitle="Ordens de serviço e atividades atribuídas a você."
      actions={!online ? <span className="inline-flex items-center gap-2 text-xs font-semibold text-amber-700"><WifiOff size={16} /> Sem internet</span> : undefined} />}

    {!routeOrderId ? <>
      <div className="space-y-3">
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Ordens de serviço</h2>
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            {([
              { name: "OS abertas", count: openOrderCount,
                tone: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300" },
              { name: "OS concluídas", count: completedOrderCount,
                tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
            ]).map(card => <AdminCard key={card.name}>
              <AdminCardContent className={"flex h-[104px] flex-col items-center justify-center border p-2 text-center sm:h-auto sm:min-h-[104px] sm:p-4 " + card.tone}>
                <p className="whitespace-nowrap text-[11px] font-semibold leading-tight sm:text-xs">{card.name}</p>
                <p className="mt-1 text-2xl font-black tabular-nums sm:text-3xl">{card.count}</p>
              </AdminCardContent>
            </AdminCard>)}
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Serviços atribuídos</h2>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {([
              { name: "Pendentes", count: items.filter(item => item.status === "pending").length,
                tone: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300" },
              { name: "Andamento", count: items.filter(item => item.status === "in_progress").length,
                tone: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300" },
              { name: "Concluídos", count: items.filter(item => item.status === "completed").length,
                tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
            ]).map(card => <AdminCard key={card.name}>
              <AdminCardContent className={"flex h-[104px] flex-col items-center justify-center border p-2 text-center sm:h-auto sm:min-h-[104px] sm:p-4 " + card.tone}>
                <p className="whitespace-nowrap text-[11px] font-semibold leading-tight sm:text-xs">{card.name}</p>
                <p className="mt-1 text-2xl font-black tabular-nums sm:text-3xl">{card.count}</p>
              </AdminCardContent>
            </AdminCard>)}
          </div>
        </div>
      </div>
      <TechnicianOrdersTable orders={assignedOrders} loading={loading} onOpen={openService} />
    </> : orderLoadError && !orderDetails && !orderDetailsLoading && !loading
      ? <div className="mx-auto max-w-4xl space-y-4 px-4 py-8 text-center">
          <p className="text-sm text-destructive">{orderLoadError}</p>
          <BtnSecondary onClick={() => navigate("/admin/technician-panel")}>Voltar</BtnSecondary>
        </div>
      : loading || (selected && (!orderDetails || orderDetails.id !== routeOrderId))
      ? <div aria-label="Carregando dados da OS" className="flex min-h-[50dvh] items-center justify-center">
          <LoadingState />
        </div>
      : <AdminPage open={!historyDialogOpen} smoothMotion={false}
      onClose={() => navigate("/admin/technician-panel")}
      breadcrumb="Painel do Técnico"
      title={String(selected?.os_number || "OS")} titleVariant="order-number"
      maxW="max-w-[1440px]">
      <div className="space-y-5 p-4 sm:p-5">
      {!selected ? <>
      <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
        {loading ? "Verificando serviços atribuídos..." : "Esta OS não possui serviços atribuídos a você nesta empresa."}
      </div>
      <AdminStickyToolbar>
        <BtnSecondary onClick={() => navigate("/admin/technician-panel")}>Voltar</BtnSecondary>
      </AdminStickyToolbar>
    </> : <>
      <div className="flex min-h-10 min-w-0 flex-wrap items-center justify-center gap-3 sm:gap-4">
        <span className="text-xl font-black tabular-nums text-foreground sm:text-2xl">OS {selected.os_number}</span>
        {hasPermission("technician_panel.data.history") && <div className="flex items-center border-l border-border pl-3 sm:pl-4">
          <AdminButton variant="secondary" size="sm"
            className="!h-8 !gap-1.5 !px-2.5 !text-xs" disabled={busy || orderDetailsLoading}
            onClick={() => setHistoryDialogOpen(true)}><History size={14} /> Histórico</AdminButton>
        </div>}
      </div>
      <OrderDetailSectionTabs value={detailTab} onChange={setDetailTab}
        itemBadge={pendingServices > 0
          ? { label: pendingServices + " pendente" + (pendingServices > 1 ? "s" : ""), style: STATUS_CLASS.pending }
          : ongoingServices > 0
            ? { label: ongoingServices + " em andamento", style: STATUS_CLASS.in_progress }
            : completedServices > 0
              ? { label: completedServices + " concluído" + (completedServices > 1 ? "s" : ""), style: STATUS_CLASS.completed }
              : null} />

      {detailTab === "details" ? <>
        <Section title="Cliente">
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {info("Nome", selected.customer_name)}
            {info(orderDetails?.customer_type === "PJ" ? "CNPJ" : "CPF",
              orderDetails?.customer_document
                ? orderDetails.customer_type === "PJ" ? formatCnpj(orderDetails.customer_document) : formatCpf(orderDetails.customer_document)
                : null)}
            {info("Contato", selected.customer_contact ? formatPhone(selected.customer_contact) : null)}
          </div>
        </Section>
        {address && <Section title="Endereço">
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {info("CEP", address.zip_code)}
            {info("Rua", address.street)}
            {info("Número", address.number)}
            {info("Complemento", address.complement)}
            {info("Bairro", address.neighborhood)}
            {info("Cidade", address.city)}
            {info("Estado", address.state)}
          </div>
        </Section>}
        <Section title="Equipamento">
          <div className="grid min-w-0 gap-5 lg:grid-cols-2">
            <div className="grid min-w-0 content-start gap-4 sm:grid-cols-2">
              {info("Equipamento", selected.equipment)}
              {info("Marca", orderDetails?.equipment_brand)}
              {info("Modelo", orderDetails?.equipment_model || selected.equipment_model)}
              {info("Número de série", selected.serial_number)}
              {info("Acessórios", orderDetails?.equipment_accessories)}
              {info("Condição do equipamento", orderDetails?.equipment_condition)}
              {info("Agendamento", selected.scheduled_at ? formatDate(selected.scheduled_at) : null)}
              {orderDetails?.technical_values?.map(value => <div key={value.id} className="min-w-0">
                {info(value.label, value.value)}
              </div>)}
            </div>
            <div className="min-w-0 space-y-4 border-t border-border/70 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
              <div>
                <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Foto da etiqueta</p>
                {renderEquipmentPhotos("label")}
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Fotos do equipamento</p>
                {renderEquipmentPhotos("equipment")}
              </div>
            </div>
          </div>
        </Section>
        {hasPermission("technician_panel.data.problem") && <Section title="Descrição do problema">
          <p className="whitespace-pre-wrap break-words text-sm text-foreground">{selected.problem || "Ainda não informado."}</p>
        </Section>}
        {hasPermission("technician_panel.data.internal_notes") && <Section title="Observações internas">
          <p className="whitespace-pre-wrap break-words text-sm text-foreground">{orderDetails?.internal_notes || "Ainda não informado."}</p>
        </Section>}
        {hasPermission("technician_panel.data.diagnosis") && orderDetails && <Section title="Diagnóstico"
          actions={orderDetails.can_edit_diagnosis && !orderDetails.closed && !orderDetails.solved
            ? <BtnSecondary onClick={() => { setDiagnosisDraft(orderDetails.diagnosis || ""); setDiagnosisDialogOpen(true); }}><Pencil size={16} className="shrink-0" aria-hidden="true" /><span>Editar</span></BtnSecondary>
            : undefined}>
          <p className="whitespace-pre-wrap break-words text-sm text-foreground">{orderDetails.diagnosis || "Ainda não informado."}</p>
        </Section>}
      </> : <>
      <Section title={<span className="flex flex-wrap items-center gap-2">
        Serviços atribuídos
        <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] font-bold text-foreground">{orderServices.length}</span>
        {pendingServices > 0 && <span className={STATUS_CLASS.pending + " rounded-md border px-2 py-0.5 text-[10px] font-bold"}>{pendingServices} pendente{pendingServices > 1 ? "s" : ""}</span>}
        {ongoingServices > 0 && <span className={STATUS_CLASS.in_progress + " rounded-md border px-2 py-0.5 text-[10px] font-bold"}>{ongoingServices} em andamento</span>}
        {!pendingServices && !ongoingServices && completedServices > 0 &&
          <span className={STATUS_CLASS.completed + " rounded-md border px-2 py-0.5 text-[10px] font-bold"}>{completedServices} concluído{completedServices > 1 ? "s" : ""}</span>}
      </span>}
        actions={hasPermission("technician_panel.data.order_items") && hasPermission("technician_panel.actions.add_service") && orderDetails && !orderDetails.closed && !orderDetails.solved && online
          ? <TechnicianOrderItemsSection mode="services"
              orderId={routeOrderId} items={orderDetails.items}
              canAddService={true}
              canAddProduct={false} canRemoveProduct={false}
              blocked={false}
              onChanged={reloadCurrentOrder}
              onFeedback={(text, kind) => setNotice({ text, kind })}
            />
          : undefined}>
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {orderServices.map(service => <button key={service.item_id} type="button"
              onClick={() => openService(service)} aria-pressed={service.item_id === selectedId}
              className={"flex min-w-0 cursor-pointer flex-col gap-2 rounded-lg border p-3 text-left transition-colors hover:border-primary/60 " +
                (service.item_id === selectedId ? "border-primary bg-primary/5" : "border-border bg-card")}>
              <span className="break-words text-sm font-bold text-foreground">{service.title}</span>
              <span className={"self-start rounded-md border px-2 py-1 text-[10px] font-bold " + STATUS_CLASS[service.status]}>{STATUS_LABEL[service.status]}</span>
            </button>)}
          </div>
        </div>
      </Section>

      <Section title="Execução do serviço">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-foreground">{selected.title}</h3>
              <span className={"rounded-md border px-2.5 py-1 text-xs font-bold " + STATUS_CLASS[selected.status]}>{STATUS_LABEL[selected.status]}</span>
            </div>
            {selected.description && <div>
              <p className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">Descrição do serviço</p>
              <p className="whitespace-pre-wrap break-words text-sm">{selected.description}</p>
            </div>}
            {selected.status === "pending" && canStart && <p className="text-xs text-muted-foreground">
              Ao iniciar, autorize a localização do dispositivo. O horário e o local serão registrados na OS.
            </p>}
            {selected.started_at && info("Iniciado em", formatDate(selected.started_at))}
            {selected.status === "in_progress" && canComplete && <FTextarea
              id="technician-report" label="O que foi realizado? *"
              value={report} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setReport(event.target.value)}
              rows={5} maxLength={10000} placeholder="Descreva o serviço executado..."
            />}
            {selected.status === "completed" && <>
              {info("Finalizado em", formatDate(selected.completed_at))}
              {selected.execution_report && <div>
                <p className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">Serviço realizado</p>
                <p className="whitespace-pre-wrap break-words text-sm">{selected.execution_report}</p>
              </div>}
            </>}
            {selected.status === "cancelled" && <p className="text-sm text-muted-foreground">Serviço cancelado. Consulte o responsável pela OS.</p>}
          </div>

      </Section>

          {(canSendPhotos || canSeePhotos) && <Section title={<span className="inline-flex items-center gap-2">
            Imagens do serviço
            <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground">{photoLoading ? "…" : photoCount}/3</span>
          </span>}>
            {selected.status === "in_progress" && canSendPhotos && <div className="mb-3 flex flex-wrap gap-2">
              <BtnSecondary onClick={() => cameraInputRef.current?.click()}
                disabled={!online || busy || uploading || photoCount >= 3} loading={uploading}>Abrir câmera</BtnSecondary>
              <BtnSecondary onClick={() => galleryInputRef.current?.click()}
                disabled={!online || busy || uploading || photoCount >= 3} loading={uploading}>Selecionar imagem</BtnSecondary>
            </div>}
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="sr-only"
              aria-label="Capturar foto com a câmera" disabled={!online || uploading || busy || photoCount >= 3}
              onChange={event => void onUpload(event)} />
            <input ref={galleryInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              multiple className="sr-only" aria-label="Selecionar imagens do dispositivo"
              disabled={!online || uploading || busy || photoCount >= 3} onChange={event => void onUpload(event)} />
            {canSeePhotos && (photoLoading ? <LoadingState />
              : photos.length ? <div className="flex flex-wrap gap-3">
                {photos.map(photo => {
                  const image: OrderImage = { key: photo.id, name: "Foto da execução técnica", url: photo.url };
                  return <OrderImageThumb key={photo.id} image={image}
                    onView={() => setViewEquipmentImage(image)} />;
                })}
              </div> : <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma foto enviada.</p>)}
          </Section>}

          {hasPermission("technician_panel.data.order_items") && orderDetails &&
            <TechnicianOrderItemsSection mode="products"
              orderId={routeOrderId} items={orderDetails.items}
              canAddService={hasPermission("technician_panel.actions.add_service")}
              canAddProduct={hasPermission("technician_panel.actions.add_product")}
              canRemoveProduct={hasPermission("technician_panel.actions.remove_product")}
              blocked={orderDetails.closed || orderDetails.solved || !online}
              onChanged={reloadCurrentOrder}
              onFeedback={(text, kind) => setNotice({ text, kind })}
            />}
      </>}

      <AdminStickyToolbar className="!flex-nowrap !gap-2 !px-2 sm:!gap-3 sm:!px-5">
        <BtnSecondary onClick={() => navigate("/admin/technician-panel")} disabled={busy || uploading}>Voltar</BtnSecondary>
        {detailTab === "products-services" && selected.status === "pending" && canStart &&
          <BtnPrimary className="max-sm:!h-10 max-sm:!w-[72px] max-sm:!min-w-[72px] max-sm:!shrink-0 max-sm:!px-0"
            disabled={busy || uploading || !online} loading={busy}
            onClick={() => void runWithGps("start")}>
            <Play size={18} className="sm:hidden" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Iniciar serviço</span>
          </BtnPrimary>}
        {detailTab === "products-services" && selected.status === "in_progress" && canComplete &&
          <BtnPrimary className="max-sm:!h-10 max-sm:!w-[72px] max-sm:!min-w-[72px] max-sm:!shrink-0 max-sm:!px-0"
            disabled={busy || uploading || !online || report.trim().length < 10} loading={busy}
            onClick={() => void runWithGps("finish")}>
            <Check size={18} className="sm:hidden" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Finalizar serviço</span>
          </BtnPrimary>}
      </AdminStickyToolbar>
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
      </div>
    </AdminPage>}
    <OrderHistoryPage
      open={historyDialogOpen && Boolean(routeOrderId && selected)}
      order={{ os_number: selected?.os_number }}
      history={writtenHistory}
      canCreate={hasPermission("technician_panel.actions.history.create")}
      formatDate={formatDate}
      breadcrumb="Painel do Técnico"
      onClose={() => { setHistoryDialogOpen(false); writtenHistory.resetPageState(); }}
    />
    {viewEquipmentImage && <OrderImageLightbox image={viewEquipmentImage}
      onClose={() => setViewEquipmentImage(null)} />}
  </div>;
}
