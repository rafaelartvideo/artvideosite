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

export function buildSignatureWhatsAppUrl(phone, link, { companyName = "Empresa", documentName = "Documento", expiresAt = null } = {}) {
  const number = brazilWhatsAppNumber(phone);
  if (!number || !link) return "";
  const expiration = expiresAt
    ? new Date(expiresAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "";
  const message = [
    `Olá! ${companyName} enviou o documento “${documentName}” para sua assinatura eletrônica.`,
    expiration ? `O link é válido até ${expiration}.` : "",
    `Acesse: ${link}`,
  ].filter(Boolean).join("\n\n");
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
