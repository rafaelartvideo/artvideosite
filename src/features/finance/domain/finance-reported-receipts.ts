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
