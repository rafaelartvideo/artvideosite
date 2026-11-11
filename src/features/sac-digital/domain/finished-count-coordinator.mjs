// O total de finalizados muda com pouca frequência em comparação aos eventos
// de mensagens. Evita COUNT(*) repetido em cada atualização da caixa.
export function shouldRefreshFinishedCount(snapshot, identity, fresh = false, now = Date.now()) {
  if (fresh || !snapshot || snapshot.identity !== identity) return true;
  const age = now - snapshot.refreshedAt;
  return age < 0 || age >= 30_000;
}
