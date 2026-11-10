import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { buildInstallments } from "@/features/finance/domain/finance-integration.mjs";
import { completeServiceOrder } from "../infrastructure/orders.repository";
import { assertOrderRulesForStage } from "../infrastructure/order-rules-validation.repository";
import {
  attachOrderSituationDocument,
  getOrderPaymentProofRequirement,
  hasOrderPaymentProof,
  listAttachmentTypes,
} from "../infrastructure/order-documents.repository";
import { issueWarrantyCertificate, listWarrantyOptions, printWarrantyCertificate, type WarrantyOption, type WarrantyCertificate } from "./order-warranty";
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

function rebalanceInstallmentAmounts(
  current: OrderCompletionInstallmentDraft[],
  total: number,
): OrderCompletionInstallmentDraft[] {
  if (total <= 0) return [];
  if (!current.length) return current;
  const split = buildInstallments(total, current.length, current[0]?.due_date || todayIsoDate());
  return current.map((item, index) => ({
    ...item,
    amount: Number(split[index]?.amount || 0).toFixed(2),
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
  const queryClient = useQueryClient();
  const paymentProofRequestRef = useRef(0);
  const paymentProofRequirementRequestRef = useRef(0);
  const [paymentProofRequired, setPaymentProofRequired] = useState(false);
  const [paymentProofRequirementLoading, setPaymentProofRequirementLoading] = useState(false);
  const [paymentProofRequirementError, setPaymentProofRequirementError] = useState("");
  const [paymentProofAlreadyOnOrder, setPaymentProofAlreadyOnOrder] = useState(false);
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [paymentProofAttachmentTypeId, setPaymentProofAttachmentTypeId] = useState("");
  const [paymentProofTypeLoading, setPaymentProofTypeLoading] = useState(false);
  const [paymentProofTypeError, setPaymentProofTypeError] = useState("");
  const [paymentProofAttached, setPaymentProofAttached] = useState(false);
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
  const [warrantyOptions, setWarrantyOptions] = useState<WarrantyOption[]>([]);
  const [warrantyOptionId, setWarrantyOptionId] = useState("");
  const [warrantyLoading, setWarrantyLoading] = useState(false);
  const [warrantyError, setWarrantyError] = useState("");
  const [completedSuccessfully, setCompletedSuccessfully] = useState(false);
  const [issuedCertificate, setIssuedCertificate] = useState<WarrantyCertificate | null>(null);
  const [certificateError, setCertificateError] = useState("");
  const [certificateBusy, setCertificateBusy] = useState(false);

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

  const coverageFree = Boolean(detail?.return_root_id
    && (detail?.return_classification === "covered" || detail?.return_classification === "courtesy"));
  const returnAwaitingClassification = Boolean(detail?.return_root_id
    && (!detail?.return_classification || detail.return_classification === "analysis"));

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
  const discountAmount = coverageFree ? subtotal : discountMode === "amount"
    ? discountValue
    : discountBase * discountValue / 100;
  const discountPercentage = coverageFree ? (subtotal > 0 ? 100 : 0) : discountMode === "percentage"
    ? discountValue
    : discountBase > 0 ? discountAmount * 100 / discountBase : 0;
  const maxDiscount = discountMode === "percentage" ? maxDiscountPercentage : maxDiscountAmount;
  const discountExceedsMax = !coverageFree && discountValue > maxDiscount;
  const discountExceedsServicePrice = !coverageFree && discountAmount > discountBase + 0.009;
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

  useEffect(() => {
    if (!open || !financeEnabled || finalTotal <= 0) return;
    setInstallments(current => {
      if (!current.length) return current;
      const currentTotal = Math.round(current.reduce(
        (total, item) => total + Math.max(0, Number(item.amount) || 0),
        0,
      ) * 100) / 100;
      if (Math.abs(currentTotal - finalTotal) <= 0.009) return current;
      return rebalanceInstallmentAmounts(current, finalTotal);
    });
  }, [finalTotal, financeEnabled, open]);

  const financeValidationMessage = useMemo(() => {
    if (!financeEnabled || finalTotal <= 0) return "";
    if (financeOptionsError) return `Não foi possível carregar as opções financeiras: ${financeOptionsError}`;
    if (installments.length === 0) return "Adicione ao menos uma parcela.";
    if (installments.some(item => !item.due_date)) return "Informe o vencimento de todas as parcelas.";
    if (installments.some(item => !Number.isFinite(Number(item.amount)) || Number(item.amount) <= 0)) return "Todas as parcelas devem ter valor maior que zero.";
    if (Math.abs(installmentDifference) > 0.009) return "A soma das parcelas precisa ser igual ao valor final da OS.";
    const receivedWithoutMethod = installments.find(item => item.received && !item.payment_method_id);
    if (receivedWithoutMethod) return "Selecione a forma de recebimento das parcelas marcadas como recebidas.";
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

  const loadWarrantyOptions = async (organizationId: string, equipmentTypeId?: string) => {
    setWarrantyLoading(true);
    setWarrantyError("");
    setWarrantyOptions([]);
    setWarrantyOptionId("");
    try {
      const all = await listWarrantyOptions(organizationId);
      const matching = all.filter(option => option.equipment_type_id === equipmentTypeId);
      setWarrantyOptions(matching);
      setWarrantyOptionId((matching.find(option => option.is_default) || matching[0])?.id || "");
    } catch (error) { setWarrantyError(formatError(error)); }
    finally { setWarrantyLoading(false); }
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

  // Consulta o catálogo somente quando o operador escolhe um comprovante.
  // Reutiliza o cache da aba Documentos, evitando requests em toda abertura do modal.
  const loadPaymentProofType = async (organizationId: string, requestId: number) => {
    setPaymentProofTypeLoading(true);
    setPaymentProofTypeError("");
    try {
      const types = await queryClient.fetchQuery({
        queryKey: ["documents", organizationId, "attachment-types", "active"],
        queryFn: async () => {
          const { data, error } = await listAttachmentTypes(true, organizationId);
          if (error) throw error;
          return data || [];
        },
        staleTime: 10 * 60_000,
      });
      if (paymentProofRequestRef.current !== requestId) return;
      const type = types.find(candidate => candidate.name.trim().toLocaleLowerCase("pt-BR") === "comprovante de pagamento");
      if (!type) {
        setPaymentProofTypeError("Tipo Comprovante de pagamento não disponível para esta empresa.");
        return;
      }
      setPaymentProofAttachmentTypeId(type.id);
    } catch (error) {
      if (paymentProofRequestRef.current === requestId) {
        setPaymentProofTypeError(formatError(error));
      }
    } finally {
      if (paymentProofRequestRef.current === requestId) setPaymentProofTypeLoading(false);
    }
  };

  const loadPaymentProofRequirement = async (organizationId: string, serviceOrderId: string, requestId: number) => {
    setPaymentProofRequirementLoading(true);
    setPaymentProofRequirementError("");
    try {
      const required = await queryClient.fetchQuery({
        queryKey: ["orders", organizationId, "payment-proof-required"],
        queryFn: () => getOrderPaymentProofRequirement(organizationId),
        staleTime: 30_000,
      });
      if (paymentProofRequirementRequestRef.current !== requestId) return;
      setPaymentProofRequired(required);
      if (!required) return;

      const types = await queryClient.fetchQuery({
        queryKey: ["documents", organizationId, "attachment-types", "active"],
        queryFn: async () => {
          const { data, error } = await listAttachmentTypes(true, organizationId);
          if (error) throw error;
          return data || [];
        },
        staleTime: 10 * 60_000,
      });
      if (paymentProofRequirementRequestRef.current !== requestId) return;
      const receiptTypes = types.filter(type => type.name.trim().toLocaleLowerCase("pt-BR") === "comprovante de pagamento");
      if (!receiptTypes.length) throw new Error("O tipo de anexo Comprovante de pagamento não está disponível nesta empresa.");
      setPaymentProofAttachmentTypeId(receiptTypes[0].id);

      const alreadyOnOrder = await hasOrderPaymentProof(organizationId, serviceOrderId, receiptTypes.map(type => type.id));
      if (paymentProofRequirementRequestRef.current === requestId) setPaymentProofAlreadyOnOrder(alreadyOnOrder);
    } catch (error) {
      if (paymentProofRequirementRequestRef.current === requestId) setPaymentProofRequirementError(formatError(error));
    } finally {
      if (paymentProofRequirementRequestRef.current === requestId) setPaymentProofRequirementLoading(false);
    }
  };

  // O celular grava o comprovante diretamente em Documentos → Anexos.
  // Atualiza a exigência no modal aberto sem duplicar o arquivo nem refazer
  // cálculos financeiros ou reabrir a conclusão da OS.
  const refreshPaymentProofFromMobile = useCallback(async () => {
    if (!open || !detail?.organization_id || !detail?.id) return;
    const requestId = paymentProofRequirementRequestRef.current;
    const organizationId = String(detail.organization_id);
    const types = await queryClient.fetchQuery({
      queryKey: ["documents", organizationId, "attachment-types", "active"],
      queryFn: async () => {
        const { data, error } = await listAttachmentTypes(true, organizationId);
        if (error) throw error;
        return data || [];
      },
      staleTime: 10 * 60_000,
    });
    const receiptTypeIds = types
      .filter(type => type.name.trim().toLocaleLowerCase("pt-BR") === "comprovante de pagamento")
      .map(type => type.id);
    if (!receiptTypeIds.length) return;
    const attached = await hasOrderPaymentProof(organizationId, String(detail.id), receiptTypeIds);
    if (requestId !== paymentProofRequirementRequestRef.current) return;
    if (attached) {
      setPaymentProofAlreadyOnOrder(true);
      // A cópia móvel foi persistida e não deve ser enviada outra vez por
      // engano ao concluir; o histórico mantém o arquivo enviado.
      setPaymentProofFile(null);
      void queryClient.invalidateQueries({ queryKey: ["orders", organizationId, String(detail.id), "situation-documents"] });
    }
  }, [open, detail?.id, detail?.organization_id, queryClient]);

  const choosePaymentProof = (file: File | null) => {
    if (!file) {
      setPaymentProofFile(null);
      setPaymentProofTypeError("");
      return;
    }
    const supportedImage = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    const supportedPdf = file.type === "application/pdf" || (file.type === "" && /\.pdf$/i.test(file.name));
    if (!supportedImage && !supportedPdf) {
      showToast({ msg: "Selecione um comprovante em JPG, PNG, WebP ou PDF.", type: "error" });
      return;
    }
    if (file.size <= 0 || file.size > (supportedPdf ? 20 : 25) * 1024 * 1024) {
      showToast({ msg: supportedPdf ? "O PDF deve ter até 20 MB." : "A foto deve ter até 25 MB antes da otimização.", type: "error" });
      return;
    }
    if (!hasPermission("orders.section.images")) {
      showToast({ msg: "Seu perfil não possui permissão para anexar documentos à OS.", type: "error" });
      return;
    }
    setPaymentProofFile(file);
    if (!paymentProofAttachmentTypeId && !paymentProofTypeLoading && detail?.organization_id) {
      const requestId = ++paymentProofRequestRef.current;
      void loadPaymentProofType(String(detail.organization_id), requestId);
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
    if (target?.return_root_id && (!target?.return_classification || target.return_classification === "analysis")) {
      showToast({ msg: "Classifique a garantia do retorno antes de abrir a conclusão.", type: "error" });
      return;
    }
    const targetCoverageFree = Boolean(target?.return_root_id
      && (target.return_classification === "covered" || target.return_classification === "courtesy"));

    paymentProofRequestRef.current += 1;
    const requirementRequestId = ++paymentProofRequirementRequestRef.current;
    setPaymentProofRequired(false);
    setPaymentProofRequirementLoading(true);
    setPaymentProofRequirementError("");
    setPaymentProofAlreadyOnOrder(false);
    setPaymentProofFile(null);
    setPaymentProofAttachmentTypeId("");
    setPaymentProofTypeError("");
    setPaymentProofTypeLoading(false);
    setPaymentProofAttached(false);
    setCompletedSuccessfully(false);
    setIssuedCertificate(null);
    setCertificateError("");
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
    const targetFinalTotal = targetCoverageFree ? 0 : Math.max(0, Math.round((targetSubtotal - targetDiscountAmount) * 100) / 100);

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
    if (organizationId) {
      void loadFinanceOptions(String(organizationId));
      void loadWarrantyOptions(String(organizationId), String(target?.equipment_type_id || detail?.equipment_type_id || ""));
      if (targetCoverageFree) {
        setPaymentProofRequired(false);
        setPaymentProofRequirementLoading(false);
      } else if (targetOrderId) {
        void loadPaymentProofRequirement(String(organizationId), String(targetOrderId), requirementRequestId);
      } else {
        setPaymentProofRequirementError("Não foi possível identificar a OS.");
        setPaymentProofRequirementLoading(false);
      }
    } else {
      setPaymentProofRequirementError("Não foi possível identificar a empresa.");
      setPaymentProofRequirementLoading(false);
    }
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
    setInstallments(current => {
      if (current.length <= 1) return current;
      const remaining = current.filter(item => item.id !== id);
      return rebalanceInstallmentAmounts(remaining, finalTotal);
    });
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
    if (!financeEnabled || finalTotal <= 0) return { installments: [], payments: [] as [], reported_receipts: [], payment_plan: [], payment_preferences: [] };

    const installmentPayload = installments.map((item, index) => ({
      installment_number: index + 1,
      due_date: item.due_date,
      amount: Math.round(Number(item.amount || 0) * 100) / 100,
    }));

    const reported_receipts = installments.flatMap((item, index) => {
      if (!item.received) return [];
      return [{
        installment_number: index + 1,
        principal_amount: Math.round(Number(item.amount || 0) * 100) / 100,
        payment_method_id: item.payment_method_id,
        financial_account_id: item.financial_account_id,
        occurred_at: item.received_at ? new Date(`${item.received_at}T12:00:00`).toISOString() : null,
      }];
    });
    const payment_plan = installments.filter(item => item.payment_method_id).map(item => ({
      payment_method_id: item.payment_method_id,
      amount: Math.round(Number(item.amount || 0) * 100) / 100,
    }));
    const payment_preferences = installments.map((item, index) => ({
      installment_number: index + 1,
      payment_method_id: item.payment_method_id,
      financial_account_id: item.financial_account_id,
    }));

    return { installments: installmentPayload, payments: [] as [], reported_receipts, payment_plan, payment_preferences };
  };

  const submit = async () => {
    if (returnAwaitingClassification) {
      showToast({ msg: "Classifique a garantia do retorno antes de concluir.", type: "error" });
      return;
    }
    if (!detail?.id || completedSuccessfully || discountExceedsMax || discountExceedsServicePrice
      || (!coverageFree && Boolean(servicePriceValidationMessage)) || financeOptionsLoading || commercialItemsLoading) return;
    if (commercialPricing && commercialItemsError) {
      showToast({ msg: "Não foi possível validar Produtos e Serviços da OS: " + commercialItemsError, type: "error" });
      return;
    }
    if (financeValidationMessage) { showToast({ msg: financeValidationMessage, type: "error" }); return; }
    if (warrantyLoading || warrantyError) {
      showToast({ msg: warrantyError || "Carregando opções de garantia.", type: "error" });
      return;
    }
    if (paymentProofRequirementLoading || paymentProofRequirementError) {
      showToast({ msg: paymentProofRequirementError || "Verificando a exigência do comprovante de pagamento.", type: "error" });
      return;
    }
    if (!coverageFree && paymentProofRequired && !paymentProofFile && !paymentProofAttached && !paymentProofAlreadyOnOrder) {
      showToast({ msg: "Anexe o comprovante de pagamento antes de concluir a OS.", type: "error" });
      return;
    }
    if (paymentProofFile && (paymentProofTypeLoading || paymentProofTypeError || !paymentProofAttachmentTypeId)) {
      showToast({ msg: paymentProofTypeError || "Preparando o tipo de anexo do comprovante.", type: "error" });
      return;
    }
    setSaving(true);
    let attachingPaymentProof = Boolean(paymentProofFile && !paymentProofAttached);
    try {
      await assertOrderRulesForStage(String(detail.organization_id),String(detail.id),"finish");
      if (attachingPaymentProof && paymentProofFile) {
        if (!hasPermission("orders.section.images")) throw new Error("Você não tem permissão para anexar documentos.");
        await attachOrderSituationDocument({
          organizationId: String(detail.organization_id),
          serviceOrderId: String(detail.id),
          attachmentTypeId: paymentProofAttachmentTypeId,
          file: paymentProofFile,
          optimizePhoto: true,
        });
        // O anexo permanece vinculado mesmo se a operação financeira precisar ser repetida.
        // Limpar o arquivo evita enviar a mesma foto duas vezes em uma nova tentativa.
        setPaymentProofFile(null);
        setPaymentProofAttached(true);
        attachingPaymentProof = false;
        const documentsKey = ["orders", String(detail.organization_id), String(detail.id)];
        void queryClient.invalidateQueries({ queryKey: [...documentsKey, "situation-documents"] });
        void queryClient.invalidateQueries({ queryKey: [...documentsKey, "situation-documents-count"] });
      }

      const priceOverride = commercialPricing ? null : priceAtCompletion ? (coverageFree ? 0 : servicePrice) : null;
      const response = financeEnabled
        ? await completeServiceOrderWithFinance(detail.id, priceOverride, discountMode, discountValue, buildFinancePayload())
        : await completeServiceOrder(detail.id, priceOverride, discountMode, discountValue);
      const { data, error } = response;
      if (error) throw error;
      const financial = (data || {}) as any;
      setDetail((current: any) => ({ ...current, ...financial }));
      setOrders(current => current.map(order => order.id === detail.id ? { ...order, ...financial } : order));
      setCompletedSuccessfully(true);
      setCertificateBusy(true);
      setCertificateError("");
      try {
        const certificate = await issueWarrantyCertificate(
          String(detail.organization_id), String(detail.id), warrantyOptionId || null,
        );
        setIssuedCertificate(certificate);
      } catch (certificateFailure) {
        setCertificateError(formatError(certificateFailure));
      } finally { setCertificateBusy(false); }
      void reloadOrders().catch(error => {
        console.warn("[OS] Falha ao atualizar a lista após conclusão:", error);
      });
    } catch (error) {
      showToast({
        msg: (attachingPaymentProof ? "Não foi possível anexar o comprovante: " : "Não foi possível concluir a OS: ") + formatError(error),
        type: "error",
      });
    } finally { setSaving(false); }
  };

  const retryCertificate = async () => {
    if (!completedSuccessfully || certificateBusy || !detail?.id) return;
    setCertificateBusy(true);
    setCertificateError("");
    try {
      const certificate = await issueWarrantyCertificate(
        String(detail.organization_id), String(detail.id), warrantyOptionId || null,
      );
      setIssuedCertificate(certificate);
    } catch (error) { setCertificateError(formatError(error)); }
    finally { setCertificateBusy(false); }
  };

  const printCertificate = async () => {
    if (!completedSuccessfully || !issuedCertificate || certificateBusy) return;
    const popup = window.open("", "_blank", "width=960,height=830");
    if (!popup) {
      setCertificateError("O navegador bloqueou a janela de impressão. Permita pop-ups para este site.");
      return;
    }
    setCertificateBusy(true);
    setCertificateError("");
    try { await printWarrantyCertificate(issuedCertificate, popup); }
    catch (error) { setCertificateError(formatError(error)); }
    finally { setCertificateBusy(false); }
  };

  return {
    open, setOpen, discount, setDiscount, discountMode, setDiscountMode, discountValue, usedItems, commercialPricing,
    coverageFree, returnAwaitingClassification,
    priceAtCompletion, servicePriceInput, setServicePriceInput, servicePrice, servicePriceValidationMessage,
    partsTotal, subtotal, maxDiscount, maxDiscountPercentage, maxDiscountAmount,
    discountPercentage, discountAmount, discountExceedsMax, discountExceedsServicePrice, finalTotal,
    financeEnabled, installments, applyInstallmentCount, addInstallment, removeInstallment, updateInstallment,
    paymentProofFile, choosePaymentProof, paymentProofTypeLoading, paymentProofTypeError, paymentProofAttached,
    paymentProofRequired, paymentProofRequirementLoading, paymentProofRequirementError, paymentProofAlreadyOnOrder,
    paymentProofOrderId: detail?.id ? String(detail.id) : null,
    paymentProofOsNumber: detail?.os_number ? String(detail.os_number) : null,
    refreshPaymentProofFromMobile,
    canAttachPaymentProof: hasPermission("orders.section.images"),
    installmentTotal, installmentDifference, totalPaidNow, openAmount,
    financeOptions, financeOptionsLoading, financeOptionsError, financeValidationMessage,
    commercialItems, commercialItemsLoading, commercialItemsError,
    warrantyOptions, warrantyOptionId, setWarrantyOptionId, warrantyLoading, warrantyError,
    completedSuccessfully, issuedCertificate, certificateError, certificateBusy, retryCertificate, printCertificate,
    reloadCommercialItems: () => detail?.id ? loadCommercialItems(String(detail.id)) : Promise.resolve(),
    openCompletion, submit,
  };
}
