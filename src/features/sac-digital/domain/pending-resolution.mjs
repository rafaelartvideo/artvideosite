// Uma notificação não equivale a um protocolo. Ocultá-la somente quando há
// um protocolo verdadeiro para o mesmo contato: ativo ou criado após o envio.
export function pendingStartHasProtocol(pending, protocols = []) {
  const sentAt = Date.parse(String(pending.sent_at || ""));
  return protocols.some(protocol => {
    if (protocol.is_pending || protocol.contact?.id !== pending.contact_id) return false;
    if (protocol.status !== 'finished' && !protocol.closed_at) return true;
    const openedAt = Date.parse(String(protocol.opened_at || protocol.created_at || ""));
    return Number.isFinite(sentAt) && Number.isFinite(openedAt) && openedAt >= sentAt - 30_000;
  });
}
