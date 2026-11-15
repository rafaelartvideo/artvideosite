/** User-facing outcomes from SIP final responses; no SIP credentials or phone numbers. */
export type CallTermination = {
  cause?: unknown;
  message?: { status_code?: unknown } | null;
  response?: { status_code?: unknown } | null;
  originator?: unknown;
};
export function outgoingCallFailureMessage(event: CallTermination | undefined): string {
  const raw = event?.message?.status_code ?? event?.response?.status_code;
  const status = typeof raw === 'number' && Number.isInteger(raw) ? raw : null;
  const cause = typeof event?.cause === 'string' ? event.cause.toLowerCase() : '';
  if (status === 603 || cause === 'rejected') return 'O destinatário recusou a ligação.';
  if (status === 486 || status === 600 || cause === 'busy') return 'Destino ocupado ou ligação recusada.';
  if (status === 487 || cause === 'canceled') return 'Ligação cancelada.';
  if ([408, 480, 410, 430].includes(status || 0) || cause === 'unavailable' || cause === 'no answer')
    return 'A ligação não foi atendida ou o destino está indisponível.';
  if (status === 488 || status === 606 || cause.includes('media description'))
    return 'O PABX não conseguiu negociar o áudio com o destino.';
  return 'Não foi possível completar a chamada.';
}
