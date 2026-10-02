import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { buildInstallments } from "@/features/finance/domain/finance-integration.mjs";
import { completeServiceOrder } from "../infrastructure/orders.repository";
import {
  completeServiceOrderWithFinance,
  getOrderCompletionFinanceOptions,
  type OrderCompletionFinanceOptions,
} from "../infrastructure/order-finance.repository";
import {
  listOrderCommercialItems,
  type OrderCommercialItem,
} from "../infrastructure/order-commercial-items.repository";

type Toast = { msg: string; type: "success" | "error" };
export type OrderCompletionDiscountMode = "percentage" | "amount";

export type OrderCompletionInstallmentDraft = {
  id: string;
  amount: string;
  due_date: string;
  payment_method_id: string;
  financial_account_id: string;
  received: boolean;
  received_at: string;
};

function isOrderOverride(value: unknown): value is Record<string, any> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, any>;
  return typeof candidate.id === "string" && (
    "is_solved" in candidate
    || "completed_at" in candidate
    || "os_number" in candidate
  );
}

function todayIsoDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function addMonthsClamped(dateText: string, months: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateText || ""));
  if (!match) return todayIsoDate();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const targetYear = first.getUTCFullYear();
  const targetMonth = first.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

let installmentSequence = 0;
function installmentId() {
  installmentSequence += 1;
  return `installment-${Date.now()}-${installmentSequence}`;
}

function emptyInstallment(overrides: Partial<OrderCompletionInstallmentDraft> = {}): OrderCompletionInstallmentDraft {
  return {
    id: installmentId(),
    amount: "",
    due_date: todayIsoDate(),
    payment_method_id: "",
    financial_account_id: "",
    received: false,
    received_at: todayIsoDate(),
    ...overrides,
  };
}

function splitInstallments(
  total: number,
  count: number,
  firstDueDate: string,
  template?: Partial<OrderCompletionInstallmentDraft>,
): OrderCompletionInstallmentDraft[] {
  const normalizedCount = Math.max(1, Math.min(60, Math.trunc(count || 1)));
  if (total <= 0) return [];
  return buildInstallments(total, normalizedCount, firstDueDate).map((item, index) => emptyInstallment({
    amount: Number(item.amount || 0).toFixed(2),
    due_date: item.due_date,
    payment_method_id: template?.payment_method_id || "",
    financial_account_id: template?.financial_account_id || "",
    received: index === 0 ? Boolean(template?.received) : false,
    received_at: index === 0 && template?.received_at ? template.received_at : todayIsoDate(),
  }));
}

const emptyFinanceOptions = (): OrderCompletionFinanceOptions => ({
  finance_enabled: false,
  accounts: [],
  payment_methods: [],
});

export function useOrderCompletion({
  detail,
  usedItems,
  setDetail,
  setOrders,
  reloadOrders,
  hasPermission,
  showToast,
  formatError,
  setSaving,
}: {
  detail: any;
  usedItems: any[];
  setDetail: Dispatch<SetStateAction<any>>;
  setOrders: Dispatch<SetStateAction<any[]>>;
  reloadOrders: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  showToast: (toast: Toast) => void;
  formatError: (error: unknown) => string;
  setSaving: Dispatch<SetStateAction<boolean>>;
}) {
  const [open, setOpen] = useState(false);
  const [discount, setDiscount] = useState("0");
  const [discountMode, setDiscountModeState] = useState<OrderCompletionDiscountMode>("percentage");
  const [servicePriceInput, setServicePriceInput] = useState("");
  const [installments, setInstallments] = useState<OrderCompletionInstallmentDraft[]>([]);
  const [financeOptions, setFinanceOptions] = useState<OrderCompletionFinanceOptions>(emptyFinanceOptions);
  const [financeOptionsLoading, setFinanceOptionsLoading] = useState(false);
  const [financeOptionsError, setFinanceOptionsError] = useState("");
  const [commercialItems, setCommercialItems] = useState<OrderCommercialItem[]>([]);
  const [commercialItemsLoading, setCommercialItemsLoading] = useState(false);
  const [commercialItemsError, setCommercialItemsError] = useState("");

  const financeEnabled = financeOptions.finance_enabled;
  const commercialPricing = Boolean(detail?.commercial_pricing_enabled);
  const priceAtCompletion = !commercialPricing && Boolean(detail?.general_service?.price_at_completion);
  const configuredServicePrice = commercialPricing
    ? Number(detail?.service_price || 0)
    : Number(detail?.general_service?.price || 0);
  const parsedServicePriceInput = Number(servicePriceInput);
  const servicePrice = priceAtCompletion
    ? (Number.isFinite(parsedServicePriceInput) ? Math.max(0, parsedServicePriceInput) : 0)
    : configuredServicePrice;
  const servicePriceValidationMessage = priceAtCompletion
    ? servicePriceInput.trim() === ""
      ? "Informe o valor do serviço."
      : !Number.isFinite(parsedServicePriceInput) || parsedServicePriceInput < 0
        ? "Informe um valor de serviço válido."
        : ""
    : "";

  const legacyPartsTotal = useMemo(() => usedItems.reduce((total, item) =>
    total + Number(item.total_sale_price ?? Number(item.quantity || 0) * Number(item.unit_sale_price || item.inventory_item?.sale_price || 0)), 0), [usedItems]);
  const partsTotal = commercialPricing ? Number(detail?.parts_total || 0) : legacyPartsTotal;
  const subtotal = commercialPricing
    ? (detail?.subtotal == null ? servicePrice + partsTotal : Number(detail.subtotal || 0))
    : servicePrice + partsTotal;
  const discountBase = commercialPricing ? subtotal : servicePrice;
  const maxDiscountPercentage = commercialPricing ? 100 : Number(detail?.general_service?.max_discount_percentage || 0);
  const maxDiscountAmount = commercialPricing ? subtotal : Number(detail?.general_service?.max_discount_amount || 0);
  const discountValue = Math.max(0, Number(discount) || 0);
  const discountAmount = discountMode === "amount"
    ? discountValue
    : discountBase * discountValue / 100;
  const discountPercentage = discountMode === "percentage"
    ? discountValue
    : discountBase > 0 ? discountAmount * 100 / discountBase : 0;
  const maxDiscount = discountMode === "percentage" ? maxDiscountPercentage : maxDiscountAmount;
  const discountExceedsMax = discountValue > maxDiscount;
  const discountExceedsServicePrice = discountAmount > discountBase + 0.009;
  const finalTotal = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);

  const installmentTotal = useMemo(
    () => Math.round(installments.reduce((total, item) => total + Math.max(0, Number(item.amount) || 0), 0) * 100) / 100,
    [installments],
  );
  const installmentDifference = Math.round((finalTotal - installmentTotal) * 100) / 100;
  const totalPaidNow = useMemo(
    () => Math.round(installments.reduce((total, item) => item.received ? total + Math.max(0, Number(item.amount) || 0) : total, 0) * 100) / 100,
    [installments],
  );
  const openAmount = Math.max(0, Math.round((finalTotal - totalPaidNow) * 100) / 100);

  const financeValidationMessage = useMemo(() => {
    if (financeOptionsError) return `Não foi possível carregar as opções financeiras: ${financeOptionsError}`;
    if (!financeEnabled || finalTotal <= 0) return "";
    if (installments.length === 0) return "Adicione ao menos uma parcela.";
    if (installments.some(item => !item.due_date)) return "Informe o vencimento de todas as parcelas.";
    if (installments.some(item => !Number.isFinite(Number(item.amount)) || Number(item.amount) <= 0)) return "Todas as parcelas devem ter valor maior que zero.";
    if (Math.abs(installmentDifference) > 0.009) return "A soma das parcelas precisa ser igual ao valor final da OS.";
    const receivedWithoutMethod = installments.find(item => item.received && !item.payment_method_id);
    if (receivedWithoutMethod) return "Selecione a forma de recebimento das parcelas marcadas como recebidas.";
    const receivedWithoutAccount = installments.find(item => item.received && !item.financial_account_id);
    if (receivedWithoutAccount) return "Não há conta financeira definida para uma parcela recebida.";
    const receivedWithoutDate = installments.find(item => item.received && !item.received_at);
    if (receivedWithoutDate) return "Informe a data de recebimento das parcelas recebidas.";
    return "";
  }, [financeOptionsError, financeEnabled, finalTotal, installments, installmentDifference]);

  const loadCommercialItems = async (serviceOrderId: string) => {
    setCommercialItemsLoading(true);
    setCommercialItemsError("");
    try {
      setCommercialItems(await listOrderCommercialItems(serviceOrderId));
    } catch (error) {
      setCommercialItems([]);
      setCommercialItemsError(formatError(error));
    } finally {
      setCommercialItemsLoading(false);
    }
  };

  const loadFinanceOptions = async (organizationId: string) => {
    setFinanceOptionsLoading(true);
    setFinanceOptionsError("");
    setFinanceOptions(emptyFinanceOptions());
    try {
      setFinanceOptions(await getOrderCompletionFinanceOptions(organizationId));
    } catch (error) {
      setFinanceOptions(emptyFinanceOptions());
      setFinanceOptionsError(formatError(error));
    } finally {
      setFinanceOptionsLoading(false);
    }
  };

  const resetPaymentState = (targetTotal: number) => {
    setInstallments(targetTotal > 0 ? splitInstallments(targetTotal, 1, todayIsoDate()) : []);
    setFinanceOptionsError("");
  };

  const openCompletion = (orderOverride?: unknown) => {
    const target = isOrderOverride(orderOverride) ? orderOverride : detail;
    if (!hasPermission("orders.complete")) {
      showToast({ msg: "Você não possui permissão para concluir a OS.", type: "error" });
      return;
    }
    if (!target?.is_solved) {
      showToast({ msg: "Resolva a OS antes de concluir.", type: "error" });
      return;
    }
    if (target?.completed_at) {
      showToast({ msg: "Esta OS já foi concluída.", type: "error" });
      return;
    }

    const targetService = target?.general_service || detail?.general_service;
    const targetCommercialPricing = Boolean(target?.commercial_pricing_enabled ?? detail?.commercial_pricing_enabled);
    const targetDiscountMode: OrderCompletionDiscountMode = targetCommercialPricing && (target?.discount_type || detail?.discount_type) === "amount" ? "amount" : "percentage";
    const targetDiscountValue = targetCommercialPricing
      ? targetDiscountMode === "amount"
        ? Number(target?.discount_amount ?? detail?.discount_amount ?? 0)
        : Number(target?.discount_percentage ?? detail?.discount_percentage ?? 0)
      : 0;
    const targetServicePrice = targetCommercialPricing
      ? Number(target?.service_price ?? detail?.service_price ?? 0)
      : Number(targetService?.price || 0);
    const targetPartsTotal = targetCommercialPricing
      ? Number(target?.parts_total ?? detail?.parts_total ?? 0)
      : legacyPartsTotal;
    const targetSubtotal = targetCommercialPricing
      ? Number(target?.subtotal ?? detail?.subtotal ?? (targetServicePrice + targetPartsTotal))
      : targetServicePrice + targetPartsTotal;
    const targetDiscountBase = targetCommercialPricing ? targetSubtotal : targetServicePrice;
    const targetDiscountAmount = targetDiscountMode === "amount"
      ? targetDiscountValue
      : targetDiscountBase * targetDiscountValue / 100;
    const targetFinalTotal = Math.max(0, Math.round((targetSubtotal - targetDiscountAmount) * 100) / 100);

    setDiscount(String(targetDiscountValue));
    setDiscountModeState(targetDiscountMode);
    setServicePriceInput(targetCommercialPricing ? String(targetServicePrice) : (targetService?.price_at_completion ? "" : (targetService?.price == null ? "" : String(targetService.price))));
    resetPaymentState(targetFinalTotal);
    setFinanceOptions(emptyFinanceOptions());
    setCommercialItems([]);
    setCommercialItemsError("");
    setOpen(true);

    const targetOrderId = target?.id || detail?.id;
    if (targetOrderId) void loadCommercialItems(String(targetOrderId));
    const organizationId = target?.organization_id || detail?.organization_id;
    if (organizationId) void loadFinanceOptions(String(organizationId));
  };

  const setDiscountMode = (mode: OrderCompletionDiscountMode) => {
    setDiscountModeState(mode);
    setDiscount("0");
  };

  const applyInstallmentCount = (count: number) => {
    if (finalTotal <= 0) {
      setInstallments([]);
      return;
    }
    const template = installments[0];
    const firstDueDate = template?.due_date || todayIsoDate();
    setInstallments(splitInstallments(finalTotal, count, firstDueDate, template));
  };

  const addInstallment = () => {
    const last = installments[installments.length - 1];
    const dueDate = last?.due_date ? addMonthsClamped(last.due_date, 1) : todayIsoDate();
    setInstallments(current => [...current, emptyInstallment({
      due_date: dueDate,
      payment_method_id: last?.payment_method_id || "",
      financial_account_id: last?.financial_account_id || "",
    })]);
  };

  const removeInstallment = (id: string) => {
    setInstallments(current => current.length <= 1 ? current : current.filter(item => item.id !== id));
  };

  const updateInstallment = (id: string, patch: Partial<OrderCompletionInstallmentDraft>) => {
    setInstallments(current => current.map(item => {
      if (item.id !== id) return item;
      const next = { ...item, ...patch };

      if (patch.payment_method_id !== undefined) {
        const method = financeOptions.payment_methods.find(option => option.id === patch.payment_method_id);
        next.financial_account_id = method?.default_financial_account_id
          || next.financial_account_id
          || financeOptions.accounts[0]?.id
          || "";
      }

      if (patch.received === true && !next.received_at) next.received_at = todayIsoDate();
      return next;
    }));
  };

  const buildFinancePayload = () => {
    if (!financeEnabled || finalTotal <= 0) return { installments: [], payments: [] };

    const installmentPayload = installments.map((item, index) => ({
      installment_number: index + 1,
      due_date: item.due_date,
      amount: Math.round(Number(item.amount || 0) * 100) / 100,
    }));

    const payments = installments.flatMap((item, index) => {
      if (!item.received) return [];
      return [{
        installment_number: index + 1,
        principal_amount: Math.round(Number(item.amount || 0) * 100) / 100,
        payment_method_id: item.payment_method_id,
        financial_account_id: item.financial_account_id,
        occurred_at: item.received_at ? new Date(`${item.received_at}T12:00:00`).toISOString() : null,
      }];
    });

    return { installments: installmentPayload, payments };
  };

  const submit = async () => {
    if (!detail?.id || discountExceedsMax || discountExceedsServicePrice || Boolean(servicePriceValidationMessage) || financeOptionsLoading || commercialItemsLoading) return;
    if (commercialPricing && commercialItemsError) {
      showToast({ msg: `Não foi possível validar os Produtos e Serviços da OS: ${commercialItemsError}`, type: "error" });
      return;
    }
    if (financeValidationMessage) {
      showToast({ msg: financeValidationMessage, type: "error" });
      return;
    }

    setSaving(true);
    try {
      const priceOverride = commercialPricing ? null : priceAtCompletion ? servicePrice : null;
      const response = financeEnabled
        ? await completeServiceOrderWithFinance(detail.id, priceOverride, discountMode, discountValue, buildFinancePayload())
        : await completeServiceOrder(detail.id, priceOverride, discountMode, discountValue);
      const { data, error } = response;
      if (error) throw error;
      const financial = (data || {}) as any;
      setDetail((current: any) => ({ ...current, ...financial }));
      setOrders(current => current.map(order => order.id === detail.id ? { ...order, ...financial } : order));
      setOpen(false);
      showToast({ msg: financeEnabled ? "OS concluída e integrada ao Financeiro com sucesso." : "OS concluída com sucesso.", type: "success" });
      await reloadOrders();
    } catch (error) {
      showToast({ msg: `Não foi possível concluir a OS: ${formatError(error)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return {
    open, setOpen, discount, setDiscount, discountMode, setDiscountMode, discountValue, usedItems, commercialPricing,
    priceAtCompletion, servicePriceInput, setServicePriceInput, servicePrice, servicePriceValidationMessage,
    partsTotal, subtotal, maxDiscount, maxDiscountPercentage, maxDiscountAmount,
    discountPercentage, discountAmount, discountExceedsMax, discountExceedsServicePrice, finalTotal,
    financeEnabled, installments, applyInstallmentCount, addInstallment, removeInstallment, updateInstallment,
    installmentTotal, installmentDifference, totalPaidNow, openAmount,
    financeOptions, financeOptionsLoading, financeOptionsError, financeValidationMessage,
    commercialItems, commercialItemsLoading, commercialItemsError,
    reloadCommercialItems: () => detail?.id ? loadCommercialItems(String(detail.id)) : Promise.resolve(),
    openCompletion, submit,
  };
}
