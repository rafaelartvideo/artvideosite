// Formatação destinada ao WhatsApp; não duplicar o horário exibido pelo canal.
export function sacSenderFirstName(name) {
  const first = String(name || '').trim().split(/\s+/)[0]?.replace(/[~_*`]/g, '') || '';
  if (!first) return 'Sistema';
  const lower = first.toLocaleLowerCase('pt-BR');
  return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
}

export function formatSacOutgoingText(text, senderName) {
  const content = String(text || '').trim();
  if (!content) return '';
  return `*${sacSenderFirstName(senderName)}*\n\n${content}`;
}
