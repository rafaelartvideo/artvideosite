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
