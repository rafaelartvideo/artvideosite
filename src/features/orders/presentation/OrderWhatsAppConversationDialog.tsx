/** Backward-compatible OS adapter. All WhatsApp modal behavior now lives in one shared UI. */
import {
  WhatsAppConversationModal,
  type WhatsAppModalContext,
} from "@/features/whatsapp-channels/presentation/WhatsAppConversationModal";

export { TESTE_WHATSAPP_OS_ORGANIZATION_ID } from "@/features/whatsapp-channels/presentation/WhatsAppConversationModal";

export function OrderWhatsAppConversationDialog({
  open,onClose,organizationId,phone,customerName,serviceOrderId,
}: {
  open:boolean; onClose:()=>void; organizationId:string;
  phone:string; customerName:string; serviceOrderId:string;
}) {
  const context:WhatsAppModalContext = {
    organizationId,
    source:{kind:"order",orderId:serviceOrderId,phone,customerName},
  };
  return <WhatsAppConversationModal open={open} onClose={onClose} context={context}/>;
}
