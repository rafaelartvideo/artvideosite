export function isActiveSignatureStatus(status) {
  return status === "pending" || status === "viewed";
}

function brazilWhatsAppNumber(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function buildSignatureWhatsAppUrl(phone, link, { companyName = "Empresa", documentName = "Documento", signerName = "cliente", operatorName = "Atendente" } = {}) {
  const number = brazilWhatsAppNumber(phone);
  if (!number || !link) return "";
  const sender = String(operatorName || "Atendente").trim().split(/\s+/)[0]?.replace(/[~_*\x60]/g, "") || "Atendente";
  const senderFirstName = sender.charAt(0).toLocaleUpperCase("pt-BR") + sender.slice(1).toLocaleLowerCase("pt-BR");
  const recipientFirstName = String(signerName || "cliente").trim().split(/\s+/)[0] || "cliente";
  const message = [
    `*${senderFirstName}*`,
    `Olá, ${recipientFirstName}!`,
    `${companyName} enviou o documento ${documentName} para sua assinatura eletrônica.`,
    `Acesse para revisar e assinar:\n${link}`,
  ].join("\n\n");
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
