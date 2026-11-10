import { STATUS_TONE_CLASSES } from "@/shared/domain/status-tone";
import { NumberStepper, CatalogResults } from "./OrderCommercialControls";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getStoragePreviewUrl } from "@/infrastructure/query/storage-preview-cache";
import { CalendarDays, Camera, MapPin, Pencil, Pin, Plus, Search, Trash2, Wrench } from "lucide-react";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { InlineLoading, LoadingSpinner } from "@/shared/ui/admin/AdminFeedback";
import { OrderItemsSkeleton } from "./OrdersSkeletons";
import { supabase } from "@/lib/supabase";
import { AdminSectionEmpty,
  AdminButton,
  AdminDialog,
  AdminIconButton,
  AdminSegmentedControl,
  BtnPrimary,
  BtnSecondary,
  Section,
} from "@/shared/ui/admin/AdminLayout";
import {
  AdminSelect,
  FCurrencyInput,
  FInput,
  FTextarea,
  INPUT,
} from "@/shared/ui/admin/AdminFormControls";
import { cn } from "@/shared/domain/formatters";
import { OrderServiceScheduleDialog } from "./OrderServiceScheduleDialog";
import { EmployeeMultiSelect } from "./OrderFormControls";
import { OrderServiceScheduleDraftDialog, type ServiceScheduleDraft } from "./OrderServiceScheduleDraftDialog";
import { OrderServiceStatusBadge } from "./OrderServiceStatusBadge";
import { CompatibleProductCarousel } from "@/features/products/presentation/CompatibleProductCarousel";
import {
  addOrderCatalogItem,
  addOrderCustomService,
  deleteOrderCommercialItem,
  listOrderCommercialItems,
  searchOrderProducts,
  listOrderRelatedProducts,
  searchOrderServices,
  setOrderCommercialDiscount,
  setOrderCommercialItemPinned,
  updateOrderCustomServiceDetails,
  updateOrderCommercialItem,
  type OrderCatalogOption,
  type OrderCommercialItem,
  type OrderCommercialPricing,
} from "../infrastructure/order-commercial-items.repository";
import {
  listOrderServiceTasks, listOrderServiceTechnicians, setOrderServiceTaskTechnicians, setOrderServiceTaskSchedule, listOrderTaskPhotos, createOrderTaskPhotoUrl,
  type OrderServiceTask, type OrderServiceTechnician, type OrderTaskPhoto,
} from "../infrastructure/order-service-tasks.repository";

type ItemDraft = {
  quantity: string;
  unitPrice: string;
  additionalCost: string;
  description: string;
};

type Props = {
  order: any;
  canEdit: boolean;
  commercialLocked?: boolean;
  formatCurrency: (value: number) => string;
  onPricingChange: (pricing: OrderCommercialPricing) => void;
  onOverviewChange?: (overview: { total: number; pending: number; inProgress: number; completed: number }) => void;
};

function positiveInteger(value: unknown) {
  const parsed = Math.trunc(Number(value || 0));
  return Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
}

function nonNegativeNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function pricingFromOrder(order: any): OrderCommercialPricing {
  const servicePrice = nonNegativeNumber(order?.service_price);
  const partsTotal = nonNegativeNumber(order?.parts_total);
  const subtotal = order?.subtotal == null ? servicePrice + partsTotal : nonNegativeNumber(order.subtotal);
  return {
    service_price: servicePrice,
    parts_total: partsTotal,
    subtotal,
    discount_type: order?.discount_type === "amount" ? "amount" : "percentage",
    discount_percentage: nonNegativeNumber(order?.discount_percentage),
    discount_amount: nonNegativeNumber(order?.discount_amount),
    final_total: order?.final_total == null
      ? Math.max(0, subtotal - nonNegativeNumber(order?.discount_amount))
      : nonNegativeNumber(order.final_total),
    commercial_pricing_enabled: Boolean(order?.commercial_pricing_enabled),
  };
}

function draftFromItem(item: OrderCommercialItem): ItemDraft {
  return {
    quantity: String(positiveInteger(item.quantity)),
    unitPrice: String(nonNegativeNumber(item.unit_price)),
    additionalCost: String(nonNegativeNumber(item.additional_cost)),
    description: item.description_snapshot || "",
  };
}

function TechnicianMultiPicker({
  people, selected, onChange, disabled, label, loading = false,
}: {
  people: OrderServiceTechnician[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  label: string;
  loading?: boolean;
}) {
  // Usa o mesmo input arredondado, pesquisa e seleção múltipla da Nova OS.
  return <EmployeeMultiSelect
    label={label}
    inlineDropdown
    employees={people.map(person => ({ id: person.id, full_name: person.name }))}
    selectedIds={selected}
    onChange={onChange}
    disabled={disabled}
    placeholder="Selecionar técnicos"
    clearLabel="Limpar técnicos"
    loading={loading}
  />;
}

export function OrderProductsServicesSection({ order, canEdit, commercialLocked = false, formatCurrency, onPricingChange, onOverviewChange }: Props) {
  const queryClient = useQueryClient();
  const signTaskPhoto = useCallback((path: string) => getStoragePreviewUrl(
    queryClient, "technician-task-photos", path, () => createOrderTaskPhotoUrl(path),
  ), [queryClient]);
  const editable = canEdit && !order?.completed_at && !order?.cancelled_at;
  // Aprovação congela os valores; agendamento e execução técnica permanecem disponíveis.
  const commercialEditable = editable && !commercialLocked;
  const [items, setItems] = useState<OrderCommercialItem[]>([]);
  const orderedItems = useMemo(() => [...items].sort((a,b) =>
    Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned)) ||
    a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)), [items]);
  const itemsRef = useRef<OrderCommercialItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [tasks, setTasks] = useState<Record<string, OrderServiceTask>>({});
  const [technicians, setTechnicians] = useState<OrderServiceTechnician[]>([]);
  const [techniciansLoading, setTechniciansLoading] = useState(true);
  const [workflowReady, setWorkflowReady] = useState(false);
  const [taskPhotos, setTaskPhotos] = useState<OrderTaskPhoto[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const photoUrlsRef = useRef<Record<string, { url: string; expires: number }>>({});
  const photoRetryAfterRef = useRef<Record<string, number>>({});
  // Callback do pai não deve fazer o efeito de carga reiniciar quando o
  // resumo/badge mudar. A instabilidade anterior provocava milhares de RPCs.
  const overviewCallbackRef = useRef(onOverviewChange);
  useEffect(() => { overviewCallbackRef.current = onOverviewChange; }, [onOverviewChange]);
  const [galleryItem, setGalleryItem] = useState<OrderCommercialItem | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [pricing, setPricing] = useState<OrderCommercialPricing>(() => pricingFromOrder(order));
  // Usa o balão global do CRM em vez de reservar espaço fixo no início da seção.
  const showFeedback = (feedback: { type: "success" | "error"; text: string }) => {
    notifyAdmin(feedback.text, feedback.type);
  };

  const [productSearch, setProductSearch] = useState("");
  const [productOptions, setProductOptions] = useState<OrderCatalogOption[]>([]);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearching, setProductSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<OrderCatalogOption | null>(null);
  const relatedProductsQuery = useQuery({
    queryKey: ["orders", "related-products", "execution", order?.id, selectedProduct?.id],
    queryFn: () => listOrderRelatedProducts(order!.id, [selectedProduct!.id]),
    enabled: Boolean(commercialEditable && order?.id && selectedProduct?.id),
    staleTime: 15_000,
  });
  const [productPrice, setProductPrice] = useState("");
  const [productQuantity, setProductQuantity] = useState("1");

  const [serviceSearch, setServiceSearch] = useState("");
  const [serviceOptions, setServiceOptions] = useState<OrderCatalogOption[]>([]);
  const [serviceSearchOpen, setServiceSearchOpen] = useState(false);
  const [serviceSearching, setServiceSearching] = useState(false);
  const [selectedService, setSelectedService] = useState<OrderCatalogOption | null>(null);
  const [servicePrice, setServicePrice] = useState("");
  const [serviceQuantity, setServiceQuantity] = useState("1");
  const [serviceTechnicianIds, setServiceTechnicianIds] = useState<string[]>([]);
  const [serviceNeedsSchedule, setServiceNeedsSchedule] = useState(false);
  const [serviceScheduleDraft, setServiceScheduleDraft] = useState<ServiceScheduleDraft | null>(null);
  const [serviceScheduleOpen, setServiceScheduleOpen] = useState(false);

  const [customOpen, setCustomOpen] = useState(false);
  const [editingCustomItem, setEditingCustomItem] = useState<OrderCommercialItem | null>(null);
  const [customName, setCustomName] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customQuantity, setCustomQuantity] = useState("1");
  const [customTechnicianIds, setCustomTechnicianIds] = useState<string[]>([]);
  const [editingTechnicianItem, setEditingTechnicianItem] = useState<OrderCommercialItem | null>(null);
  const [editingTechnicianIds, setEditingTechnicianIds] = useState<string[]>([]);
  const [schedulingItem, setSchedulingItem] = useState<OrderCommercialItem | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);

  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>({});
  const [mutating, setMutating] = useState(false);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [pinningItems, setPinningItems] = useState<Record<string, boolean>>({});

  const [discountType, setDiscountType] = useState<"percentage" | "amount">(
    order?.discount_type === "amount" ? "amount" : "percentage",
  );
  const [discountValue, setDiscountValue] = useState(
    String(order?.discount_type === "amount" ? nonNegativeNumber(order?.discount_amount) : nonNegativeNumber(order?.discount_percentage)),
  );
  // Persiste somente a última edição após uma pausa; evita RPC a cada tecla
  // e serializa gravações para que respostas antigas não sobrescrevam as novas.
  const [discountSaveRevision, setDiscountSaveRevision] = useState(0);
  const [discountSaving, setDiscountSaving] = useState(false);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const discountEditRevisionRef = useRef(0);
  const discountSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const discountOrderRef = useRef<string | null>(order?.id || null);
  const editDiscount = (type: "percentage" | "amount", value: string) => {
    discountEditRevisionRef.current += 1;
    setDiscountSaveRevision(discountEditRevisionRef.current);
    setDiscountError(null);
    setDiscountType(type);
    setDiscountValue(value);
  };

  const applyPricing = useCallback((next: OrderCommercialPricing) => {
    setPricing(next);
    onPricingChange(next);
    // Não substitui o texto que está sendo digitado por uma resposta antiga.
    if (discountEditRevisionRef.current === 0) {
      setDiscountType(next.discount_type);
      setDiscountValue(String(next.discount_type === "amount" ? next.discount_amount : next.discount_percentage));
    }
  }, [onPricingChange]);

  const refreshTaskPhotos = useCallback(async () => {
    if (!order?.id) return;
    try {
      const incoming = await listOrderTaskPhotos(order.id);
      setTaskPhotos(incoming);
      const previewPaths = incoming.filter((photo, index, all) =>
        all.filter(other => other.item_id === photo.item_id).findIndex(other => other.id === photo.id) < 2);
      const missing = previewPaths.filter(photo =>
        (!photoUrlsRef.current[photo.path] || photoUrlsRef.current[photo.path].expires < Date.now())
        && (photoRetryAfterRef.current[photo.path] || 0) <= Date.now());
      if (missing.length) {
        const signed = await Promise.allSettled(missing.map(photo => signTaskPhoto(photo.path)));
        signed.forEach((result, index) => {
          const path = missing[index].path;
          if (result.status === "fulfilled") {
            photoUrlsRef.current[path] = { url: result.value.url, expires: result.value.expiresAt };
            delete photoRetryAfterRef.current[path];
          } else {
            // Falha 544/timeout do Storage: não repetir assinatura a cada render.
            photoRetryAfterRef.current[path] = Date.now() + 120_000;
          }
        });
      }
      setPhotoUrls(Object.fromEntries(Object.entries(photoUrlsRef.current).map(([path, entry]) => [path, entry.url])));
    } catch {
      // A OS continua funcional se a migração de leitura de fotos ainda não foi aplicada.
    }
  }, [order?.id, signTaskPhoto]);

  const openTaskGallery = async (item: OrderCommercialItem) => {
    setGalleryItem(item);
    const missing = taskPhotos.filter(photo => photo.item_id === item.id &&
      (!photoUrlsRef.current[photo.path] || photoUrlsRef.current[photo.path].expires < Date.now()));
    try {
      const signed = await Promise.all(missing.map(async photo => ({
        path: photo.path, preview: await signTaskPhoto(photo.path),
      })));
      for (const entry of signed) photoUrlsRef.current[entry.path] = { url: entry.preview.url, expires: entry.preview.expiresAt };
      setPhotoUrls(Object.fromEntries(Object.entries(photoUrlsRef.current).map(([path, entry]) => [path, entry.url])));
    } catch (error) {
      showFeedback({ type: "error", text: systemErrorMessage(error, "Não foi possível abrir as fotos da execução.") });
    }
  };

  const publishOverview = useCallback((nextItems: OrderCommercialItem[], nextTasks: OrderServiceTask[]) => {
    const services = nextItems.filter(item => item.item_type !== "product");
    const byItem = new Map(nextTasks.map(task => [task.item_id, task.status]));
    overviewCallbackRef.current?.({
      total: nextItems.length,
      pending: services.filter(item => !byItem.has(item.id) || byItem.get(item.id) === "pending" || byItem.get(item.id) === "cancelled").length,
      inProgress: services.filter(item => byItem.get(item.id) === "in_progress").length,
      completed: services.filter(item => byItem.get(item.id) === "completed").length,
    });
  }, []);

  const loadItems = useCallback(async (quiet = false) => {
    if (!order?.id) return;
    if (!quiet) {
      setLoadingItems(true);
      setTechniciansLoading(true);
    }
    try {
      const next = await listOrderCommercialItems(order.id);
      setItems(next);
      itemsRef.current = next;
      setDrafts(Object.fromEntries(next.map(item => [item.id, draftFromItem(item)])));
      try {
        const nextTasks = await listOrderServiceTasks(order.id);
        setTasks(Object.fromEntries(nextTasks.map(task => [task.item_id, task])));
        publishOverview(next, nextTasks);
        void refreshTaskPhotos();
        setTechnicians(editable ? await listOrderServiceTechnicians(order.id) : []);
        setWorkflowReady(true);
      } catch {
        // Compatibilidade: a migração pode ainda não ter sido aplicada.
        setTasks({});
        setTechnicians([]);
        setWorkflowReady(false);
      }
    } catch (error) {
      showFeedback({ type: "error", text: systemErrorMessage(error, "Não foi possível carregar os produtos e serviços da OS.") });
    } finally {
      if (!quiet) {
        setTechniciansLoading(false);
        setLoadingItems(false);
      }
    }
  }, [order?.id, editable, refreshTaskPhotos, publishOverview]);

  // Escuta somente a OS aberta. Quando o técnico inicia/finaliza em outra sessão,
  // o Postgres Changes entrega o evento sem atualizar o editor comercial da OS.
  useEffect(() => {
    if (!order?.id) return;
    let active = true;
    let subscribed = false;
    let fetching = false;
    let lastRefreshAt = 0;

    const refreshTechnicalStatus = async () => {
      if (!active || fetching || document.visibilityState === "hidden" || !navigator.onLine) return;
      fetching = true;
      try {
        const next = await listOrderServiceTasks(order.id);
        if (!active) return;
        setTasks(Object.fromEntries(next.map(task => [task.item_id, task])));
        publishOverview(itemsRef.current, next);
        void refreshTaskPhotos();
        setWorkflowReady(true);
        lastRefreshAt = Date.now();
      } catch {
        // Erros transitórios no Realtime não devem apagar alterações comerciais locais.
        // A carga inicial informa falhas de acesso e migração separadamente.
      } finally {
        fetching = false;
      }
    };

    const channel = supabase.channel(`order-service-tasks:${order.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "service_order_item_tasks",
        filter: `service_order_id=eq.${order.id}`,
      }, () => { void refreshTechnicalStatus(); })
      .subscribe(status => {
        subscribed = status === "SUBSCRIBED";
        // O carregamento inicial já está em andamento; não dispare outro GET
        // apenas porque o canal acabou de conectar.
      });

    const refreshOnReturn = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRefreshAt > 60_000) void refreshTechnicalStatus();
    };
    document.addEventListener("visibilitychange", refreshOnReturn);
    window.addEventListener("online", refreshOnReturn);

    // Recuperação se o Realtime cair ou um evento for perdido. Nunca cria
    // polling de tabelas comerciais e pausa quando a aba não está visível.
    const poll = window.setInterval(() => {
      if (!subscribed && Date.now() - lastRefreshAt > 120_000) void refreshTechnicalStatus();
    }, 120_000);

    return () => {
      active = false;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", refreshOnReturn);
      window.removeEventListener("online", refreshOnReturn);
      void supabase.removeChannel(channel);
    };
  }, [order?.id, refreshTaskPhotos, publishOverview]);

  useEffect(() => {
    discountOrderRef.current = order?.id || null;
    discountEditRevisionRef.current = 0;
    setDiscountSaveRevision(0);
    setDiscountSaving(false);
    setDiscountError(null);
  }, [order?.id]);

  useEffect(() => () => {
    // Ignora respostas da OS anterior quando o editor for desmontado.
    discountOrderRef.current = null;
  }, []);

  useEffect(() => {
    setPricing(pricingFromOrder(order));
    if (discountEditRevisionRef.current === 0) {
      setDiscountType(order?.discount_type === "amount" ? "amount" : "percentage");
      setDiscountValue(String(order?.discount_type === "amount" ? nonNegativeNumber(order?.discount_amount) : nonNegativeNumber(order?.discount_percentage)));
    }
  }, [
    order?.id,
    order?.service_price,
    order?.parts_total,
    order?.subtotal,
    order?.discount_type,
    order?.discount_percentage,
    order?.discount_amount,
    order?.final_total,
    order?.commercial_pricing_enabled,
  ]);

  useEffect(() => {
    setTaskPhotos([]);
    setPhotoUrls({});
    photoUrlsRef.current = {};
    photoRetryAfterRef.current = {};
    setGalleryItem(null);
    setProductSearch("");
    setSelectedProduct(null);
    setServiceSearch("");
    setSelectedService(null);
    setServiceTechnicianIds([]);
    setCustomTechnicianIds([]);
    setEditingCustomItem(null);
    setCustomOpen(false);
    setPinningItems({});
    setWorkflowReady(false);
    setTechniciansLoading(true);
    void loadItems();
  }, [loadItems, order?.id]);

  useEffect(() => {
    if (!commercialEditable || !order?.id || !productSearchOpen || selectedProduct) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setProductSearching(true);
      try {
        const options = await searchOrderProducts(order.id, productSearch);
        if (!cancelled) setProductOptions(options);
      } catch (error) {
        if (!cancelled) showFeedback({ type: "error", text: systemErrorMessage(error, "Não foi possível buscar produtos.") });
      } finally {
        if (!cancelled) setProductSearching(false);
      }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [commercialEditable, order?.id, productSearch, productSearchOpen, selectedProduct]);

  // O catálogo depende do equipamento da OS; não manter uma sugestão
  // selecionada anteriormente quando o tipo de equipamento mudar.
  useEffect(() => {
    setSelectedService(null);
    setServiceSearch("");
    setServiceOptions([]);
    setServiceSearchOpen(false);
    setServiceNeedsSchedule(false);
    setServiceScheduleDraft(null);
    setServiceTechnicianIds([]);
  }, [order?.id, order?.equipment_type_id]);

  useEffect(() => {
    if (!commercialEditable || !order?.id || !serviceSearchOpen || selectedService) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setServiceSearching(true);
      try {
        const options = await searchOrderServices(order.id, serviceSearch);
        if (!cancelled) setServiceOptions(options);
      } catch (error) {
        if (!cancelled) showFeedback({ type: "error", text: systemErrorMessage(error, "Não foi possível buscar serviços.") });
      } finally {
        if (!cancelled) setServiceSearching(false);
      }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [commercialEditable, order?.id, serviceSearch, serviceSearchOpen, selectedService]);

  const selectProduct = (option: OrderCatalogOption) => {
    if (option.stock != null && option.stock <= 0) {
      showFeedback({ type: "error", text: `${option.name} está sem estoque disponível e não pode ser adicionado à OS.` });
      setSelectedProduct(null);
      return;
    }
    setSelectedProduct(option);
    setProductSearch(option.name);
    setProductPrice(option.price == null ? "" : String(option.price));
    setProductQuantity("1");
    setProductSearchOpen(false);
    setProductSearching(false);
  };

  const selectService = (option: OrderCatalogOption) => {
    // Valor nulo é permitido no catálogo (sem preço ou definido na conclusão).
    // O banco registra 0 como valor inicial, sem inventar uma cobrança.
    setSelectedService(option);
    setServiceSearch(option.name);
    setServicePrice(String(option.price ?? 0));
    setServiceQuantity("1");
    setServiceNeedsSchedule(false);
    setServiceScheduleDraft(null);
    setServiceTechnicianIds([]);
    setServiceSearchOpen(false);
    setServiceSearching(false);
  };

  const addProduct = async () => {
    if (!commercialEditable || !selectedProduct || !order?.id) return;
    if (selectedProduct.stock != null && selectedProduct.stock <= 0) {
      showFeedback({ type: "error", text: `${selectedProduct.name} está sem estoque disponível e não pode ser adicionado à OS.` });
      return;
    }
    if (productPrice.trim() === "") {
      showFeedback({ type: "error", text: "Informe o preço unitário do produto." });
      return;
    }

    setMutating(true);
    try {
      const nextPricing = await addOrderCatalogItem({
        serviceOrderId: order.id,
        itemType: "product",
        catalogId: selectedProduct.id,
        quantity: positiveInteger(productQuantity),
        unitPrice: nonNegativeNumber(productPrice),
      });
      applyPricing(nextPricing);
      await loadItems(true);
      setSelectedProduct(null);
      setProductSearch("");
      setProductPrice("");
      setProductQuantity("1");
      showFeedback({ type: "success", text: "Produto adicionado à OS." });
    } catch (error) {
      showFeedback({ type: "error", text: systemErrorMessage(error, "Não foi possível adicionar o produto.") });
    } finally {
      setMutating(false);
    }
  };

  const addService = async () => {
    if (!commercialEditable || !selectedService || !order?.id) return;
    if (serviceNeedsSchedule && (!serviceScheduleDraft || !serviceScheduleDraft.technicianIds.length)) {
      showFeedback({ type: "error", text: "Selecione uma data, horário e técnicos disponíveis no calendário." });
      setServiceScheduleOpen(true);
      return;
    }
    setMutating(true);
    try {
      const nextPricing = await addOrderCatalogItem({
        serviceOrderId: order.id,
        itemType: "service",
        catalogId: selectedService.id,
        quantity: positiveInteger(serviceQuantity),
        unitPrice: null,
        technicianIds: workflowReady ? serviceNeedsSchedule ? serviceScheduleDraft!.technicianIds : serviceTechnicianIds : undefined,
        scheduledStartAt: serviceNeedsSchedule ? serviceScheduleDraft?.startAt : null,
        scheduledEndAt: serviceNeedsSchedule ? serviceScheduleDraft?.endAt : null,
      });
      applyPricing(nextPricing);
      await loadItems(true);
      setServiceTechnicianIds([]);
      setServiceNeedsSchedule(false);
      setServiceScheduleDraft(null);
      setServiceScheduleOpen(false);
      setSelectedService(null);
      setServiceSearch("");
      setServicePrice("");
      setServiceQuantity("1");
      showFeedback({ type: "success", text: "Serviço adicionado à OS." });
    } catch (error) {
      showFeedback({ type: "error", text: systemErrorMessage(error, "Não foi possível adicionar o serviço.") });
    } finally {
      setMutating(false);
    }
  };

  const addCustomService = async () => {
    if (!commercialEditable || !order?.id || !customName.trim() || customPrice.trim() === "") return;
    setMutating(true);
    try {
      const nextPricing = await addOrderCustomService({
        serviceOrderId: order.id,
        name: customName,
        description: customDescription,
        quantity: positiveInteger(customQuantity),
        unitPrice: nonNegativeNumber(customPrice),
        technicianIds: workflowReady ? customTechnicianIds : undefined,
      });
      applyPricing(nextPricing);
      await loadItems(true);
      setCustomTechnicianIds([]);
      setCustomOpen(false);
      setCustomName("");
      setCustomDescription("");
      setCustomPrice("");
      setCustomQuantity("1");
      showFeedback({ type: "success", text: "Serviço Avulso adicionado somente a esta OS." });
    } catch (error) {
      showFeedback({ type: "error", text: systemErrorMessage(error, "Não foi possível adicionar o Serviço Avulso.") });
    } finally {
      setMutating(false);
    }
  };

  const openNewCustomService = () => {
    if (!commercialEditable) return;
    setEditingCustomItem(null);
    setCustomName("");
    setCustomDescription("");
    setCustomPrice("");
    setCustomQuantity("1");
    setCustomTechnicianIds([]);
    setCustomOpen(true);
  };

  const openEditCustomService = (item: OrderCommercialItem) => {
    if (!commercialEditable || item.item_type !== "custom_service") return;
    setEditingCustomItem(item);
    setCustomName(item.title_snapshot);
    setCustomDescription(item.description_snapshot || "");
    setCustomOpen(true);
  };

  const closeCustomService = () => {
    if (mutating) return;
    setCustomOpen(false);
    setEditingCustomItem(null);
    setCustomName("");
    setCustomDescription("");
  };

  const saveCustomService = async () => {
    if (!editingCustomItem) {
      await addCustomService();
      return;
    }
    if (!commercialEditable || !order?.id || !customName.trim() || mutating) return;
    setMutating(true);
    try {
      await updateOrderCustomServiceDetails({
        itemId: editingCustomItem.id,
        serviceOrderId: order.id,
        title: customName,
        description: customDescription,
      });
      await loadItems(true);
      setEditingCustomItem(null);
      setCustomOpen(false);
      showFeedback({ type: "success", text: "Serviço avulso atualizado." });
    } catch (error) {
      showFeedback({ type: "error", text: systemErrorMessage(error, "Não foi possível editar o serviço avulso.") });
    } finally {
      setMutating(false);
    }
  };

  const togglePinnedItem = async (item: OrderCommercialItem) => {
    // Fixar só muda a ordem visual e continua permitido após a aprovação.
    if (!editable || !order?.id || pinningItems[item.id]) return;
    setPinningItems(current => ({ ...current, [item.id]: true }));
    try {
      const nextPinned = await setOrderCommercialItemPinned({
        itemId: item.id, serviceOrderId: order.id, pinned: !item.is_pinned,
      });
      setItems(current => current.map(currentItem =>
        currentItem.id === item.id ? { ...currentItem, is_pinned: nextPinned } : currentItem));
    } catch (error) {
      showFeedback({ type: "error", text: systemErrorMessage(error, "Não foi possível alterar a fixação do item.") });
    } finally {
      setPinningItems(current => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    }
  };

  const updateDraft = (itemId: string, patch: Partial<ItemDraft>) => {
    setDrafts(current => ({
      ...current,
      [itemId]: {
        ...(current[itemId] || { quantity: "1", unitPrice: "0", additionalCost: "0", description: "" }),
        ...patch,
      },
    }));
  };

  const saveItem = async (item: OrderCommercialItem, override?: Partial<ItemDraft>) => {
    const draft = { ...(drafts[item.id] || draftFromItem(item)), ...override };
    const quantity = positiveInteger(draft.quantity);
    const unitPrice = item.item_type === "service"
      ? nonNegativeNumber(item.unit_price)
      : nonNegativeNumber(draft.unitPrice);
    const additionalCost = nonNegativeNumber(draft.additionalCost);
    const description = draft.description || "";
    const unchanged =
      quantity === positiveInteger(item.quantity)
      && Math.abs(unitPrice - nonNegativeNumber(item.unit_price)) < 0.001
      && Math.abs(additionalCost - nonNegativeNumber(item.additional_cost)) < 0.001
      && description.trim() === String(item.description_snapshot || "").trim();

    if (unchanged || !commercialEditable) return;

    setSavingItemId(item.id);
    try {
      const nextPricing = await updateOrderCommercialItem({
        itemId: item.id,
        quantity,
        unitPrice,
        additionalCost,
        description,
      });
      applyPricing(nextPricing);
      await loadItems(true);
    } catch (error) {
      showFeedback({ type: "error", text: systemErrorMessage(error, "Não foi possível atualizar o item.") });
      await loadItems(true);
    } finally {
      setSavingItemId(null);
    }
  };

  const removeItem = async (item: OrderCommercialItem) => {
    if (!commercialEditable) return;
    setSavingItemId(item.id);
    try {
      const nextPricing = await deleteOrderCommercialItem(item.id);
      applyPricing(nextPricing);
      await loadItems(true);
      showFeedback({ type: "success", text: "Item removido da OS." });
    } catch (error) {
      showFeedback({ type: "error", text: systemErrorMessage(error, "Não foi possível remover o item.") });
    } finally {
      setSavingItemId(null);
    }
  };

  const saveTechnicianTeam = async () => {
    if (!editingTechnicianItem || !editable || !workflowReady || savingTaskId) return;
    if (tasks[editingTechnicianItem.id]?.scheduled_start_at) {
      showFeedback({ type: "error", text: "Remova o agendamento antes de alterar os técnicos responsáveis." });
      return;
    }
    if (!editingTechnicianIds.length) {
      showFeedback({ type: "error", text: "Selecione pelo menos um técnico responsável." });
      return;
    }
    setSavingTaskId(editingTechnicianItem.id);
    try {
      await setOrderServiceTaskTechnicians(editingTechnicianItem.id, editingTechnicianIds);
      const next = await listOrderServiceTasks(order.id);
      setTasks(Object.fromEntries(next.map(task => [task.item_id, task])));
      setEditingTechnicianItem(null);
      showFeedback({ type: "success", text: "Equipe responsável atualizada." });
    } catch (error) {
      showFeedback({ type: "error", text: systemErrorMessage(error, "Não foi possível atualizar os técnicos responsáveis.") });
    } finally {
      setSavingTaskId(null);
    }
  };

  const saveServiceSchedule = async (start: string | null, end: string | null) => {
    if (!schedulingItem || !editable || scheduleSaving) return;
    setScheduleSaving(true);
    try {
      await setOrderServiceTaskSchedule({ itemId: schedulingItem.id, startAt: start, endAt: end });
      const next = await listOrderServiceTasks(order.id);
      setTasks(Object.fromEntries(next.map(task => [task.item_id, task])));
      setSchedulingItem(null);
      showFeedback({ type: "success", text: start ? "Agendamento do serviço confirmado." : "Agendamento do serviço removido." });
    } catch (error) {
      showFeedback({ type: "error", text: systemErrorMessage(error, "Não foi possível agendar o serviço.") });
    } finally {
      setScheduleSaving(false);
    }
  };

  const formatServiceSchedule = (value: string | null | undefined) => value
    ? new Date(value).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      }) : "";

  const renderStatusTag = (item: OrderCommercialItem) =>
    item.item_type === "product" ? null : <OrderServiceStatusBadge status={tasks[item.id]?.status}/>;

  const renderTechnicianColumn = (item: OrderCommercialItem) => {
    if (item.item_type === "product") return <span className="text-xs text-muted-foreground">—</span>;
    const task = tasks[item.id];
    const teamLocked = Boolean(task?.scheduled_start_at);
    const assigned = task?.technicians?.length
      ? task.technicians
      : task?.assigned_employee_id
        ? [{ id: task.assigned_employee_id, name: task.technician_name || "Técnico" }]
        : [];
    return <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {assigned.length ? <span title={assigned.map(person => person.name).join(", ")}
        className="min-w-0 break-words text-xs font-semibold text-foreground">
        {assigned.map(person => person.name).join(", ")}
      </span> : <span className="text-xs text-muted-foreground">Não atribuído</span>}
      {teamLocked && <span className="text-[10px] text-muted-foreground">Equipe do agendamento</span>}
      {workflowReady && editable && task?.status !== "completed" && <AdminButton
        size="sm" variant="secondary" className="h-7 shrink-0 px-2 py-1 text-[10px]"
        disabled={teamLocked} title={teamLocked ? "Remova o agendamento para alterar os responsáveis." : undefined}
        onClick={() => {
          setEditingTechnicianItem(item);
          setEditingTechnicianIds(assigned.map(person => person.id));
        }}>Editar</AdminButton>}
    </div>;
  };

  const renderTaskPhotoPreviews = (item: OrderCommercialItem) => {
    const photos = taskPhotos.filter(photo => photo.item_id === item.id);
    return <div className="min-w-0">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fotos do técnico</p>
      {!photos.length
        ? <AdminSectionEmpty compact>Nenhuma foto enviada.</AdminSectionEmpty>
        : <div className="flex items-center gap-1.5">
          {photos.slice(0, 2).map(photo => <button key={photo.id} type="button"
            onClick={() => void openTaskGallery(item)} aria-label="Visualizar fotos do técnico"
            className="h-11 w-11 shrink-0 overflow-hidden rounded-md border border-border bg-muted hover:border-primary">
            {photoUrls[photo.path]
              ? <img src={photoUrls[photo.path]} alt="Foto do serviço" loading="lazy" className="h-full w-full object-cover" />
              : <Camera size={17} className="mx-auto text-muted-foreground" />}
          </button>)}
          {photos.length > 2 && <button type="button"
            className="flex h-11 min-w-11 items-center justify-center rounded-md border border-border bg-muted px-2 text-xs font-bold text-foreground hover:border-primary"
            onClick={() => void openTaskGallery(item)}
            aria-label={"Ver outras " + (photos.length - 2) + " fotos"}>+{photos.length - 2}</button>}
        </div>}
    </div>;
  };

  const renderTaskProgress = (item: OrderCommercialItem) => {
    const task = tasks[item.id];
    const status = task?.status || "pending";
    const progress = status === "completed" ? 100 : status === "in_progress" ? 55 : 0;
    const progressTone = status === "completed" ? STATUS_TONE_CLASSES.success.dot
      : status === "cancelled" ? STATUS_TONE_CLASSES.danger.dot
      : status === "in_progress" ? STATUS_TONE_CLASSES.progress.dot : STATUS_TONE_CLASSES.pending.dot;
    const statusLabel = status === "pending" ? "Aguardando início"
      : status === "in_progress" ? "Em execução" : status === "completed" ? "Finalizado" : "Cancelado";
    return <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Progresso</span>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
          {status === "in_progress" && <Wrench size={13} className="animate-spin text-amber-600 motion-reduce:animate-none [animation-duration:3s]" />}
          {statusLabel}
        </span>
      </div>
      <div role="progressbar" aria-label={`Progresso de ${item.title_snapshot}`}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", progressTone)}
          style={{ width: `${progress}%` }} />
      </div>
      {!workflowReady && <p className="text-[11px] text-muted-foreground">Aguardando dados técnicos.</p>}
    </div>;
  };

  const renderTaskDetails = (item: OrderCommercialItem) => {
    const task = tasks[item.id];
    const locations = ([
      ["Início", task?.start_location],
      ["Conclusão", task?.finish_location],
    ] as const).filter(([, location]) => location?.lat != null && location.lng != null);
    return <div className="grid min-w-0 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <div className="min-w-0">
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Serviço realizado</p>
        {task?.execution_report
          ? <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">{task.execution_report}</p>
          : <AdminSectionEmpty compact>Ainda não informado.</AdminSectionEmpty>}
      </div>
      <div className="min-w-0">
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Localizações</p>
        {locations.length ? <div className="flex flex-wrap gap-x-4 gap-y-2">
          {locations.map(([label, location]) => <a
            key={label}
            href={`https://www.google.com/maps?q=${encodeURIComponent(`${location!.lat},${location!.lng}`)}`}
            target="_blank" rel="noreferrer"
            title={`Abrir localização de ${label.toLocaleLowerCase("pt-BR")} no mapa`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          ><MapPin size={14} className="shrink-0" />
            {label}
            {location?.accuracy_m != null && <span className="font-normal text-muted-foreground">±{Math.round(location.accuracy_m)} m</span>}
          </a>)}
        </div> : <AdminSectionEmpty compact>Nenhum local registrado.</AdminSectionEmpty>}
      </div>
      {renderTaskPhotoPreviews(item)}
    </div>;
  };

  useEffect(() => {
    if (!commercialEditable || !order?.id || discountSaveRevision === 0) return;
    const orderId = order.id;
    const revision = discountSaveRevision;
    const type = discountType;
    const value = nonNegativeNumber(discountValue);
    const timer = window.setTimeout(() => {
      discountSaveQueueRef.current = discountSaveQueueRef.current.catch(() => undefined).then(async () => {
        if (discountOrderRef.current !== orderId || discountEditRevisionRef.current !== revision) return;
        setDiscountSaving(true);
        try {
          const nextPricing = await setOrderCommercialDiscount(orderId, type, value);
          if (discountOrderRef.current === orderId && discountEditRevisionRef.current === revision) {
            discountEditRevisionRef.current = 0;
            setDiscountSaveRevision(0);
            setDiscountError(null);
            applyPricing(nextPricing);
          }
        } catch (error) {
          if (discountOrderRef.current === orderId && discountEditRevisionRef.current === revision) {
            const message = systemErrorMessage(error, "Não foi possível salvar o desconto automaticamente.");
            setDiscountError(message);
            showFeedback({ type: "error", text: message });
          }
        } finally {
          if (discountOrderRef.current === orderId) setDiscountSaving(false);
        }
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [order?.id, commercialEditable, discountSaveRevision, discountType, discountValue, applyPricing]);

  const explicitProductTotal = useMemo(
    () => items.filter(item => item.item_type === "product").reduce((sum, item) => sum + nonNegativeNumber(item.subtotal), 0),
    [items],
  );
  const resolutionProductsTotal = Math.max(
    0,
    pricing.resolution_products_total ?? (nonNegativeNumber(pricing.parts_total) - explicitProductTotal),
  );

  const typeLabel = (item: OrderCommercialItem) => item.item_type === "product"
    ? "Produto"
    : item.item_type === "custom_service"
      ? "Serviço Avulso"
      : "Serviço";

  const renderQuantity = (item: OrderCommercialItem, compact = false) => {
    const draft = drafts[item.id] || draftFromItem(item);
    return <NumberStepper
      ariaLabel="Quantidade"
      value={draft.quantity}
      min={1}
      step={1}
      integer
      disabled={!commercialEditable || savingItemId === item.id}
      onChange={value => updateDraft(item.id, { quantity: value })}
      onBlur={() => void saveItem(item)}
      onStep={value => void saveItem(item, { quantity: value })}
      inputClassName={compact ? "py-2 text-center" : "py-1.5 text-xs"}
    />;
  };

  const renderPrice = (item: OrderCommercialItem, compact = false) => {
    const draft = drafts[item.id] || draftFromItem(item);
    if (item.item_type === "service") {
      return <div className={cn(
        INPUT,
        "flex min-h-[38px] items-center justify-center bg-muted text-center text-sm font-semibold text-muted-foreground",
        !compact && "py-1.5 text-xs",
      )}>{formatCurrency(nonNegativeNumber(item.unit_price))}</div>;
    }

    return <FCurrencyInput
      aria-label="Preço unitário"
      placeholder="R$ 0,00"
      disabled={!commercialEditable || savingItemId === item.id}
      value={draft.unitPrice}
      onChange={(event: any) => updateDraft(item.id, { unitPrice: event.target.value })}
      onBlur={() => void saveItem(item)}
      className={compact ? "text-center" : "h-9 py-1.5 text-xs"}
    />;
  };

  const renderAdditionalCost = (item: OrderCommercialItem, compact = false) => {
    const draft = drafts[item.id] || draftFromItem(item);
    return <FCurrencyInput
      aria-label="Custo adicional"
      placeholder="R$ 0,00"
      disabled={!commercialEditable || savingItemId === item.id}
      value={draft.additionalCost}
      onChange={(event: any) => updateDraft(item.id, { additionalCost: event.target.value })}
      onBlur={() => void saveItem(item)}
      className={compact ? "text-center" : "h-9 py-1.5 text-xs"}
    />;
  };

  return <div className="space-y-4">
    {!commercialEditable && !commercialLocked && <div className="rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
      {order?.completed_at
        ? "Esta OS está concluída. Produtos, serviços e desconto estão bloqueados para edição."
        : order?.cancelled_at
          ? "Esta OS está cancelada. Produtos, serviços e desconto estão bloqueados para edição."
          : "Você pode visualizar os valores, mas não possui permissão para alterá-los."}
    </div>}

    {commercialEditable && <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Incluir produto" className={cn("relative !overflow-visible", productSearchOpen && !selectedProduct ? "z-30" : "z-0")}>
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Produto</label>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={productSearch}
                onFocus={() => { setProductSearchOpen(true); if (!selectedProduct) setProductSearching(true); }}
                onBlur={() => window.setTimeout(() => { setProductSearchOpen(false); setProductSearching(false); }, 120)}
                onChange={event => {
                  setProductSearch(event.target.value);
                  setSelectedProduct(null);
                  setProductSearchOpen(true);
                  setProductSearching(true);
                  setProductOptions([]);
                }}
                placeholder="Busque no estoque por nome ou SKU"
                className={cn(INPUT, "pl-9")}
              />
              <CatalogResults
              open={productSearchOpen && !selectedProduct}
              loading={productSearching}
              options={productOptions}
              emptyLabel="Nenhum produto encontrado."
              formatCurrency={formatCurrency}
              onSelect={selectProduct}
              isUnavailable={option => option.stock != null && option.stock <= 0}
              unavailableLabel={() => "Sem estoque"}
              onUnavailable={option => showFeedback({ type: "error", text: `${option.name} está sem estoque disponível e não pode ser adicionado à OS.` })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[110px_minmax(0,1fr)_auto] sm:gap-3">
            <NumberStepper
              className="w-full"
              label="Quantidade"
              value={productQuantity}
              min={1}
              step={1}
              integer
              disabled={!selectedProduct}
              onChange={setProductQuantity}
            />
            <div className="min-w-0 w-full">
              <FCurrencyInput
                label="Preço unitário"
                placeholder="R$ 0,00"
                value={productPrice}
                onChange={(event: any) => setProductPrice(event.target.value)}
                disabled={!selectedProduct}
              />
            </div>
            <BtnPrimary
              disabled={!selectedProduct || productPrice.trim() === "" || mutating}
              loading={mutating}
              onClick={() => void addProduct()}
              className="col-span-2 h-[42px] w-full sm:col-span-1 sm:w-auto"
            ><Plus size={15} /> Adicionar</BtnPrimary>
          </div>

          {selectedProduct && Boolean(relatedProductsQuery.data?.length) && <CompatibleProductCarousel
            title="Produtos relacionados"
            sourceName={selectedProduct.name}
            products={(relatedProductsQuery.data || []).map(item => ({
              id:item.inventory_item_id,name:item.name,sku:item.sku,barcode:item.barcode,
              coverMediaId:item.cover_media_id,price:item.price,stock:item.stock,unit:item.unit,
              relationType:item.relation_type,matchedCode:item.matched_code,
            }))}
            actionLabel="Selecionar"
            disabled={!commercialEditable}
            onPick={item => selectProduct({
              id:item.id,name:item.name,description:null,unit:item.unit || "un",
              price:item.price ?? null,stock:item.stock ?? 0,price_at_completion:false,
            })}
          />}
          {selectedProduct && <p className="pb-1 text-[10px] text-muted-foreground">
            Estoque atual: {selectedProduct.stock ?? 0} {selectedProduct.unit}. A inclusão na OS registra a cobrança; a movimentação física continua pelo fluxo de estoque/peças.
          </p>}
        </div>
      </Section>

      <Section title="Incluir serviço" className={cn("relative !overflow-visible", serviceSearchOpen && !selectedService ? "z-30" : "z-0")}>
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Serviço</label>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={serviceSearch}
                onFocus={() => { setServiceSearchOpen(true); if (!selectedService) setServiceSearching(true); }}
                onBlur={() => window.setTimeout(() => { setServiceSearchOpen(false); setServiceSearching(false); }, 120)}
                onChange={event => {
                  setServiceSearch(event.target.value);
                  setSelectedService(null);
                  setServiceSearchOpen(true);
                  setServiceSearching(true);
                  setServiceOptions([]);
                }}
                placeholder={order?.equipment_type_id ? "Buscar serviços deste equipamento" : "Busque no catálogo de serviços"}
                className={cn(INPUT, "pl-9")}
                aria-label="Buscar serviço"
                aria-expanded={serviceSearchOpen && !selectedService}
              />
              <CatalogResults
              open={serviceSearchOpen && !selectedService}
              fourRows
              loading={serviceSearching}
              options={serviceOptions}
              emptyLabel={order?.equipment_type_id ? "Nenhum serviço vinculado a este equipamento. Configure os vínculos em Equipamentos Técnicos." : "Nenhum serviço encontrado."}
              formatCurrency={formatCurrency}
              onSelect={selectService}
              />
            </div>
          </div>

          {editable && selectedService && <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Necessita agendamento
              </label>
              <AdminSegmentedControl
                value={serviceNeedsSchedule ? "yes" : "no"}
                onChange={value => {
                  const nextNeedsSchedule = value === "yes";
                  setServiceNeedsSchedule(nextNeedsSchedule);
                  if (nextNeedsSchedule) setServiceScheduleOpen(true);
                  else setServiceScheduleDraft(null);
                }}
                options={[{ value: "yes", label: "Sim" }, { value: "no", label: "Não" }]}
                className="w-fit grid-cols-2"
              />
            </div>
            <div>
              {serviceNeedsSchedule ? <>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Técnicos responsáveis
                </label>
                <button type="button"
                  aria-label={serviceScheduleDraft ? "Alterar horário e técnicos" : "Selecionar horário e técnicos"}
                  disabled={!workflowReady || techniciansLoading}
                  onClick={() => setServiceScheduleOpen(true)}
                  className={cn(INPUT,
                    "flex min-h-[42px] w-full items-center justify-between gap-3 rounded-lg text-left",
                    (!workflowReady || techniciansLoading) && "cursor-not-allowed opacity-70",
                  )}>
                  <span className="min-w-0 flex-1 truncate">
                    {techniciansLoading ? <InlineLoading text="Carregando técnicos..." />
                      : serviceScheduleDraft
                        ? technicians.filter(person => serviceScheduleDraft.technicianIds.includes(person.id)).map(person => person.name).join(", ")
                        : "Selecionar técnicos e horário"}
                  </span>
                  <CalendarDays size={17} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </> : <TechnicianMultiPicker
                label="Técnicos responsáveis"
                people={technicians} selected={serviceTechnicianIds} onChange={setServiceTechnicianIds}
                loading={techniciansLoading} disabled={!workflowReady}
              />}
              {serviceNeedsSchedule && serviceScheduleDraft && <p className="mt-2 text-xs font-semibold text-primary">
                {formatServiceSchedule(serviceScheduleDraft.startAt)} às {new Date(serviceScheduleDraft.endAt).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
                {" · "}Equipe definida pelo agendamento
              </p>}
              {!techniciansLoading && workflowReady && technicians.length === 0 && <p className="mt-2 text-xs text-muted-foreground">
                Nenhum funcionário ativo com acesso ao sistema nesta empresa.
              </p>}
              {!techniciansLoading && !workflowReady && <p className="mt-2 text-xs text-muted-foreground">A seleção de equipe está indisponível nesta OS.</p>}
            </div>
          </div>}
          <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[110px_minmax(0,1fr)_auto] sm:gap-3">
            <NumberStepper
              className="w-full"
              label="Quantidade"
              value={serviceQuantity}
              min={1}
              step={1}
              integer
              disabled={!selectedService}
              onChange={setServiceQuantity}
            />
            <div className="min-w-0 w-full">
              <FCurrencyInput
                label="Preço unitário"
                placeholder="R$ 0,00"
                value={servicePrice}
                onChange={() => undefined}
                disabled
              />
            </div>
            <BtnPrimary
              disabled={!selectedService || mutating || techniciansLoading ||
                (workflowReady && (serviceNeedsSchedule
                  ? !serviceScheduleDraft?.technicianIds.length
                  : !serviceTechnicianIds.length))}
              loading={mutating}
              onClick={() => void addService()}
              className="col-span-2 h-[42px] w-full px-2 sm:col-span-1 sm:w-[130px] sm:px-3"
            ><Plus size={15} /> Adicionar</BtnPrimary>
          </div>
          {selectedService && <p className="text-[10px] leading-relaxed text-muted-foreground">
            {selectedService.price_at_completion
              ? "Valor a definir na conclusão da OS."
              : selectedService.price == null || selectedService.price === 0
                ? "Serviço sem preço cadastrado; a inclusão não exige valor."
                : "Valor fixado no cadastro do serviço."}
          </p>}

          <div className="flex items-center justify-between gap-3 border-t border-border pb-1 pt-3">
            <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-muted-foreground">Serviços sem preço podem ser adicionados normalmente. Os demais seguem o valor definido no cadastro.</p>
            <span className="h-8 w-px shrink-0 bg-border" aria-hidden="true" />
            <AdminButton variant="tertiary" disabled={mutating} onClick={openNewCustomService} className="h-[42px] w-[130px] shrink-0 justify-center px-3"><Plus size={15} /> Avulso</AdminButton>
          </div>
        </div>
      </Section>
    </div>}

    <Section title={<span className="inline-flex items-center gap-2">Itens da OS
      <span className="inline-flex min-w-6 items-center justify-center rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary">{items.length}</span>
    </span>} flush>
      {loadingItems
        ? <OrderItemsSkeleton />
        : items.length === 0
          ? <AdminSectionEmpty>Nenhum produto ou serviço foi adicionado a esta OS.</AdminSectionEmpty>
          : <div className="grid min-w-0 grid-cols-1 gap-3 p-3 sm:gap-4 sm:p-4 xl:grid-cols-2">
            {orderedItems.map(item => (
              <article key={item.id}
                aria-label={item.title_snapshot}
                className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors duration-200 hover:border-primary/40 focus-within:border-primary/50">
                <header className="flex min-w-0 items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{typeLabel(item)}</span>
                    {item.item_type !== "product"
                      ? renderStatusTag(item)
                      : <span className="text-[10px] font-semibold text-muted-foreground">Registrado na OS</span>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {item.item_type !== "product" && workflowReady && editable &&
                      tasks[item.id]?.status !== "completed" && tasks[item.id]?.status !== "cancelled" &&
                      !tasks[item.id]?.scheduled_start_at &&
                      <AdminButton size="sm" variant="tertiary" className="h-9 px-2 text-[11px]"
                        disabled={scheduleSaving} onClick={() => setSchedulingItem(item)}>
                        <CalendarDays size={14}/> Agendar
                      </AdminButton>}
                    {(editable || item.is_pinned) && <AdminIconButton
                      ariaLabel={(item.is_pinned ? "Desafixar " : "Fixar ") + item.title_snapshot}
                      title={item.is_pinned ? "Desafixar item" : "Fixar item no início da lista"}
                      variant={item.is_pinned ? "tertiary" : "ghost"}
                      disabled={!editable || Boolean(pinningItems[item.id])}
                      onClick={() => void togglePinnedItem(item)}>
                      {pinningItems[item.id]
                        ? <LoadingSpinner size="sm"/>
                        : <Pin size={15} fill={item.is_pinned ? "currentColor" : "none"}/>}
                    </AdminIconButton>}
                    {commercialEditable && item.item_type === "custom_service" &&
                      <AdminIconButton
                        ariaLabel={"Editar serviço avulso " + item.title_snapshot}
                        title="Editar serviço avulso" disabled={mutating || savingItemId === item.id}
                        onClick={() => openEditCustomService(item)}>
                        <Pencil size={15}/>
                      </AdminIconButton>}
                    {commercialEditable && <AdminIconButton ariaLabel={"Remover " + item.title_snapshot} variant="danger"
                      disabled={savingItemId === item.id} onClick={() => void removeItem(item)}>
                      <Trash2 size={15} />
                    </AdminIconButton>}
                  </div>
                </header>
                <div className="min-w-0 flex-1 space-y-4 p-3.5 sm:p-4">
                  <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
                    <strong className="min-w-0 break-words text-sm font-bold text-foreground">{item.title_snapshot}</strong>
                    <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
                    <strong aria-label={"Total do item: " + formatCurrency(nonNegativeNumber(item.subtotal))}
                      className="shrink-0 whitespace-nowrap text-sm font-black text-emerald-700 dark:text-emerald-300">
                      {formatCurrency(nonNegativeNumber(item.subtotal))}
                    </strong>
                  </div>
                  <div className="grid min-w-0 gap-3 border-t border-border/60 pt-3 sm:grid-cols-3">
                    <div className="min-w-0 space-y-1.5">
                      <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Quantidade</span>
                      {renderQuantity(item, true)}
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Preço unitário</span>
                      {renderPrice(item, true)}
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Custo adicional</span>
                      {renderAdditionalCost(item, true)}
                    </div>
                  </div>
                  {item.description_snapshot && <div className="border-t border-border/60 pt-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Descrição</span>
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs text-foreground">{item.description_snapshot}</p>
                  </div>}
                  {item.item_type !== "product" && <>
                    <div className="min-w-0 space-y-1.5 border-t border-border/60 pt-3">
                      <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Técnicos responsáveis</span>
                      {renderTechnicianColumn(item)}
                    </div>
                    {workflowReady && tasks[item.id]?.scheduled_start_at && tasks[item.id]?.scheduled_end_at &&
                      <div className="flex min-w-0 flex-wrap items-center gap-3 border-t border-border/60 pt-3">
                        <span className="text-xs font-semibold text-foreground">
                          {formatServiceSchedule(tasks[item.id].scheduled_start_at)} às {new Date(tasks[item.id].scheduled_end_at!).toLocaleTimeString("pt-BR", {
                            timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                        {editable && tasks[item.id]?.status !== "completed" && tasks[item.id]?.status !== "cancelled" &&
                          <BtnSecondary disabled={scheduleSaving} onClick={() => setSchedulingItem(item)}>Reagendar</BtnSecondary>}
                      </div>}
                    <div className="min-w-0 border-t border-border/60 pt-3">
                      {renderTaskDetails(item)}
                    </div>
                  </>}
                </div>
                <footer className="border-t border-border bg-muted/20 px-3.5 py-3 sm:px-4">
                  {item.item_type === "product"
                    ? <p className="text-xs font-semibold text-muted-foreground">
                        Produto registrado na OS · acompanhamento técnico não aplicável
                      </p>
                    : renderTaskProgress(item)}
                </footer>
              </article>
            ))}
          </div>}
    </Section>

    <Section title="Resumo da OS">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          <div className="grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-4 border-b border-border py-2">
              <span className="text-muted-foreground">Total produtos</span>
              <strong className="text-emerald-700 dark:text-emerald-300">{formatCurrency(nonNegativeNumber(pricing.parts_total))}</strong>
            </div>
            {resolutionProductsTotal > 0.009 && <div className="flex items-center justify-between gap-4 border-b border-border py-2 text-xs">
              <span className="text-muted-foreground">Inclui produtos usados na solução</span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">{formatCurrency(resolutionProductsTotal)}</span>
            </div>}
            <div className="flex items-center justify-between gap-4 border-b border-border py-2">
              <span className="text-muted-foreground">Total serviços</span>
              <strong className="text-emerald-700 dark:text-emerald-300">{formatCurrency(nonNegativeNumber(pricing.service_price))}</strong>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-border py-2">
              <span className="text-muted-foreground">Subtotal</span>
              <strong className="text-emerald-700 dark:text-emerald-300">{formatCurrency(nonNegativeNumber(pricing.subtotal))}</strong>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-border py-2">
              <span className="text-muted-foreground">Desconto</span>
              <strong className="text-red-600 dark:text-red-400">- {formatCurrency(nonNegativeNumber(pricing.discount_amount))}</strong>
            </div>
            <div className="flex items-center justify-between gap-4 pt-2">
              <span className="font-bold text-foreground">Total da OS</span>
              <strong className="text-lg font-black text-emerald-700 dark:text-emerald-300">{formatCurrency(nonNegativeNumber(pricing.final_total))}</strong>
            </div>
          </div>
        </div>

        <div className="border border-border bg-muted/35 p-4">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.12em] text-foreground">Desconto</p>
          <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] lg:grid-cols-1">
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Tipo</label>
              <AdminSelect
                value={discountType}
                disabled={!commercialEditable}
                onValueChange={value => {
                  const next = value === "amount" ? "amount" : "percentage";
                  editDiscount(next, "0");
                }}
                options={[
                  { value: "percentage", label: "Percentual (%)" },
                  { value: "amount", label: "Valor (R$)" },
                ]}
              />
            </div>

            {discountType === "amount"
              ? <FCurrencyInput
                  label="Valor do desconto"
                  placeholder="R$ 0,00"
                  disabled={!commercialEditable}
                  value={discountValue}
                  onChange={(event: any) => editDiscount(discountType, event.target.value)}
                />
              : <NumberStepper
                  label="Percentual (%)"
                  value={discountValue}
                  min={0}
                  max={100}
                  step={1}
                  disabled={!commercialEditable}
                  onChange={value => editDiscount(discountType, value)}
                />}
          </div>

          {commercialEditable && <p role="status" className={cn("mt-3 flex items-center gap-2 text-[11px]", discountError ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
            {!discountError && (discountSaving || discountSaveRevision > 0) && <LoadingSpinner size="sm" />}
            {discountError || (discountSaving || discountSaveRevision > 0 ? "Salvando desconto automaticamente" : "Desconto aplicado automaticamente")}
          </p>}
        </div>
      </div>
    </Section>

    <AdminDialog open={Boolean(galleryItem)} onClose={() => setGalleryItem(null)}
      title={"Fotos do serviço" + (galleryItem ? " — " + galleryItem.title_snapshot : "")}
      description={galleryItem ? taskPhotos.filter(photo => photo.item_id === galleryItem.id).length + " fotos da execução técnica" : ""}
      className="max-w-2xl">
      <div className="grid max-h-[65vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
        {galleryItem && taskPhotos.filter(photo => photo.item_id === galleryItem.id).map((photo, index) =>
          <a key={photo.id} href={photoUrls[photo.path] || "#"} target="_blank" rel="noreferrer"
            onClick={event => { if (!photoUrls[photo.path]) event.preventDefault(); }}
            className="group overflow-hidden rounded-lg border border-border bg-muted"
            title={"Abrir foto " + (index + 1)}>
            {photoUrls[photo.path] ? <img src={photoUrls[photo.path]} alt={"Foto " + (index + 1) + " da execução"}
              loading="lazy" className="aspect-square w-full object-cover transition-transform group-hover:scale-105" />
              : <div className="flex aspect-square items-center justify-center"><Camera size={24} /></div>}
          </a>)}
      </div>
    </AdminDialog>

    <OrderServiceScheduleDraftDialog
      open={serviceScheduleOpen && Boolean(selectedService)}
      organizationId={order?.organization_id || ""}
      orderId={order?.id || ""}
      title={selectedService?.name || ""}
      technicians={technicians}
      initial={serviceScheduleDraft}
      onConfirm={selection => {
        setServiceScheduleDraft(selection);
        setServiceTechnicianIds(selection.technicianIds);
        setServiceScheduleOpen(false);
      }}
      onClose={() => {
        setServiceScheduleOpen(false);
        if (!serviceScheduleDraft) setServiceNeedsSchedule(false);
      }}
    />

    <OrderServiceScheduleDialog
      open={Boolean(schedulingItem)}
      title={schedulingItem?.title_snapshot || ""}
      organizationId={order?.organization_id || ""}
      orderId={order?.id || ""}
      itemId={schedulingItem?.id || ""}
      technicians={schedulingItem
        ? tasks[schedulingItem.id]?.technicians?.length
          ? tasks[schedulingItem.id].technicians!
          : tasks[schedulingItem.id]?.assigned_employee_id
            ? [{ id: tasks[schedulingItem.id].assigned_employee_id!, name: tasks[schedulingItem.id].technician_name || "Técnico" }]
            : []
        : []}
      scheduledStart={schedulingItem ? tasks[schedulingItem.id]?.scheduled_start_at : null}
      scheduledEnd={schedulingItem ? tasks[schedulingItem.id]?.scheduled_end_at : null}
      saving={scheduleSaving}
      onSave={(start, end) => void saveServiceSchedule(start, end)}
      onClose={() => { if (!scheduleSaving) setSchedulingItem(null); }}
    />

    <AdminDialog
      open={Boolean(editingTechnicianItem)}
      onClose={() => { if (!savingTaskId) setEditingTechnicianItem(null); }}
      title="Técnicos responsáveis"
      description={editingTechnicianItem?.title_snapshot || "Selecione os técnicos deste serviço."}
      className="max-w-md"
      footer={<div className="flex w-full justify-end gap-2">
        <BtnSecondary disabled={Boolean(savingTaskId)} onClick={() => setEditingTechnicianItem(null)}>Cancelar</BtnSecondary>
        <BtnPrimary disabled={Boolean(savingTaskId) || !editingTechnicianIds.length}
          loading={Boolean(savingTaskId)} onClick={() => void saveTechnicianTeam()}>Salvar</BtnPrimary>
      </div>}
    >
      <div className="max-h-[55vh] space-y-1 overflow-y-auto">
        {technicians.map(person => <label key={person.id}
          className="flex cursor-pointer items-center gap-3 border-b border-border px-2 py-3 text-sm hover:bg-muted/40">
          <input type="checkbox" className="h-4 w-4 accent-primary"
            checked={editingTechnicianIds.includes(person.id)}
            disabled={Boolean(savingTaskId)}
            onChange={event => setEditingTechnicianIds(current =>
              event.target.checked ? [...current, person.id] : current.filter(id => id !== person.id))} />
          <span>{person.name}</span>
        </label>)}
      </div>
    </AdminDialog>

    <AdminDialog
      open={customOpen}
      onClose={closeCustomService}
      title={editingCustomItem ? "Editar serviço avulso" : "Serviço Avulso"}
      description={editingCustomItem
        ? "Altere o nome e a descrição deste serviço, sem modificar seus valores."
        : "Este serviço ficará vinculado somente a esta OS e não será salvo no catálogo de serviços."}
      className="max-w-xl"
      footer={<div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <BtnSecondary disabled={mutating} onClick={closeCustomService}>Cancelar</BtnSecondary>
        <BtnPrimary
          disabled={mutating || !customName.trim() || customName.trim().length > 120 || (editingCustomItem === null && (techniciansLoading || customPrice.trim() === "" || (workflowReady && !customTechnicianIds.length)))}
          loading={mutating}
          onClick={() => void saveCustomService()}
        >{editingCustomItem ? "Salvar" : "Adicionar serviço"}</BtnPrimary>
      </div>}
    >
      <div className="space-y-4">
        <FInput
          label="Nome do serviço"
          required
          maxLength={120}
          disabled={mutating}
          value={customName}
          onChange={(event: any) => setCustomName(event.target.value)}
          placeholder="Ex.: Ajuste de conector"
        />
        <FTextarea
          label="Descrição"
          rows={4}
          maxLength={2000}
          disabled={mutating}
          value={customDescription}
          onChange={(event: any) => setCustomDescription(event.target.value)}
          placeholder="Descreva o que será executado nesta OS"
        />
        {!editingCustomItem && <div className="grid gap-3 sm:grid-cols-2">
          <NumberStepper
            label="Quantidade"
            value={customQuantity}
            min={1}
            step={1}
            integer
            onChange={setCustomQuantity}
          />
          <FCurrencyInput
            label="Preço unitário"
            placeholder="R$ 0,00"
            required
            value={customPrice}
            onChange={(event: any) => setCustomPrice(event.target.value)}
          />
        </div>}
        {editable && !editingCustomItem && <div>
          <TechnicianMultiPicker
            label="Técnicos responsáveis"
            people={technicians} selected={customTechnicianIds} onChange={setCustomTechnicianIds}
            loading={techniciansLoading}
            disabled={!workflowReady}
          />
        </div>}

      </div>
    </AdminDialog>
  </div>;
}
