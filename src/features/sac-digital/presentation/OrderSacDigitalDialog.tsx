import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminDialog, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { sendSacDigitalOrderMessage } from "../infrastructure/sac-digital.repository";

function orderCustomerName(order: any) {
  const customer = order?.customer || {};
  return String(
    customer.trade_name
    || customer.full_name
    || customer.legal_name
    || "",
  ).trim();
}

function initialOrderMessage(order: any) {
  const name = orderCustomerName(order);
  const firstName = name.split(/\s+/).filter(Boolean)[0] || "";
  const os = String(order?.os_number || order?.external_os_number || "").trim();
  const greeting = firstName ? `Olá, ${firstName}!` : "Olá!";
  return os
    ? `${greeting} Estamos entrando em contato sobre a OS ${os}.`
    : `${greeting} Estamos entrando em contato sobre seu atendimento.`;
}

export function OrderSacDigitalDialog({
  open,
  order,
  onClose,
}: {
  open: boolean;
  order: any;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setText(initialOrderMessage(order));
    setError("");
  }, [open, order?.id]);

  const send = async () => {
    const message = text.trim();
    if (!message || !order?.id || !order?.organization_id || sending) return;

    setSending(true);
    setError("");
    try {
      const result = await sendSacDigitalOrderMessage(
        order.organization_id,
        order.id,
        message,
      );
      notifyAdmin(
        result.mode === "protocol"
          ? "Mensagem enviada pelo atendimento SAC Digital. A conversa aparecerá na caixa de entrada após a sincronização."
          : "Mensagem enviada como notificação avulsa. A SAC ainda não abriu um protocolo; a conversa poderá aparecer quando houver atendimento.",
        "success",
      );
      onClose();
    } catch (caught) {
      setError(systemErrorMessage(caught, "Não foi possível enviar a mensagem pela SAC Digital."));
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminDialog
      open={open}
      onClose={() => {
        if (!sending) onClose();
      }}
      title="WhatsApp pelo SAC Digital"
      description="Envie a mensagem pela conta SAC Digital da empresa sem sair da OS."
      className="max-w-xl"
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <BtnSecondary onClick={onClose} disabled={sending}>
            Cancelar
          </BtnSecondary>
          <AdminButton
            onClick={() => void send()}
            loading={sending}
            loadingText="Enviando..."
            disabled={!text.trim()}
          >
            <MessageCircle size={15} />
            Enviar
          </AdminButton>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
            Atendimento
          </p>
          <p className="mt-1 text-sm font-black text-foreground">
            {orderCustomerName(order) || "Cliente"}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            OS {order?.os_number || order?.external_os_number || "sem número"}
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Mensagem
          </label>
          <textarea
            rows={6}
            maxLength={5000}
            value={text}
            disabled={sending}
            onChange={event => setText(event.target.value)}
            placeholder="Digite a mensagem para o cliente"
            className="admin-input min-h-32 w-full resize-y rounded-lg border border-border bg-card px-3 py-2.5 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <p className="mt-1 text-right text-[9px] text-muted-foreground">
            {text.length}/5000
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}
      </div>
    </AdminDialog>
  );
}
