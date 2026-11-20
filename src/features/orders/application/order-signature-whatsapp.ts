import {
  operateUnionWhatsAppInbox,
  startUnionWhatsAppWithFirstMessage,
} from "@/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository";

/** A união usa WuzAPI; SAC Digital não é mais a integração ativa de atendimentos. */
export async function getOrderWhatsAppAvailability(organizationId: string): Promise<boolean> {
  const status = await operateUnionWhatsAppInbox(organizationId, crypto.randomUUID(), "channel_status");
  return status.channel_connected === true;
}

const normalizedPhone = (value: string) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11 ? "55" + digits : digits;
};

/**
 * Entrega o convite pelo atendimento autorizado da própria OS, sem WhatsApp Web.
 * Respeita a conta conectada, números vinculados, permissões e idempotência do envio.
 * Se a conta está ativa, falhas de autorização NÃO geram fallback externo silencioso.
 */
export async function sendOrderSignatureViaUnionWhatsApp(input: {
  organizationId: string;
  orderId: string;
  phone: string;
  signerName: string;
  message: string;
}): Promise<void> {
  const { organizationId, orderId, phone, signerName, message } = input;
  const recipients = await operateUnionWhatsAppInbox(
    organizationId, crypto.randomUUID(), "order_recipients", { service_order_id: orderId },
  );
  const target = normalizedPhone(phone);
  const matches = (recipients.recipients || []).filter(item => normalizedPhone(item.phone) === target);
  if (matches.length !== 1) {
    throw new Error(matches.length
      ? "Há mais de um vínculo para o telefone do assinante. Selecione o contato no Atendimento."
      : "O telefone do assinante não está vinculado a esta OS. Envie o link pelo atendimento após conferir o contato.");
  }
  const recipient = matches[0];
  const joined = await operateUnionWhatsAppInbox(
    organizationId, crypto.randomUUID(), "os_join", {
      service_order_id: orderId,
      ...(recipient.kind === "linked"
        ? { linked_conversation_id: recipient.conversation_id }
        : { registered_phone_field: recipient.field || "whatsapp" }),
    },
  );
  const clientMessageId = crypto.randomUUID();
  if (joined.found && joined.conversation_id) {
    const sent = await operateUnionWhatsAppInbox(
      organizationId, joined.conversation_id, "send_text", {
        text: message, client_message_id: clientMessageId,
      },
    );
    if (!sent.success) throw new Error("Não foi possível confirmar a entrega pelo atendimento.");
    return;
  }
  if (!joined.can_start) {
    throw new Error("O atendimento não permite enviar para este contato. Consulte a conversa no módulo Atendimentos.");
  }
  await startUnionWhatsAppWithFirstMessage(
    organizationId, recipient.phone, signerName || recipient.name, message, clientMessageId,
  );
}

/** Aproveita exatamente o texto personalizado já produzido pelo convite padrão. */
export function signatureInviteText(whatsAppUrl: string): string {
  const text = new URL(whatsAppUrl).searchParams.get("text")?.trim();
  if (!text) throw new Error("Não foi possível preparar a mensagem do convite.");
  return text;
}
