// Formatação destinada ao WhatsApp; não duplicar o horário exibido pelo canal.
export function sacSenderFirstName(name) {
  const first = String(name || '').trim().split(/\s+/)[0]?.replace(/[~_*`]/g, '') || '';
  return first || 'Sistema';
}

export function formatSacOutgoingText(text, senderName) {
  const content = String(text || '').trim();
  if (!content) return '';
  return `*${sacSenderFirstName(senderName)}*:\n${content}`;
}
