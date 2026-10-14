import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, MapPin, Plus, Search, Trash2, Wrench, XCircle } from "lucide-react";
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
  listOrderServiceTasks, listOrderServiceTechnicians, setOrderServiceTask,
  type OrderServiceTask, type OrderServiceTaskStatus, type OrderServiceTechnician,
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

export function OrderProductsServicesSection({ order, canEdit, formatCurrency, onPricingChange }: Props) {
  const editable = canEdit && !order?.completed_at && !order?.cancelled_at;
  const [items, setItems] = useState<OrderCommercialItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [tasks, setTasks] = useState<Record<string, OrderServiceTask>>({});
  const [technicians, setTechnicians] = useState<OrderServiceTechnician[]>([]);
  const [workflowReady, setWorkflowReady] = useState(false);
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
  const [serviceTechnicianId, setServiceTechnicianId] = useState("");

  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customQuantity, setCustomQuantity] = useState("1");
  const [customTechnicianId, setCustomTechnicianId] = useState("");

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

  const loadItems = useCallback(async (quiet = false) => {
    if (!order?.id) return;
    if (!quiet) setLoadingItems(true);
    try {
      const next = await listOrderCommercialItems(order.id);
      setItems(next);
      setDrafts(Object.fromEntries(next.map(item => [item.id, draftFromItem(item)])));
      try {
        const nextTasks = await listOrderServiceTasks(order.id);
        setTasks(Object.fromEntries(nextTasks.map(task => [task.item_id, task])));
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
      if (!quiet) setLoadingItems(false);
    }
  }, [order?.id, editable]);

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
    setMessage(null);
    setProductSearch("");
    setSelectedProduct(null);
    setServiceSearch("");
    setSelectedService(null);
    setServiceTechnicianId("");
    setCustomTechnicianId("");
    setWorkflowReady(false);
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
    setMutating(true);
    setMessage(null);
    try {
      const nextPricing = await addOrderCatalogItem({
        serviceOrderId: order.id,
        itemType: "service",
        catalogId: selectedService.id,
        quantity: positiveInteger(serviceQuantity),
        unitPrice: null,
        technicianId: workflowReady ? serviceTechnicianId : undefined,
      });
      applyPricing(nextPricing);
      await loadItems(true);
      setServiceTechnicianId("");
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
        technicianId: workflowReady ? customTechnicianId : undefined,
      });
      applyPricing(nextPricing);
      await loadItems(true);
      setCustomTechnicianId("");
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

  const saveTask = async (item: OrderCommercialItem, employeeId: string | null, status: OrderServiceTaskStatus) => {
    if (!editable || !workflowReady || savingTaskId || item.item_type === "product") return;
    setSavingTaskId(item.id);
    setMessage(null);
    try {
      const saved = await setOrderServiceTask({ itemId: item.id, employeeId, status });
      setTasks(current => ({ ...current, [item.id]: saved }));
    } catch (error) {
      setMessage({ type: "error", text: systemErrorMessage(error, "Não foi possível atualizar o responsável ou progresso.") });
    } finally {
      setSavingTaskId(null);
    }
  };

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
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={cn(
        "inline-flex border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide",
        item.item_type === "product"
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-primary/25 bg-primary-soft text-primary",
      )}>{typeLabel(item)}</span>
      {renderStatusTag(item)}
    </div>
    <p className="mt-1.5 break-words text-sm font-semibold text-foreground">{item.title_snapshot}</p>
  </div>;

  const renderTechnicianColumn = (item: OrderCommercialItem) => {
    if (item.item_type === "product") return <span className="text-xs text-muted-foreground">—</span>;
    const task = tasks[item.id];
    const status = task?.status || "pending";
    if (!workflowReady || !editable || status === "completed") return <span className="block truncate text-xs font-semibold text-foreground">
      {task?.technician_name || "Não atribuído"}
    </span>;
    return <AdminSelect
      ariaLabel={\`Técnico responsável por \${item.title_snapshot}\`}
      value={task?.assigned_employee_id || ""}
      disabled={Boolean(savingTaskId)}
      onValueChange={value => void saveTask(item, value || null, status)}
      options={[
        { value: "", label: "Sem técnico" },
        ...technicians.map(technician => ({ value: technician.id, label: technician.name })),
      ]}
      className="min-h-9 py-1.5 text-xs"
    />;
  };

  const renderDescriptionEditor = (item: OrderCommercialItem) => {
    const draft = drafts[item.id] || draftFromItem(item);
    return <input
      aria-label={\`Descrição de \${item.title_snapshot}\`}
      disabled={!editable || savingItemId === item.id}
      value={draft.description}
      onChange={event => updateDraft(item.id, { description: event.target.value })}
      onBlur={() => void saveItem(item)}
      placeholder="Breve descrição do item (opcional)"
      className="w-full min-w-0 border-0 border-b border-dashed border-border bg-transparent py-1 text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary"
    />;
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
    return <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(170px,210px)_minmax(0,1fr)_minmax(0,260px)] lg:gap-6">
      <div className="min-w-0">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Progresso</p>
        <div className="mb-2 flex items-center gap-2">
          {status === "in_progress" && <Wrench size={14} className="animate-spin text-amber-600 motion-reduce:animate-none [animation-duration:3s]" />}
          <span className="text-xs font-semibold text-foreground">
            {status === "pending" ? "Aguardando início" : status === "in_progress" ? "Em execução" : status === "completed" ? "Finalizado" : "Cancelado"}
          </span>
        </div>
        <div role="progressbar" aria-label={\`Progresso de \${item.title_snapshot}\`}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", progressTone,
            status === "in_progress" && "animate-pulse motion-reduce:animate-none")}
            style={{ width: \`\${progress}%\` }} />
        </div>
        {!workflowReady && <p className="mt-2 text-[11px] text-muted-foreground">Aguardando dados técnicos.</p>}
      </div>
      <div className="min-w-0">
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Serviço realizado</p>
        {task?.execution_report
          ? <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">{task.execution_report}</p>
          : <p className="text-xs text-muted-foreground">Ainda não informado.</p>}
        <div className="mt-2 max-w-xl">{renderDescriptionEditor(item)}</div>
      </div>
      <div className="min-w-0">
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Localizações</p>
        {locations.length ? <div className="flex flex-wrap gap-x-4 gap-y-2">
          {locations.map(([label, location]) => <a
            key={label}
            href={\`https://www.google.com/maps?q=\${encodeURIComponent(\`\${location!.lat},\${location!.lng}\`)}\`}
            target="_blank" rel="noreferrer"
            title={\`Abrir localização de \${label.toLocaleLowerCase("pt-BR")} no mapa\`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          ><MapPin size={14} className="shrink-0" />
            {label}
            {location?.accuracy_m != null && <span className="font-normal text-muted-foreground">±{Math.round(location.accuracy_m)} m</span>}
          </a>)}
        </div> : <p className="text-xs text-muted-foreground">Nenhum local registrado.</p>}
      </div>
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

          {workflowReady && <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Técnico responsável</label>
            <AdminSelect
              value={serviceTechnicianId}
              onValueChange={setServiceTechnicianId}
              options={[
                { value: "", label: "Selecione o técnico responsável" },
                ...technicians.map(technician => ({ value: technician.id, label: technician.name })),
              ]}
            />
            {technicians.length === 0 && <p className="mt-2 text-xs text-muted-foreground">
              Nenhum funcionário ativo com acesso ao sistema nesta empresa.
            </p>}
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
              disabled={!selectedService || mutating || (workflowReady && !serviceTechnicianId)}
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

    <Section title="Itens da OS" flush>
      {loadingItems
        ? <div className="p-5 text-sm text-muted-foreground">Carregando itens...</div>
        : items.length === 0
          ? <div className="p-5 text-sm text-muted-foreground">Nenhum produto ou serviço foi adicionado a esta OS.</div>
          : <>
            <div className="hidden md:block">
              <div className="grid grid-cols-[minmax(250px,1fr)_150px_140px_140px_120px_44px] items-center gap-4 border-b border-border px-5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                <span>Item</span>
                <span className="text-center">Quantidade</span>
                <span>Preço unitário</span>
                <span>Custo adicional</span>
                <span className="text-right">Subtotal</span>
                <span className="text-center">Ações</span>
              </div>

              <div className="divide-y divide-border">
                {items.map(item => {
                  const draft = drafts[item.id] || draftFromItem(item);
                  return <div
                    key={item.id}
                    className="grid grid-cols-[minmax(250px,1fr)_150px_140px_140px_120px_44px] items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/35"
                  >
                    <div className="min-w-0">
                      <span className={cn(
                        "inline-flex border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide",
                        item.item_type === "product"
                          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "border-primary/25 bg-primary-soft text-primary",
                      )}>{typeLabel(item)}</span>
                      <p className="mt-1.5 truncate text-sm font-semibold text-foreground">{item.title_snapshot}</p>
                      {renderServiceTask(item)}
                      <input
                        aria-label={`Descrição de ${item.title_snapshot}`}
                        disabled={!editable || savingItemId === item.id}
                        value={draft.description}
                        onChange={event => updateDraft(item.id, { description: event.target.value })}
                        onBlur={() => void saveItem(item)}
                        placeholder="Breve descrição (opcional)"
                        className="mt-1 w-full border-0 border-b border-dashed border-border bg-transparent px-0 py-1 text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/55 focus:border-primary"
                      />
                    </div>

                    <div>{renderQuantity(item)}</div>
                    <div>{renderPrice(item)}</div>
                    <div>{renderAdditionalCost(item)}</div>
                    <div className="text-right">
                      <span className="inline-flex bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-700 dark:text-emerald-300">{formatCurrency(nonNegativeNumber(item.subtotal))}</span>
                    </div>
                    <div className="text-center">
                      <AdminIconButton
                        ariaLabel="Remover item"
                        variant="danger"
                        disabled={!editable || savingItemId === item.id}
                        onClick={() => void removeItem(item)}
                      ><Trash2 size={14} /></AdminIconButton>
                    </div>
                  </div>;
                })}
              </div>
            </div>

            <div className="divide-y divide-border md:hidden">
              {items.map(item => {
                const draft = drafts[item.id] || draftFromItem(item);
                return <div key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className={cn(
                        "inline-flex border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide",
                        item.item_type === "product"
                          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "border-primary/25 bg-primary-soft text-primary",
                      )}>{typeLabel(item)}</span>
                      <p className="mt-1.5 break-words text-sm font-semibold text-foreground">{item.title_snapshot}</p>
                    </div>
                    <AdminIconButton
                      ariaLabel="Remover item"
                      variant="danger"
                      disabled={!editable || savingItemId === item.id}
                      onClick={() => void removeItem(item)}
                    ><Trash2 size={14} /></AdminIconButton>
                  </div>

                  {renderServiceTask(item)}
                  <div className="mt-3">
                    <FInput
                      label="Descrição"
                      disabled={!editable || savingItemId === item.id}
                      value={draft.description}
                      onChange={(event: any) => updateDraft(item.id, { description: event.target.value })}
                      onBlur={() => void saveItem(item)}
                      placeholder="Breve descrição (opcional)"
                    />
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Quantidade</label>
                      {renderQuantity(item, true)}
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Preço unitário</label>
                      {renderPrice(item, true)}
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Custo adicional</label>
                      {renderAdditionalCost(item, true)}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs">
                    <span className="text-muted-foreground">Subtotal</span>
                    <strong className="text-emerald-700 dark:text-emerald-300">{formatCurrency(nonNegativeNumber(item.subtotal))}</strong>
                  </div>
                </div>;
              })}
            </div>
          </>}
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

    <AdminDialog
      open={customOpen}
      onClose={() => { if (!mutating) setCustomOpen(false); }}
      title="Serviço Avulso"
      description="Este serviço ficará vinculado somente a esta OS e não será salvo no catálogo de serviços."
      className="max-w-xl"
      footer={<div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <BtnSecondary disabled={mutating} onClick={() => setCustomOpen(false)}>Cancelar</BtnSecondary>
        <BtnPrimary
          disabled={mutating || !customName.trim() || customPrice.trim() === "" || (workflowReady && !customTechnicianId)}
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
        {workflowReady && <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Técnico responsável</label>
          <AdminSelect
            value={customTechnicianId}
            onValueChange={setCustomTechnicianId}
            options={[
              { value: "", label: "Selecione o técnico responsável" },
              ...technicians.map(technician => ({ value: technician.id, label: technician.name })),
            ]}
          />
        </div>}
      </div>
    </AdminDialog>
  </div>;
}
