import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { buildInstallments, normalizePaymentSplits } from "@/features/finance/domain/finance-integration.mjs";
import { completeServiceOrder } from "../infrastructure/orders.repository";
import {
  completeServiceOrderWithFinance,
  getOrderCompletionFinanceOptions,
  type OrderCompletionFinanceOptions,
} from "../infrastructure/order-finance.repository";

type Toast = { msg: string; type: "success" | "error" };
export type OrderCompletionPaymentMode = "open" | "now" | "partial";
export type OrderCompletionDiscountMode = "percentage" | "amount";
export type OrderCompletionPaymentDraft = {
  id: string;
  principal_amount: string;
  payment_method_id: string;
  financial_account_id: string;
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

let paymentSequence = 0;
function newPaymentDraft(amount = 0): OrderCompletionPaymentDraft {
  paymentSequence += 1;
  return {
    id: `payment-${Date.now()}-${paymentSequence}`,
    principal_amount: amount > 0 ? amount.toFixed(2) : "",
    payment_method_id: "",
    financial_account_id: "",
  };
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
  const [paymentMode, setPaymentModeState] = useState<OrderCompletionPaymentMode>("open");
  const [payments, setPayments] = useState<OrderCompletionPaymentDraft[]>([]);
  const [installmentCount, setInstallmentCount] = useState("1");
  const [firstDueDate, setFirstDueDate] = useState(todayIsoDate());
  const [financeOptions, setFinanceOptions] = useState<OrderCompletionFinanceOptions>(emptyFinanceOptions);
  const [financeOptionsLoading, setFinanceOptionsLoading] = useState(false);
  const [financeOptionsError, setFinanceOptionsError] = useState("");

  const financeEnabled = financeOptions.finance_enabled;
  const priceAtCompletion = Boolean(detail?.general_service?.price_at_completion);
  const configuredServicePrice = Number(detail?.general_service?.price || 0);
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

  const partsTotal = useMemo(() => usedItems.reduce((total, item) =>
    total + Number(item.total_sale_price ?? Number(item.quantity || 0) * Number(item.unit_sale_price || item.inventory_item?.sale_price || 0)), 0), [usedItems]);
  const subtotal = servicePrice + partsTotal;
  const maxDiscountPercentage = Number(detail?.general_service?.max_discount_percentage || 0);
  const maxDiscountAmount = Number(detail?.general_service?.max_discount_amount || 0);
  const discountValue = Math.max(0, Number(discount) || 0);
  const discountAmount = discountMode === "amount"
    ? discountValue
    : servicePrice * discountValue / 100;
  const discountPercentage = discountMode === "percentage"
    ? discountValue
    : servicePrice > 0 ? discountAmount * 100 / servicePrice : 0;
  const maxDiscount = discountMode === "percentage" ? maxDiscountPercentage : maxDiscountAmount;
  const discountExceedsMax = discountValue > maxDiscount;
  const discountExceedsServicePrice = discountAmount > servicePrice + 0.009;
  const finalTotal = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);

  const effectivePaymentRows = paymentMode === "open" ? [] : payments;
  const paymentSplit = useMemo(() => normalizePaymentSplits(finalTotal, effectivePaymentRows.map(item => ({
    principal_amount: Number(item.principal_amount || 0),
    payment_method_id: item.payment_method_id,
    financial_account_id: item.financial_account_id,
  }))), [finalTotal, effectivePaymentRows]);
  const totalPaidNow = paymentMode === "open" ? 0 : Number(paymentSplit.totalPaid || 0);
  const openAmount = Math.max(0, Math.round((finalTotal - totalPaidNow) * 100) / 100);

  const installmentCountNumber = Math.trunc(Number(installmentCount) || 0);
  const financeValidationMessage = useMemo(() => {
    if (financeOptionsError) return `Não foi possível carregar as opções financeiras: ${financeOptionsError}`;
    if (!financeEnabled || finalTotal <= 0) return "";
    if (paymentMode === "open") {
      if (installmentCountNumber < 1 || installmentCountNumber > 60) return "Informe entre 1 e 60 parcelas.";
      if (!firstDueDate) return "Informe o primeiro vencimento.";
      return "";
    }
    if (!paymentSplit.valid) {
      if (paymentSplit.reason === "payments_exceed_total") return "Os recebimentos imediatos ultrapassam o valor final da OS.";
      return "Preencha valor, forma de pagamento e conta em cada recebimento imediato.";
    }
    if (payments.length === 0 || totalPaidNow <= 0) return "Adicione ao menos um recebimento imediato.";
    if (paymentMode === "now" && Math.abs(totalPaidNow - finalTotal) > 0.009) return "Para receber agora, os pagamentos devem fechar o valor final da OS.";
    if (paymentMode === "partial" && (totalPaidNow >= finalTotal || openAmount <= 0)) return "No recebimento parcial, deixe um saldo maior que zero em aberto.";
    if (openAmount > 0 && (installmentCountNumber < 1 || installmentCountNumber > 60)) return "Informe entre 1 e 60 parcelas para o saldo em aberto.";
    if (openAmount > 0 && !firstDueDate) return "Informe o primeiro vencimento do saldo em aberto.";
    return "";
  }, [financeOptionsError, financeEnabled, finalTotal, paymentMode, paymentSplit, payments.length, totalPaidNow, openAmount, installmentCountNumber, firstDueDate]);

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

  const resetPaymentState = (targetTotal = finalTotal) => {
    setPaymentModeState("open");
    setPayments([]);
    setInstallmentCount("1");
    setFirstDueDate(todayIsoDate());
    setFinanceOptionsError("");
    if (targetTotal <= 0) setPayments([]);
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
    setDiscount("0");
    setDiscountModeState("percentage");
    setServicePriceInput(targetService?.price_at_completion ? "" : (targetService?.price == null ? "" : String(targetService.price)));
    resetPaymentState();
    setFinanceOptions(emptyFinanceOptions());
    setOpen(true);
    const organizationId = target?.organization_id || detail?.organization_id;
    if (organizationId) void loadFinanceOptions(String(organizationId));
  };

  const setDiscountMode = (mode: OrderCompletionDiscountMode) => {
    setDiscountModeState(mode);
    setDiscount("0");
  };

  const setPaymentMode = (mode: OrderCompletionPaymentMode) => {
    setPaymentModeState(mode);
    if (mode === "open") {
      setPayments([]);
      return;
    }
    setPayments(current => current.length ? current : [newPaymentDraft(mode === "now" ? finalTotal : 0)]);
  };

  const addPayment = () => setPayments(current => [...current, newPaymentDraft()]);
  const removePayment = (id: string) => setPayments(current => current.filter(item => item.id !== id));
  const updatePayment = (id: string, patch: Partial<OrderCompletionPaymentDraft>) => {
    setPayments(current => current.map(item => {
      if (item.id !== id) return item;
      const next = { ...item, ...patch };
      if (patch.payment_method_id !== undefined) {
        const method = financeOptions.payment_methods.find(option => option.id === patch.payment_method_id);
        if (method?.default_financial_account_id && !patch.financial_account_id) next.financial_account_id = method.default_financial_account_id;
      }
      return next;
    }));
  };

  const buildFinancePayload = () => {
    if (!financeEnabled || finalTotal <= 0) return { installments: [], payments: [] };
    const normalizedPayments = paymentMode === "open" ? [] : paymentSplit.payments;
    const installments: Array<{ installment_number: number; due_date: string; amount: number }> = [];
    let offset = 0;
    if (normalizedPayments.length > 0 && totalPaidNow > 0) {
      installments.push({ installment_number: 1, due_date: todayIsoDate(), amount: totalPaidNow });
      offset = 1;
    }
    if (openAmount > 0) {
      const openInstallments = buildInstallments(openAmount, Math.max(1, installmentCountNumber), firstDueDate);
      installments.push(...openInstallments.map(item => ({ ...item, installment_number: item.installment_number + offset })));
    }
    return {
      installments,
      payments: normalizedPayments.map(item => ({
        installment_number: 1,
        principal_amount: item.principal_amount,
        payment_method_id: item.payment_method_id,
        financial_account_id: item.financial_account_id,
        occurred_at: new Date().toISOString(),
      })),
    };
  };

  const submit = async () => {
    if (!detail?.id || discountExceedsMax || discountExceedsServicePrice || Boolean(servicePriceValidationMessage) || financeOptionsLoading) return;
    if (financeValidationMessage) {
      showToast({ msg: financeValidationMessage, type: "error" });
      return;
    }
    setSaving(true);
    try {
      const priceOverride = priceAtCompletion ? servicePrice : null;
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
    open, setOpen, discount, setDiscount, discountMode, setDiscountMode, discountValue, usedItems,
    priceAtCompletion, servicePriceInput, setServicePriceInput, servicePrice, servicePriceValidationMessage,
    partsTotal, subtotal, maxDiscount, maxDiscountPercentage, maxDiscountAmount,
    discountPercentage, discountAmount, discountExceedsMax, discountExceedsServicePrice, finalTotal,
    financeEnabled, paymentMode, setPaymentMode, payments, addPayment, removePayment, updatePayment,
    installmentCount, setInstallmentCount, firstDueDate, setFirstDueDate,
    financeOptions, financeOptionsLoading, financeOptionsError,
    totalPaidNow, openAmount, financeValidationMessage,
    openCompletion, submit,
  };
}
