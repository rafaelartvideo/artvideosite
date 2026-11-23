/**
 * Modelos de termo de saída permanecem disponíveis para coleta de assinaturas
 * dentro do fluxo de encerramento. Na OS (impressão, envio e documentos)
 * só devem ser mostrados após a confirmação correspondente.
 *
 * Não tratar um orçamento rejeitado como devolução sem reparo confirmada:
 * somente os encerramentos assinados permitem publicar os termos.
 */
export function isLegacyRejectedQuoteReturn(
  order: { completed_at?: string | null; closure_outcome?: string | null } | null | undefined,
): boolean {
  return Boolean(order?.completed_at && order.closure_outcome === "rejected_quote_return");
}

export const TERMINAL_DOCUMENT_TYPES = [
  "TERMO_DESCARTE",
  "TERMO_DEVOLUCAO_SEM_REPARO",
] as const;

export function isTerminalDocumentType(documentType: string | null | undefined): boolean {
  return TERMINAL_DOCUMENT_TYPES.includes(documentType as typeof TERMINAL_DOCUMENT_TYPES[number]);
}

export function isOrderTerminalDocumentVisible(
  documentType: string | null | undefined,
  order: { completed_at?: string | null; closure_outcome?: string | null } | null | undefined,
): boolean {
  if (!isTerminalDocumentType(documentType)) return true;
  if (!order?.completed_at) return false;
  if (documentType === "TERMO_DESCARTE") return order.closure_outcome === "disposal_confirmed";
  return order.closure_outcome === "returned_unrepaired";
}

/** Regularização histórica: autoriza somente a solicitação de assinaturas.
 * A impressão do modelo genérico continua bloqueada até existir PDF assinado.
 */
export function isOrderTerminalSignatureEligible(
  documentType: string | null | undefined,
  order: { completed_at?: string | null; closure_outcome?: string | null } | null | undefined,
): boolean {
  return isOrderTerminalDocumentVisible(documentType, order)
    || (documentType === "TERMO_DEVOLUCAO_SEM_REPARO" && isLegacyRejectedQuoteReturn(order));
}
