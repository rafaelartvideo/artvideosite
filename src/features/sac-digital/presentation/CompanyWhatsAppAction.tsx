import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { adminPath } from "@/features/admin-shell/admin-routes";
import { getSacDigitalIntegrationStatus } from "../infrastructure/sac-digital.repository";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";

export function normalizeWhatsAppPhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) return `55${digits}`;
  return digits;
}

/**
 * Único ponto de decisão dos atalhos WhatsApp do CRM.
 *
 * SAC ativo: abre a tela da Union com o modal NOVA CONVERSA pré-preenchido.
 * SAC desativado: abre o WhatsApp normal, sem RPC de envio pela Union.
 * Falha na consulta: não supor que a integração está desativada.
 */
export function CompanyWhatsAppAction({
  phone, name, organizationId, children, className, title, disabled,
}: {
  phone?: string | null;
  name?: string | null;
  organizationId?: string | null;
  children: ReactNode;
  className?: string;
  title?: string;
  disabled?: boolean;
}) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const [opening, setOpening] = useState(false);
  const targetOrganization = organizationId || activeOrganizationId;
  const digits = normalizeWhatsAppPhone(phone);

  const onOpen = async () => {
    if (!digits || opening) return;
    // Abrir a aba sincronamente ao clique para não ser bloqueada pelo navegador
    // durante a consulta assíncrona ao status de integração.
    const tab = window.open("about:blank", "_blank");
    if (!tab) {
      notifyAdmin("Permita a abertura de novas abas para conversar pelo WhatsApp.", "error");
      return;
    }
    tab.opener = null;
    setOpening(true);
    try {
      if (!targetOrganization) {
        throw new Error("Selecione uma empresa para abrir o atendimento.");
      }
      const integration = await getSacDigitalIntegrationStatus(targetOrganization);
      if (tab.closed) return;
      if (integration.enabled === true) {
        if (!hasPermission("sac_digital.messages.send") || !hasPermission("sac_digital.messages.view")) {
          throw new Error("A empresa utiliza SAC Digital, mas seu usuário não possui permissão para iniciar conversas.");
        }
        const params = new URLSearchParams({
          new: "1",
          phone: digits,
          name: String(name || "").trim(),
        });
        tab.location.replace(`${adminPath("tools", "sac-digital")}?${params.toString()}`);
        return;
      }
      // WhatsApp Web/native fallback somente quando o SAC está explicitamente desativado.
      tab.location.replace(`https://wa.me/${digits}`);
    } catch (error) {
      if (!tab.closed) tab.close();
      notifyAdmin(systemErrorMessage(error, "Não foi possível verificar a integração SAC Digital."), "error");
    } finally {
      setOpening(false);
    }
  };

  return (
    <button type="button" onClick={() => void onOpen()} disabled={disabled || opening || !digits}
      title={title || "Abrir conversa pelo WhatsApp"}
      aria-label={title || "Abrir conversa pelo WhatsApp"}
      className={className}>
      {children}
    </button>
  );
}
