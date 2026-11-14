import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { useWhatsAppConversationModal } from "./WhatsAppConversationModal";

/**
 * Atalho de Cadastros/Clientes para o mesmo modal usado nos detalhes da OS.
 * Envia apenas identificadores de registros; o servidor valida a empresa,
 * permissões e telefone salvo antes de localizar ou participar da conversa.
 */
export function WhatsAppContactAction({
  phone, name, organizationId, entityId, entityContactId, customerId,
  className, title, children, disabled,
}: {
  phone?: string | null;
  name?: string | null;
  organizationId?: string | null;
  entityId?: string;
  entityContactId?: string;
  customerId?: string;
  className?: string;
  title?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const { openWhatsAppConversation, whatsAppModal } = useWhatsAppConversationModal();
  const targetOrganization = organizationId || activeOrganizationId;
  const digits = String(phone || "").replace(/\D/g, "");
  const formatted = digits.length === 10 || digits.length === 11 ? "55" + digits : digits;
  const validPhone = /^55[1-9]\d{9,10}$/.test(formatted);
  const canView = hasPermission("whatsapp.inbox.view");

  // Sem permissão não mostrar um atalho que abriria um atendimento inacessível.
  if (!canView) return null;

  return <>
    <button
      type="button"
      disabled={disabled || !targetOrganization || !validPhone || !(entityId || customerId)}
      title={title || "Abrir atendimento WhatsApp"}
      aria-label={title || "Abrir atendimento WhatsApp"}
      className={className}
      onClick={() => {
        if (!targetOrganization || !validPhone || !(entityId || customerId)) return;
        openWhatsAppConversation({
          organizationId: targetOrganization,
          source: {
            kind: "contact",
            phone: formatted,
            customerName: String(name || "").trim(),
            entityId,
            entityContactId,
            customerId,
          },
        });
      }}
    >
      {children}
    </button>
    {whatsAppModal}
  </>;
}
