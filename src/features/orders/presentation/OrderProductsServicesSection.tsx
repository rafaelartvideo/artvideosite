import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, ChevronDown, ChevronUp, Circle, MapPin, Plus, Search, Trash2, Wrench, XCircle } from "lucide-react";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { supabase } from "@/lib/supabase";
import {
  AdminButton,
  AdminDialog,
  AdminIconButton,
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
import { OrderServiceScheduleDraftDialog, type ServiceScheduleDraft } from "./OrderServiceScheduleDraftDialog";
import {
  addOrderCatalogItem,
  addOrderCustomService,
  deleteOrderCommercialItem,
  listOrderCommercialItems,
  searchOrderProducts,
  searchOrderServices,
  setOrderCommercialDiscount,
  updateOrderCommercialItem,
  type OrderCatalogOption,
  type OrderCommercialItem,
  type OrderCommercialPricing,
} from "../infrastructure/order-commercial-items.repository";
import {
  listOrderServiceTasks, listOrderServiceTechnicians, setOrderServiceTaskTechnicians, setOrderServiceTaskSchedule, listOrderTaskPhotos, createOrderTaskPhotoUrl,
  type OrderServiceTask, type OrderServiceTaskStatus, type OrderServiceTechnician, type OrderTaskPhoto,
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

function normalizeStepperText(value: string, integer: boolean) {
  if (integer) return value.replace(/\D/g, "");
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const firstDot = normalized.indexOf(".");
  if (firstDot < 0) return normalized;
  return normalized.slice(0, firstDot + 1) + normalized.slice(firstDot + 1).replace(/\./g, "");
}

function NumberStepper({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  integer = false,
  disabled = false,
  placeholder,
  className,
  inputClassName,
  ariaLabel,
  onBlur,
  onStep,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  ariaLabel?: string;
  onBlur?: () => void;
  onStep?: (value: string) => void;
}) {
  const adjust = (direction: 1 | -1) => {
    const parsed = Number(String(value || "").replace(",", "."));
    const base = Number.isFinite(parsed) ? parsed : min;
    let next = base + direction * step;
    next = Math.max(min, next);
    if (max != null) next = Math.min(max, next);
    const nextText = integer
      ? String(Math.max(min, Math.trunc(next)))
      : String(Number(next.toFixed(2)));
    onChange(nextText);
    onStep?.(nextText);
  };

  return <div className={cn("min-w-0", className)}>
    {label && <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</label>}
    <div className={cn(
      "flex min-h-[42px] min-w-0 overflow-hidden rounded-lg border border-border bg-muted/55 transition-colors focus-within:border-primary focus-within:bg-card focus-within:ring-2 focus-within:ring-primary/25",
      disabled && "opacity-65",
    )}>
      <input
        aria-label={ariaLabel || label}
        inputMode={integer ? "numeric" : "decimal"}
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        onChange={event => onChange(normalizeStepperText(event.target.value, integer))}
        onBlur={() => onBlur?.()}
        className={cn("min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/65", inputClassName)}
      />
      <div className="flex w-8 shrink-0 flex-col border-l border-border">
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || (max != null && Number(value || 0) >= max)}
          onClick={() => adjust(1)}
          aria-label="Aumentar"
          className="flex flex-1 cursor-default items-center justify-center border-b border-border text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary disabled:opacity-35"
        ><ChevronUp size={13} /></button>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || Number(value || min) <= min}
          onClick={() => adjust(-1)}
          aria-label="Diminuir"
          className="flex flex-1 cursor-default items-center justify-center text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary disabled:opacity-35"
        ><ChevronDown size={13} /></button>
      </div>
    </div>
  </div>;
}

function CatalogResults({
  open,
  loading,
  options,
  emptyLabel,
  formatCurrency,
  onSelect,
  isUnavailable,
  unavailableLabel,
  onUnavailable,
}: {
  open: boolean;
  loading: boolean;
  options: OrderCatalogOption[];
  emptyLabel: string;
  formatCurrency: (value: number) => string;
  onSelect: (option: OrderCatalogOption) => void;
  isUnavailable?: (option: OrderCatalogOption) => boolean;
  unavailableLabel?: (option: OrderCatalogOption) => string;
  onUnavailable?: (option: OrderCatalogOption) => void;
}) {
  if (!open) return null;

  return <div className="mb-2 mt-2 max-h-56 overflow-y-auto border border-border bg-popover shadow-sm">
    {loading && <div className="px-3 py-3 text-xs text-muted-foreground">Buscando...</div>}
    {!loading && options.length === 0 && <div className="px-3 py-3 text-xs text-muted-foreground">{emptyLabel}</div>}
    {!loading && options.map(option => {
      const unavailable = Boolean(isUnavailable?.(option));
      return <button
        key={option.id}
        type="button"
        aria-disabled={unavailable || undefined}
        onMouseDown={event => event.preventDefault()}
        onClick={() => unavailable ? onUnavailable?.(option) : onSelect(option)}
        className={cn(
          "flex w-full cursor-default items-start justify-between gap-4 border-b border-border px-3 py-3 text-left transition-colors last:border-b-0",
          unavailable ? "bg-muted/35 text-muted-foreground hover:bg-muted/55" : "hover:bg-primary-soft",
        )}
      >
        <span className="min-w-0">
          <span className={cn("block truncate text-sm font-semibold", unavailable ? "text-muted-foreground" : "text-foreground")}>{option.name}</span>
          {option.description && <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{option.description}</span>}
          {option.stock != null && <span className={cn("mt-0.5 block text-[10px]", option.stock <= 0 ? "font-bold text-red-600 dark:text-red-400" : "text-muted-foreground")}>Estoque: {option.stock} {option.unit}</span>}
        </span>
        <span className={cn("shrink-0 text-xs font-bold", unavailable ? "text-red-600 dark:text-red-400" : "text-primary")}>
          {unavailable
            ? unavailableLabel?.(option) || "Indisponível"
            : option.price == null
              ? "Sem preço"
              : formatCurrency(option.price)}
        </span>
      </button>;
    })}
  </div>;
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
  const names = people.filter(person => selected.includes(person.id)).map(person => person.name);
  return <details className="relative w-full">
    <summary aria-label={label} className={cn(
      "flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground marker:hidden",
      (disabled || loading) && "pointer-events-none opacity-70",
    )}>
      <span className="min-w-0 truncate" aria-live="polite">{loading ? "Carregando técnicos..." : names.length ? names.join(", ") : "Selecionar técnicos"}</span>
      <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
    </summary>
    {!disabled && !loading && <div className="relative z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-border bg-card p-2 shadow-sm">
      {people.length ? people.map(person => <label key={person.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-xs hover:bg-muted">
        <input type="checkbox" checked={selected.includes(person.id)}
          onChange={event => onChange(event.target.checked ? [...selected, person.id] : selected.filter(id => id !== person.id))}
          className="h-4 w-4 accent-primary" />
        <span className="min-w-0 break-words">{person.name}</span>
      </label>) : <p className="p-2 text-xs text-muted-foreground">Nenhum técnico ativo disponível.</p>}
    </div>}
  </details>;
}

export function OrderProductsServicesSection({ order, canEdit, formatCurrency, onPricingChange, onOverviewChange }: Props) {
  const editable = canEdit && !order?.completed_at && !order?.cancelled_at;
  const [items, setItems] = useState<OrderCommercialItem[]>([]);
  const itemsRef = useRef<OrderCommercialItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [tasks, setTasks] = useState<Record<string, OrderServiceTask>>({});
  const [technicians, setTechnicians] = useState<OrderServiceTechnician[]>([]);
  const [techniciansLoading, setTechniciansLoading] = useState(true);
  const [workflowReady, setWorkflowReady] = useState(false);
  const [taskPhotos, setTaskPhotos] = useState<OrderTaskPhoto[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const photoUrlsRef = useRef<Record<string, { url: string; expires: number }>>({});
  const [galleryItem, setGalleryItem] = useState<OrderCommercialItem | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [pricing, setPricing] = useState<OrderCommercialPricing>(() => pricingFromOrder(order));
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [productSearch, setProductSearch] = useState("");
  const [productOptions, setProductOptions] = useState<OrderCatalogOption[]>([]);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearching, setProductSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<OrderCatalogOption | null>(null);
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

  const [discountType, setDiscountType] = useState<"percentage" | "amount">(
    order?.discount_type === "amount" ? "amount" : "percentage",
  );
  const [discountValue, setDiscountValue] = useState(
    String(order?.discount_type === "amount" ? nonNegativeNumber(order?.discount_amount) : nonNegativeNumber(order?.discount_percentage)),
  );

  const applyPricing = useCallback((next: OrderCommercialPricing) => {
    setPricing(next);
    onPricingChange(next);
    setDiscountType(next.discount_type);
    setDiscountValue(String(next.discount_type === "amount" ? next.discount_amount : next.discount_percentage));
  }, [onPricingChange]);

  const refreshTaskPhotos = useCallback(async () => {
    if (!order?.id) return;
    try {
      const incoming = await listOrderTaskPhotos(order.id);
      setTaskPhotos(incoming);
      const previewPaths = incoming.filter((photo, index, all) =>
        all.filter(other => other.item_id === photo.item_id).findIndex(other => other.id === photo.id) < 2);
      const missing = previewPaths.filter(photo => !photoUrlsRef.current[photo.path] ||
        photoUrlsRef.current[photo.path].expires < Date.now());
      if (missing.length) {
        const signed = await Promise.all(missing.map(async photo => ({
          path: photo.path, url: await createOrderTaskPhotoUrl(photo.path),
        })));
        for (const entry of signed) photoUrlsRef.current[entry.path] = { url: entry.url, expires: Date.now() + 8 * 60000 };
      }
      setPhotoUrls(Object.fromEntries(Object.entries(photoUrlsRef.current).map(([path, entry]) => [path, entry.url])));
    } catch {
      // A OS continua funcional se a migração de leitura de fotos ainda não foi aplicada.
    }
  }, [order?.id]);

  const openTaskGallery = async (item: OrderCommercialItem) => {
    setGalleryItem(item);
    const missing = taskPhotos.filter(photo => photo.item_id === item.id &&
      (!photoUrlsRef.current[photo.path] || photoUrlsRef.current[photo.path].expires < Date.now()));
    try {
      const signed = await Promise.all(missing.map(async photo => ({
        path: photo.path, url: await createOrderTaskPhotoUrl(photo.path),
      })));
      for (const entry of signed) photoUrlsRef.current[entry.path] = { url: entry.url, expires: Date.now() + 8 * 60000 };
      setPhotoUrls(Object.fromEntries(Object.entries(photoUrlsRef.current).map(([path, entry]) => [path, entry.url])));
    } catch (error) {
      setMessage({ type: "error", text: systemErrorMessage(error, "Não foi possível abrir as fotos da execução.") });
    }
  };

  const publishOverview = (nextItems: OrderCommercialItem[], nextTasks: OrderServiceTask[]) => {
    const services = nextItems.filter(item => item.item_type !== "product");
    const byItem = new Map(nextTasks.map(task => [task.item_id, task.status]));
    onOverviewChange?.({
      total: nextItems.length,
      pending: services.filter(item => !byItem.has(item.id) || byItem.get(item.id) === "pending" || byItem.get(item.id) === "cancelled").length,
      inProgress: services.filter(item => byItem.get(item.id) === "in_progress").length,
      completed: services.filter(item => byItem.get(item.id) === "completed").length,
    });
  };

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
      setMessage({ type: "error", text: systemErrorMessage(error, "Não foi possível carregar os produtos e serviços da OS.") });
    } finally {
      if (!quiet) {
        setTechniciansLoading(false);
        setLoadingItems(false);
      }
    }
  }, [order?.id, editable, refreshTaskPhotos, onOverviewChange]);

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
        if (subscribed) void refreshTechnicalStatus();
      });

    const refreshOnReturn = () => { void refreshTechnicalStatus(); };
    document.addEventListener("visibilitychange", refreshOnReturn);
    window.addEventListener("online", refreshOnReturn);

    // Recuperação se o Realtime cair ou um evento for perdido. Nunca cria
    // polling de tabelas comerciais e pausa quando a aba não está visível.
    const poll = window.setInterval(() => {
      if (!subscribed || Date.now() - lastRefreshAt > 45000) {
        void refreshTechnicalStatus();
      }
    }, 15000);

    return () => {
      active = false;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", refreshOnReturn);
      window.removeEventListener("online", refreshOnReturn);
      void supabase.removeChannel(channel);
    };
  }, [order?.id, refreshTaskPhotos]);

  useEffect(() => {
    setPricing(pricingFromOrder(order));
    setDiscountType(order?.discount_type === "amount" ? "amount" : "percentage");
    setDiscountValue(String(order?.discount_type === "amount" ? nonNegativeNumber(order?.discount_amount) : nonNegativeNumber(order?.discount_percentage)));
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
    setGalleryItem(null);
    setMessage(null);
    setProductSearch("");
    setSelectedProduct(null);
    setServiceSearch("");
    setSelectedService(null);
    setServiceTechnicianIds([]);
    setCustomTechnicianIds([]);
    setWorkflowReady(false);
    setTechniciansLoading(true);
    void loadItems();
  }, [loadItems, order?.id]);

  useEffect(() => {
    if (!editable || !order?.id || !productSearchOpen || selectedProduct) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setProductSearching(true);
      try {
        const options = await searchOrderProducts(order.id, productSearch);
        if (!cancelled) setProductOptions(options);
      } catch (error) {
        if (!cancelled) setMessage({ type: "error", text: systemErrorMessage(error, "Não foi possível buscar produtos.") });
      } finally {
        if (!cancelled) setProductSearching(false);
      }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [editable, order?.id, productSearch, productSearchOpen, selectedProduct]);

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
    if (!editable || !order?.id || !serviceSearchOpen || selectedService) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setServiceSearching(true);
      try {
        const options = await searchOrderServices(order.id, serviceSearch);
        if (!cancelled) setServiceOptions(options);
      } catch (error) {
        if (!cancelled) setMessage({ type: "error", text: systemErrorMessage(error, "Não foi possível buscar serviços.") });
      } finally {
        if (!cancelled) setServiceSearching(false);
      }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [editable, order?.id, serviceSearch, serviceSearchOpen, selectedService]);

  const selectProduct = (option: OrderCatalogOption) => {
    if (option.stock != null && option.stock <= 0) {
      setMessage({ type: "error", text: `${option.name} está sem estoque disponível e não pode ser adicionado à OS.` });
      setSelectedProduct(null);
      return;
    }
    setMessage(null);
    setSelectedProduct(option);
    setProductSearch(option.name);
    setProductPrice(option.price == null ? "" : String(option.price));
    setProductQuantity("1");
    setProductSearchOpen(false);
  };

  const selectService = (option: OrderCatalogOption) => {
    if (option.price == null) {
      setMessage({ type: "error", text: `${option.name} não possui preço cadastrado. Defina o preço no cadastro do serviço antes de adicioná-lo à OS.` });
      setSelectedService(null);
      return;
    }
    setMessage(null);
    setSelectedService(option);
    setServiceSearch(option.name);
    setServicePrice(String(option.price));
    setServiceQuantity("1");
    setServiceNeedsSchedule(false);
    setServiceScheduleDraft(null);
    setServiceTechnicianIds([]);
    setServiceSearchOpen(false);
  };

  const addProduct = async () => {
    if (!selectedProduct || !order?.id) return;
    if (selectedProduct.stock != null && selectedProduct.stock <= 0) {
      setMessage({ type: "error", text: `${selectedProduct.name} está sem estoque disponível e não pode ser adicionado à OS.` });
      return;
    }
    if (productPrice.trim() === "") {
      setMessage({ type: "error", text: "Informe o preço unitário do produto." });
      return;
    }

    setMutating(true);
    setMessage(null);
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
      setMessage({ type: "success", text: "Produto adicionado à OS." });
    } catch (error) {
      setMessage({ type: "error", text: systemErrorMessage(error, "Não foi possível adicionar o produto.") });
    } finally {
      setMutating(false);
    }
  };

  const addService = async () => {
    if (!selectedService || !order?.id) return;
    if (serviceNeedsSchedule && (!serviceScheduleDraft || !serviceScheduleDraft.technicianIds.length)) {
      setMessage({ type: "error", text: "Selecione uma data, horário e técnicos disponíveis no calendário." });
      setServiceScheduleOpen(true);
      return;
    }
    setMutating(true);
    setMessage(null);
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
      setMessage({ type: "success", text: "Serviço adicionado à OS." });
    } catch (error) {
      setMessage({ type: "error", text: systemErrorMessage(error, "Não foi possível adicionar o serviço.") });
    } finally {
      setMutating(false);
    }
  };

  const addCustomService = async () => {
    if (!order?.id || !customName.trim() || customPrice.trim() === "") return;
    setMutating(true);
    setMessage(null);
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
      setMessage({ type: "success", text: "Serviço Avulso adicionado somente a esta OS." });
    } catch (error) {
      setMessage({ type: "error", text: systemErrorMessage(error, "Não foi possível adicionar o Serviço Avulso.") });
    } finally {
      setMutating(false);
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

    if (unchanged || !editable) return;

    setSavingItemId(item.id);
    setMessage(null);
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
      setMessage({ type: "error", text: systemErrorMessage(error, "Não foi possível atualizar o item.") });
      await loadItems(true);
    } finally {
      setSavingItemId(null);
    }
  };

  const removeItem = async (item: OrderCommercialItem) => {
    if (!editable) return;
    setSavingItemId(item.id);
    setMessage(null);
    try {
      const nextPricing = await deleteOrderCommercialItem(item.id);
      applyPricing(nextPricing);
      await loadItems(true);
      setMessage({ type: "success", text: "Item removido da OS." });
    } catch (error) {
      setMessage({ type: "error", text: systemErrorMessage(error, "Não foi possível remover o item.") });
    } finally {
      setSavingItemId(null);
    }
  };

  const saveTechnicianTeam = async () => {
    if (!editingTechnicianItem || !editable || !workflowReady || savingTaskId) return;
    if (tasks[editingTechnicianItem.id]?.scheduled_start_at) {
      setMessage({ type: "error", text: "Remova o agendamento antes de alterar os técnicos responsáveis." });
      return;
    }
    if (!editingTechnicianIds.length) {
      setMessage({ type: "error", text: "Selecione pelo menos um técnico responsável." });
      return;
    }
    setSavingTaskId(editingTechnicianItem.id);
    setMessage(null);
    try {
      await setOrderServiceTaskTechnicians(editingTechnicianItem.id, editingTechnicianIds);
      const next = await listOrderServiceTasks(order.id);
      setTasks(Object.fromEntries(next.map(task => [task.item_id, task])));
      setEditingTechnicianItem(null);
      setMessage({ type: "success", text: "Equipe responsável atualizada." });
    } catch (error) {
      setMessage({ type: "error", text: systemErrorMessage(error, "Não foi possível atualizar os técnicos responsáveis.") });
    } finally {
      setSavingTaskId(null);
    }
  };

  const saveServiceSchedule = async (start: string | null, end: string | null) => {
    if (!schedulingItem || !editable || scheduleSaving) return;
    setScheduleSaving(true);
    setMessage(null);
    try {
      await setOrderServiceTaskSchedule({ itemId: schedulingItem.id, startAt: start, endAt: end });
      const next = await listOrderServiceTasks(order.id);
      setTasks(Object.fromEntries(next.map(task => [task.item_id, task])));
      setSchedulingItem(null);
      setMessage({ type: "success", text: start ? "Agendamento do serviço confirmado." : "Agendamento do serviço removido." });
    } catch (error) {
      setMessage({ type: "error", text: systemErrorMessage(error, "Não foi possível agendar o serviço.") });
    } finally {
      setScheduleSaving(false);
    }
  };

  const formatServiceSchedule = (value: string | null | undefined) => value
    ? new Date(value).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      }) : "";

  const renderStatusTag = (item: OrderCommercialItem) => {
    if (item.item_type === "product") return null;
    const status = tasks[item.id]?.status || "pending";
    const labels: Record<OrderServiceTaskStatus, string> = {
      pending: "Pendente", in_progress: "Em andamento",
      completed: "Concluído", cancelled: "Cancelado",
    };
    const tones: Record<OrderServiceTaskStatus, string> = {
      pending: "border-border bg-muted/65 text-muted-foreground",
      in_progress: "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      completed: "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      cancelled: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
    };
    const icon = status === "in_progress" ? <Wrench size={12} className="shrink-0 animate-spin motion-reduce:animate-none [animation-duration:3s]" />
      : status === "completed" ? <CheckCircle2 size={12} className="shrink-0" />
      : status === "cancelled" ? <XCircle size={12} className="shrink-0" />
      : <Circle size={11} className="shrink-0" />;

    return <span role="status" className={cn(
      "inline-flex items-center gap-1.5 border px-2 py-0.5 text-[10px] font-bold",
      tones[status],
    )}>{icon}{labels[status]}</span>;
  };

  const renderItemIdentity = (item: OrderCommercialItem) => <div className="min-w-0">
    <h4 className="break-words text-sm font-bold leading-snug text-foreground sm:text-[15px]">{item.title_snapshot}</h4>
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className={cn(
        "inline-flex border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide",
        item.item_type === "product"
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-primary/25 bg-primary-soft text-primary",
      )}>{typeLabel(item)}</span>
      {renderStatusTag(item)}
    </div>
  </div>;

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
        ? <span className="text-xs text-muted-foreground">Nenhuma foto enviada.</span>
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

  const renderTaskDetails = (item: OrderCommercialItem) => {
    const task = tasks[item.id];
    const status = task?.status || "pending";
    const progress = status === "completed" ? 100 : status === "in_progress" ? 55 : 0;
    const progressTone = status === "completed" ? "bg-emerald-500"
      : status === "in_progress" ? "bg-amber-500" : "bg-muted-foreground/30";
    const locations = ([
      ["Início", task?.start_location],
      ["Conclusão", task?.finish_location],
    ] as const).filter(([, location]) => location?.lat != null && location.lng != null);
    return <div className="grid min-w-0 items-start gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(140px,.85fr)_minmax(180px,1.2fr)_minmax(150px,1fr)_minmax(120px,.75fr)] lg:gap-5">
      <div className="min-w-0">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Progresso</p>
        <div className="mb-2 flex items-center gap-2">
          {status === "in_progress" && <Wrench size={14} className="animate-spin text-amber-600 motion-reduce:animate-none [animation-duration:3s]" />}
          <span className="text-xs font-semibold text-foreground">
            {status === "pending" ? "Aguardando início" : status === "in_progress" ? "Em execução" : status === "completed" ? "Finalizado" : "Cancelado"}
          </span>
        </div>
        <div role="progressbar" aria-label={`Progresso de ${item.title_snapshot}`}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", progressTone,
            status === "in_progress" && "animate-pulse motion-reduce:animate-none")}
            style={{ width: `${progress}%` }} />
        </div>
        {!workflowReady && <p className="mt-2 text-[11px] text-muted-foreground">Aguardando dados técnicos.</p>}
      </div>
      <div className="min-w-0">
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Serviço realizado</p>
        {task?.execution_report
          ? <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">{task.execution_report}</p>
          : <p className="text-xs text-muted-foreground">Ainda não informado.</p>}
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
        </div> : <p className="text-xs text-muted-foreground">Nenhum local registrado.</p>}
      </div>
      {renderTaskPhotoPreviews(item)}
    </div>;
  };

  const applyDiscount = async () => {
    if (!order?.id || !editable) return;
    setMutating(true);
    setMessage(null);
    try {
      const nextPricing = await setOrderCommercialDiscount(order.id, discountType, nonNegativeNumber(discountValue));
      applyPricing(nextPricing);
      setMessage({ type: "success", text: "Desconto atualizado." });
    } catch (error) {
      setMessage({ type: "error", text: systemErrorMessage(error, "Não foi possível aplicar o desconto.") });
    } finally {
      setMutating(false);
    }
  };

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
      disabled={!editable || savingItemId === item.id}
      onChange={value => updateDraft(item.id, { quantity: value })}
      onBlur={() => void saveItem(item)}
      onStep={value => void saveItem(item, { quantity: value })}
      inputClassName={compact ? "py-2" : "py-1.5 text-xs"}
    />;
  };

  const renderPrice = (item: OrderCommercialItem, compact = false) => {
    const draft = drafts[item.id] || draftFromItem(item);
    if (item.item_type === "service") {
      return <div className={cn(
        INPUT,
        "flex min-h-[38px] items-center bg-muted text-sm font-semibold text-muted-foreground",
        !compact && "py-1.5 text-xs",
      )}>{formatCurrency(nonNegativeNumber(item.unit_price))}</div>;
    }

    return <FCurrencyInput
      aria-label="Preço unitário"
      placeholder="R$ 0,00"
      disabled={!editable || savingItemId === item.id}
      value={draft.unitPrice}
      onChange={(event: any) => updateDraft(item.id, { unitPrice: event.target.value })}
      onBlur={() => void saveItem(item)}
      className={compact ? "" : "h-9 py-1.5 text-xs"}
    />;
  };

  const renderAdditionalCost = (item: OrderCommercialItem, compact = false) => {
    const draft = drafts[item.id] || draftFromItem(item);
    return <FCurrencyInput
      aria-label="Custo adicional"
      placeholder="R$ 0,00"
      disabled={!editable || savingItemId === item.id}
      value={draft.additionalCost}
      onChange={(event: any) => updateDraft(item.id, { additionalCost: event.target.value })}
      onBlur={() => void saveItem(item)}
      className={compact ? "" : "h-9 py-1.5 text-xs"}
    />;
  };

  return <div className="space-y-4">
    {message && <div className={cn(
      "border px-3 py-2 text-xs font-semibold",
      message.type === "success"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
    )}>{message.text}</div>}

    {!editable && <div className="border border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
      {order?.completed_at
        ? "Esta OS está concluída. Produtos, serviços e desconto estão bloqueados para edição."
        : order?.cancelled_at
          ? "Esta OS está cancelada. Produtos, serviços e desconto estão bloqueados para edição."
          : "Você pode visualizar os valores, mas não possui permissão para alterá-los."}
    </div>}

    {editable && <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Incluir produto">
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Produto</label>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={productSearch}
                onFocus={() => setProductSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setProductSearchOpen(false), 120)}
                onChange={event => {
                  setProductSearch(event.target.value);
                  setSelectedProduct(null);
                  setProductSearchOpen(true);
                }}
                placeholder="Busque no estoque por nome ou SKU"
                className={cn(INPUT, "pl-9")}
              />
            </div>
            <CatalogResults
              open={productSearchOpen && !selectedProduct}
              loading={productSearching}
              options={productOptions}
              emptyLabel="Nenhum produto encontrado."
              formatCurrency={formatCurrency}
              onSelect={selectProduct}
              isUnavailable={option => option.stock != null && option.stock <= 0}
              unavailableLabel={() => "Sem estoque"}
              onUnavailable={option => setMessage({ type: "error", text: `${option.name} está sem estoque disponível e não pode ser adicionado à OS.` })}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-[110px_minmax(0,1fr)_auto] sm:items-end">
            <NumberStepper
              label="Quantidade"
              value={productQuantity}
              min={1}
              step={1}
              integer
              disabled={!selectedProduct}
              onChange={setProductQuantity}
            />
            <FCurrencyInput
              label="Preço unitário"
              placeholder="R$ 0,00"
              value={productPrice}
              onChange={(event: any) => setProductPrice(event.target.value)}
              disabled={!selectedProduct}
            />
            <BtnPrimary
              disabled={!selectedProduct || productPrice.trim() === "" || mutating}
              loading={mutating}
              onClick={() => void addProduct()}
              className="h-[42px]"
            ><Plus size={15} /> Adicionar</BtnPrimary>
          </div>

          {selectedProduct && <p className="pb-1 text-[10px] text-muted-foreground">
            Estoque atual: {selectedProduct.stock ?? 0} {selectedProduct.unit}. A inclusão na OS registra a cobrança; a movimentação física continua pelo fluxo de estoque/peças.
          </p>}
        </div>
      </Section>

      <Section title="Incluir serviço">
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Serviço</label>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={serviceSearch}
                onFocus={() => setServiceSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setServiceSearchOpen(false), 120)}
                onChange={event => {
                  setServiceSearch(event.target.value);
                  setSelectedService(null);
                  setServiceSearchOpen(true);
                }}
                placeholder={order?.equipment_type_id ? "Buscar serviços deste equipamento" : "Busque no catálogo de serviços"}
                className={cn(INPUT, "pl-9")}
              />
            </div>
            <CatalogResults
              open={serviceSearchOpen && !selectedService}
              loading={serviceSearching}
              options={serviceOptions}
              emptyLabel={order?.equipment_type_id ? "Nenhum serviço vinculado a este equipamento. Configure os vínculos em Equipamentos Técnicos." : "Nenhum serviço encontrado."}
              formatCurrency={formatCurrency}
              onSelect={selectService}
              isUnavailable={option => option.price == null}
              unavailableLabel={() => "Sem preço cadastrado"}
              onUnavailable={option => setMessage({ type: "error", text: `${option.name} não possui preço cadastrado. Defina o preço no cadastro do serviço antes de adicioná-lo à OS.` })}
            />
          </div>

          {editable && <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Técnicos responsáveis</label>
            <TechnicianMultiPicker
              label="Selecionar técnicos do serviço"
              people={technicians} selected={serviceTechnicianIds} onChange={setServiceTechnicianIds}
              loading={techniciansLoading}
              disabled={!workflowReady}
            />
            {!techniciansLoading && workflowReady && technicians.length === 0 && <p className="mt-2 text-xs text-muted-foreground">
              Nenhum funcionário ativo com acesso ao sistema nesta empresa.
            </p>}
            {!techniciansLoading && !workflowReady && <p className="mt-2 text-xs text-muted-foreground">A seleção de equipe está indisponível nesta OS.</p>}
          </div>}
          <div className="grid gap-3 sm:grid-cols-[110px_minmax(0,1fr)_auto] sm:items-end">
            <NumberStepper
              label="Quantidade"
              value={serviceQuantity}
              min={1}
              step={1}
              integer
              disabled={!selectedService}
              onChange={setServiceQuantity}
            />
            <FCurrencyInput
              label="Preço unitário"
              placeholder="R$ 0,00"
              value={servicePrice}
              onChange={() => undefined}
              disabled
            />
            <BtnPrimary
              disabled={!selectedService || mutating || techniciansLoading || (workflowReady && !serviceTechnicianIds.length)}
              loading={mutating}
              onClick={() => void addService()}
              className="h-[42px]"
            ><Plus size={15} /> Adicionar</BtnPrimary>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border pb-1 pt-3">
            <p className="text-[10px] leading-relaxed text-muted-foreground">O preço do serviço do catálogo é fixo nesta inclusão. Para um valor livre, use Avulso.</p>
            <AdminButton variant="secondary" disabled={mutating} onClick={() => setCustomOpen(true)} className="h-10 shrink-0 px-4"><Plus size={15} /> Avulso</AdminButton>
          </div>
        </div>
      </Section>
    </div>}

    <Section title={<span className="inline-flex items-center gap-2">Itens da OS
      <span className="inline-flex min-w-6 items-center justify-center rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary">{items.length}</span>
    </span>} flush>
      {loadingItems
        ? <div className="p-5 text-sm text-muted-foreground">Carregando itens...</div>
        : items.length === 0
          ? <div className="p-5 text-sm text-muted-foreground">Nenhum produto ou serviço foi adicionado a esta OS.</div>
          : <div className="grid min-w-0 gap-3 p-3 sm:gap-4 sm:p-4">
            {items.map(item => (
              <article key={item.id}
                aria-label={item.title_snapshot}
                className="group min-w-0 overflow-hidden rounded-xl border border-border bg-card transition-colors duration-200 hover:border-primary/40 hover:bg-muted/15 focus-within:border-primary/50">
                <div className="min-w-0 p-3.5 sm:p-4">
                  <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                    <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-5 gap-y-2">
                      <div className="min-w-[150px] flex-1">
                        {renderItemIdentity(item)}
                      </div>
                      <strong aria-label={"Total do item: " + formatCurrency(nonNegativeNumber(item.subtotal))}
                        className="inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-lg border border-border bg-muted/45 px-3 py-1.5 text-sm font-black text-emerald-700 dark:text-emerald-300">
                        {formatCurrency(nonNegativeNumber(item.subtotal))}
                      </strong>
                    </div>
                    <div className="shrink-0">
                      <AdminIconButton
                        ariaLabel={"Remover " + item.title_snapshot} variant="danger"
                        disabled={!editable || savingItemId === item.id}
                        onClick={() => void removeItem(item)}
                      ><Trash2 size={14} /></AdminIconButton>
                    </div>
                  </div>

                  <div className="mt-4 flex min-w-0 flex-col gap-3 border-t border-border/60 pt-3 lg:flex-row lg:items-center lg:gap-4">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">Quantidade:</span>
                        <div className="w-[94px] min-w-0">{renderQuantity(item, true)}</div>
                      </div>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">Preço unitário:</span>
                        <div className="w-[132px] min-w-0">{renderPrice(item, true)}</div>
                      </div>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">Custo adicional:</span>
                        <div className="w-[132px] min-w-0">{renderAdditionalCost(item, true)}</div>
                      </div>
                    </div>
                    {item.item_type !== "product" && (
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/60 pt-3 lg:min-h-9 lg:border-l lg:border-t-0 lg:py-1 lg:pl-4">
                        <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">Técnicos responsáveis:</span>
                        <div className="min-w-0 flex-1">{renderTechnicianColumn(item)}</div>
                      </div>
                    )}
                  </div>

                  {item.item_type !== "product" && workflowReady && <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Agendamento do serviço</p>
                      {tasks[item.id]?.scheduled_start_at && tasks[item.id]?.scheduled_end_at
                        ? <p className="mt-1 text-xs font-semibold text-foreground">
                            {formatServiceSchedule(tasks[item.id].scheduled_start_at)} às {new Date(tasks[item.id].scheduled_end_at!).toLocaleTimeString("pt-BR", {
                              timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit",
                            })}
                          </p>
                        : <p className="mt-1 text-xs text-muted-foreground">Não agendado.</p>}
                    </div>
                    {editable && tasks[item.id]?.status !== "completed" && tasks[item.id]?.status !== "cancelled" &&
                      <BtnSecondary onClick={() => setSchedulingItem(item)}
                        disabled={scheduleSaving}>
                        {tasks[item.id]?.scheduled_start_at ? "Reagendar" : "Agendar"}
                      </BtnSecondary>}
                  </div>}

                  {item.item_type !== "product" && (
                    <div className="mt-4 min-w-0 rounded-lg bg-muted/35 p-3 transition-colors duration-200 group-hover:bg-muted/45 sm:p-4">
                      {renderTaskDetails(item)}
                    </div>
                  )}
                </div>
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
              <strong className="text-foreground">{formatCurrency(nonNegativeNumber(pricing.parts_total))}</strong>
            </div>
            {resolutionProductsTotal > 0.009 && <div className="flex items-center justify-between gap-4 border-b border-border py-2 text-xs">
              <span className="text-muted-foreground">Inclui produtos usados na solução</span>
              <span className="font-semibold text-muted-foreground">{formatCurrency(resolutionProductsTotal)}</span>
            </div>}
            <div className="flex items-center justify-between gap-4 border-b border-border py-2">
              <span className="text-muted-foreground">Total serviços</span>
              <strong className="text-foreground">{formatCurrency(nonNegativeNumber(pricing.service_price))}</strong>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-border py-2">
              <span className="text-muted-foreground">Subtotal</span>
              <strong className="text-foreground">{formatCurrency(nonNegativeNumber(pricing.subtotal))}</strong>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-border py-2">
              <span className="text-muted-foreground">Desconto</span>
              <strong className="text-foreground">- {formatCurrency(nonNegativeNumber(pricing.discount_amount))}</strong>
            </div>
            <div className="flex items-center justify-between gap-4 pt-2">
              <span className="font-bold text-foreground">Total da OS</span>
              <strong className="text-lg font-black text-primary">{formatCurrency(nonNegativeNumber(pricing.final_total))}</strong>
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
                disabled={!editable}
                onValueChange={value => {
                  const next = value === "amount" ? "amount" : "percentage";
                  setDiscountType(next);
                  setDiscountValue("0");
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
                  disabled={!editable}
                  value={discountValue}
                  onChange={(event: any) => setDiscountValue(event.target.value)}
                />
              : <NumberStepper
                  label="Percentual (%)"
                  value={discountValue}
                  min={0}
                  max={100}
                  step={1}
                  disabled={!editable}
                  onChange={setDiscountValue}
                />}
          </div>

          {editable && <BtnSecondary
            disabled={mutating}
            loading={mutating}
            onClick={() => void applyDiscount()}
            className="mt-3 w-full"
          >Aplicar desconto</BtnSecondary>}
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
      onClose={() => { if (!mutating) setCustomOpen(false); }}
      title="Serviço Avulso"
      description="Este serviço ficará vinculado somente a esta OS e não será salvo no catálogo de serviços."
      className="max-w-xl"
      footer={<div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <BtnSecondary disabled={mutating} onClick={() => setCustomOpen(false)}>Cancelar</BtnSecondary>
        <BtnPrimary
          disabled={mutating || techniciansLoading || !customName.trim() || customPrice.trim() === "" || (workflowReady && !customTechnicianIds.length)}
          loading={mutating}
          onClick={() => void addCustomService()}
        >Adicionar serviço</BtnPrimary>
      </div>}
    >
      <div className="space-y-4">
        <FInput
          label="Nome do serviço"
          required
          value={customName}
          onChange={(event: any) => setCustomName(event.target.value)}
          placeholder="Ex.: Ajuste de conector"
        />
        <FTextarea
          label="Descrição"
          rows={4}
          value={customDescription}
          onChange={(event: any) => setCustomDescription(event.target.value)}
          placeholder="Descreva o que será executado nesta OS"
        />
        <div className="grid gap-3 sm:grid-cols-2">
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
        </div>
        {editable && <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Técnicos responsáveis</label>
          <TechnicianMultiPicker
            label="Selecionar técnicos do serviço avulso"
            people={technicians} selected={customTechnicianIds} onChange={setCustomTechnicianIds}
            loading={techniciansLoading}
            disabled={!workflowReady}
          />
        </div>}
      </div>
    </AdminDialog>
  </div>;
}
