/**
 * A falha do convite por e-mail é secundária: a solicitação e o link podem
 * existir normalmente. Não mostrar detalhes de segredos da Edge Function
 * como erro de criação de assinatura.
 *
 * @param {{
 *   link?: string | null,
 *   email_warning?: string | null,
 *   whatsapp_warning?: string | null,
 *   finalization_warning?: string | null,
 *   request?: { status?: string } | null
 * }} result
 * @returns {{ message: string, type: "success" | "error" }}
 */
export function signatureRequestCreationFeedback(result) {
  if (result.finalization_warning) {
    return {
      message: `Solicitação criada, mas houve um problema ao preparar o documento: ${result.finalization_warning}`,
      type: "error",
    };
  }
  const signed = result.request?.status === "signed";
  if (!signed && !result.link) {
    return {
      message: "Solicitação criada, mas o link de assinatura não ficou disponível. Verifique a solicitação em Documentos.",
      type: "error",
    };
  }
  if (result.whatsapp_warning) {
    return {
      message: `Solicitação criada, mas o envio pelo WhatsApp falhou: ${result.whatsapp_warning}. Use o QR Code ou copie o link para enviar manualmente.`,
      type: "error",
    };
  }
  if (result.email_warning) {
    return {
      message: signed
        ? "Documento assinado com sucesso. A cópia por e-mail não foi enviada porque o serviço de e-mail está indisponível."
        : "Assinatura criada com sucesso. Link e QR Code disponíveis; o convite por e-mail não foi enviado porque o serviço de e-mail está indisponível.",
      type: "success",
    };
  }
  return {
    message: signed
      ? "Documento gerado e assinado com sucesso."
      : "Solicitação de assinatura criada e link disponibilizado para o cliente.",
    type: "success",
  };
}
