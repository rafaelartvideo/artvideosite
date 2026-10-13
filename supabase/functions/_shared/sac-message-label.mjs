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

// Convites de assinatura são ações humanas: usar o operador autenticado,
// sem aspas tipográficas em títulos e sem horários no corpo do WhatsApp.
export function formatSacSignatureInvite({ signerName, companyName, documentName, link }, senderName) {
  const firstName = String(signerName || '').trim().split(/\s+/)[0] || 'cliente';
  const company = String(companyName || 'Empresa').trim();
  const document = String(documentName || 'Documento').trim();
  const url = String(link || '').trim();
  return formatSacOutgoingText([
    `Olá, ${firstName}!`,
    `${company} enviou o documento ${document} para sua assinatura eletrônica.`,
    `Acesse para revisar e assinar:\n${url}`,
  ].join('\n\n'), senderName);
}
