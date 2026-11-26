/** A confirmação de recebimento na OS não é uma baixa financeira. */
export type OrderReportedReceipt = {
  installment_number: number;
  principal_amount: number;
  payment_method_id: string;
  financial_account_id: string;
  occurred_at: string | null;
};

export function getOrderReportedReceipts(sourceDetails?: Record<string, unknown>): OrderReportedReceipt[] {
  const raw = sourceDetails?.reported_receipts;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    const installment = Number(item.installment_number);
    const amount = Number(item.principal_amount);
    if (!Number.isInteger(installment) || installment < 1 || !Number.isFinite(amount) || amount <= 0) return [];
    return [{
      installment_number: installment,
      principal_amount: amount,
      payment_method_id: typeof item.payment_method_id === "string" ? item.payment_method_id : "",
      financial_account_id: typeof item.financial_account_id === "string" ? item.financial_account_id : "",
      occurred_at: typeof item.occurred_at === "string" ? item.occurred_at : null,
    }];
  });
}


/** Preserve the actual per-installment plan; never guess a method from unrelated installments. */
export function getInstallmentPaymentPreference(sourceDetails: Record<string, unknown> | undefined, installmentNumber: number) {
  const reported = getOrderReportedReceipts(sourceDetails).find(item => item.installment_number === installmentNumber);
  const raw = sourceDetails?.payment_preferences;
  const planned = Array.isArray(raw) ? raw.find(item => item && typeof item === "object" && Number(item.installment_number) === installmentNumber) : undefined;
  return {
    payment_method_id: reported?.payment_method_id || (typeof planned?.payment_method_id === "string" ? planned.payment_method_id : ""),
    financial_account_id: reported?.financial_account_id || (typeof planned?.financial_account_id === "string" ? planned.financial_account_id : ""),
    payment_method_name_snapshot: typeof planned?.payment_method_name_snapshot === "string" ? planned.payment_method_name_snapshot : "",
    occurred_at: reported?.occurred_at || null,
  };
}

/** Existing aggregate settlements have their exact allocation in the registration event. */
export function getSettlementInstallmentAllocations(settlement: {id:string;financial_installment_id:string;principal_amount:number}, events: Array<{event_type:string;event_data:Record<string,unknown>}>) {
  const event=events.find(item=>item.event_type==="settlement_registered" && item.event_data?.settlement_id===settlement.id);
  const allocations=event?.event_data?.allocations;
  if(Array.isArray(allocations) && allocations.length) return allocations.flatMap(row=>{
    if(!row || typeof row!=="object" || typeof row.installment_id!=="string")return [];
    return [{installment_id:row.installment_id,principal:Number(row.principal||0)}];
  });
  return [{installment_id:settlement.financial_installment_id,principal:Number(settlement.principal_amount)}];
}

/** Display the methods captured at OS completion, without marking a financial settlement. */
export function getOrderPaymentMethodNames(sourceDetails: Record<string, unknown> | undefined, methods: ReadonlyArray<{id:string;name:string}>): string[] {
  const names = new Set<string>();
  const add = (id: unknown, snapshot?: unknown) => {
    const name = (typeof id === "string" ? methods.find(method => method.id === id)?.name : undefined) || (typeof snapshot === "string" ? snapshot.trim() : "");
    if (name) names.add(name);
  };
  for (const key of ["payment_preferences", "payment_plan", "reported_receipts"]) {
    const rows = sourceDetails?.[key];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (row && typeof row === "object") add(row.payment_method_id, row.payment_method_name_snapshot);
    }
  }
  return [...names];
}

/** Presentation only: reported receipts never change settlement balances or cash. */
type ReceiptEntry = {
  entry_type: string;
  origin_type: string;
  approval_status: string;
  operational_status?: string;
  original_amount: number;
  settled_amount?: number;
  source_details?: Record<string, unknown>;
};

const receiptCents = (amount: unknown) => {
  const n = Number(amount);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100)) : 0;
};

export function getDisplayReportedReceipts(entry: ReceiptEntry) {
  if (entry.entry_type !== "receivable" || entry.origin_type !== "service_order"
    || ["cancelled", "reversed", "rejected"].includes(entry.approval_status)
    || entry.operational_status === "cancelled") return new Map<number, number>();
  const amounts = new Map<number, number>();
  for (const receipt of getOrderReportedReceipts(entry.source_details)) {
    // Completion emits one report per installment; duplicates must not inflate receipts.
    amounts.set(receipt.installment_number, Math.max(amounts.get(receipt.installment_number) || 0, receiptCents(receipt.principal_amount)));
  }
  return amounts;
}

export function getInstallmentReceiptDisplay(
  installment: { installment_number: number; original_amount: number; settled_amount: number },
  reports: ReadonlyMap<number, number>,
) {
  const total = receiptCents(installment.original_amount);
  const confirmed = receiptCents(installment.settled_amount);
  const reported = Math.min(total, reports.get(installment.installment_number) || 0);
  const awaiting = Math.max(0, reported - confirmed);
  return {
    received: (confirmed + awaiting) / 100,
    confirmed: confirmed / 100,
    awaiting: awaiting / 100,
    open: Math.max(0, total - confirmed - awaiting) / 100,
  };
}

/** The paginated list has aggregate settlements, not allocations. Never add
 * aggregate confirmed and reported amounts: they may cover the same installment. */
export function getEntryReceiptDisplay(entry: ReceiptEntry) {
  const total = receiptCents(entry.original_amount);
  const confirmed = receiptCents(entry.settled_amount || 0);
  const reported = Math.min(total, [...getDisplayReportedReceipts(entry).values()].reduce((sum, amount) => sum + amount, 0));
  const fullyReported = total > 0 && reported >= total;
  const ambiguous = reported > 0 && confirmed > 0 && confirmed < total && !fullyReported;
  const received = Math.max(confirmed, reported);
  return {
    received: received / 100,
    confirmed: confirmed / 100,
    reported: reported / 100,
    awaiting: Math.max(0, reported - confirmed) / 100,
    open: Math.max(0, total - received) / 100,
    fullyReported,
    ambiguous,
  };
}
