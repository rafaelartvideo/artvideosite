import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminDialog, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import {
  listSacDigitalProtocols,
  sendSacDigitalMediaMessage,
  sendSacDigitalOrderMessage,
} from "../infrastructure/sac-digital.repository";

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

function orderMessageFor(order: any, purpose: "initial" | "estimate" | "completion") {
  if (purpose === "initial") return initialOrderMessage(order);
  const name = orderCustomerName(order).split(/\s+/).filter(Boolean)[0] || "";
  const greeting = name ? `Olá, ${name}!` : "Olá!";
  const os = String(order?.os_number || order?.external_os_number || "").trim();
  const reference = os ? `a OS ${os}` : "seu atendimento";
  if (purpose === "estimate") {
    const budgetReference = os ? `da OS ${os}` : "do seu atendimento";
    return `${greeting} Gostaríamos de falar com você sobre o orçamento ${budgetReference}. Podemos esclarecer os valores e as próximas etapas por aqui.`;
  }
  return order?.completed_at
    ? `${greeting} Informamos que ${reference} foi ${os ? "concluída" : "concluído"}. Podemos combinar os próximos passos por aqui.`
    : `${greeting} Temos uma atualização sobre ${reference} e gostaríamos de confirmar os próximos passos com você.`;
}

export function OrderSacDigitalDialog({
  open,
  order,
  onClose,
  onOpenChat,
}: {
  open: boolean;
  order: any;
  onClose: () => void;
  onOpenChat?: () => void;
}) {
  const [text, setText] = useState("");
  const [purpose, setPurpose] = useState<"initial" | "estimate" | "completion">("initial");
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const sendInFlightRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setPurpose("initial");
    setText(initialOrderMessage(order));
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setError("");
  }, [open, order?.id]);

  const send = async () => {
    const message = text.trim();
    if ((!message && !attachment) || !order?.id || !order?.organization_id || sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    setSending(true);
    setError("");
    try {
      if (attachment) {
        const customerId = String(order.customer_id || "");
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(customerId)) {
          throw new Error("A OS precisa estar vinculada a um cliente válido antes de enviar documentos.");
        }
        const available = (await listSacDigitalProtocols(order.organization_id))
          .filter(item => item.contact?.customer_id === customerId
            && !item.is_pending && item.status !== "finished" && !item.closed_at
            && Boolean(item.external_protocol_id));
        if (available.length !== 1) {
          throw new Error(available.length === 0
            ? "Ainda não existe um protocolo ativo para enviar o arquivo. Use Abrir conversa para iniciar o atendimento e anexe o documento no chat."
            : "Este cliente possui mais de um atendimento ativo. Abra a conversa e escolha o protocolo correto antes de enviar o arquivo.");
        }
        await sendSacDigitalMediaMessage(
          order.organization_id,
          available[0].external_protocol_id,
          attachment,
          message,
        );
        notifyAdmin("Documento enviado pelo atendimento SAC Digital.", "success");
      } else {
        const result = await sendSacDigitalOrderMessage(
          order.organization_id,
          order.id,
          message,
        );
        notifyAdmin(
          result.mode === "protocol"
            ? "Mensagem enviada pelo atendimento SAC Digital."
            : "Mensagem inicial aceita pela SAC Digital. O atendimento será exibido como aguardando protocolo quando ainda não estiver aberto.",
          "success",
        );
      }
      onClose();
    } catch (caught) {
      setError(systemErrorMessage(caught, "Não foi possível enviar pela SAC Digital."));
    } finally {
      sendInFlightRef.current = false;
      setSending(false);
    }
  };

  return (
    <AdminDialog
      open={open}
      onClose={() => {
        if (!sending) onClose();
      }}
      title="Conversar pelo SAC Digital"
      description="Abra o atendimento existente ou envie uma mensagem sobre a OS pela conta SAC desta empresa."
      className="max-w-xl"
      footer={
        <div className="flex w-full flex-col-reverse flex-wrap gap-2 sm:flex-row sm:justify-end">
          <BtnSecondary onClick={onClose} disabled={sending}>
            Cancelar
          </BtnSecondary>
          {onOpenChat && (
            <AdminButton variant="secondary" onClick={onOpenChat} disabled={sending}>
              Abrir conversa
            </AdminButton>
          )}
          <AdminButton
            onClick={() => void send()}
            loading={sending}
            loadingText="Enviando..."
            disabled={(!text.trim() && !attachment) || sending}
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
            Tipo de mensagem
          </label>
          <select
            value={purpose}
            disabled={sending}
            onChange={event => {
              const next = event.target.value as "initial" | "estimate" | "completion";
              setPurpose(next);
              setText(orderMessageFor(order, next));
            }}
            className="admin-input mb-3 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
          >
            <option value="initial">Contato sobre a OS</option>
            <option value="estimate">Mensagem sobre orçamento</option>
            <option value="completion">Confirmação / conclusão</option>
          </select>
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
          <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <span>Revise o texto antes de enviar. A legenda é opcional ao anexar um documento.</span>
            <span className="shrink-0">{text.length}/5000</span>
          </div>

          <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/25 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-foreground">Documento / PDF</p>
                <p className="text-[10px] text-muted-foreground">
                  Envie um arquivo do seu dispositivo pelo protocolo ativo (até 25 MB; imagens até 1 MB).
                </p>
              </div>
              <BtnSecondary onClick={() => fileInputRef.current?.click()} disabled={sending}>
                Selecionar arquivo
              </BtnSecondary>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xlsx,.csv,.txt,image/*,audio/*,video/*"
              className="hidden"
              aria-label="Selecionar documento para enviar pelo SAC Digital"
              onChange={event => {
                const file = event.target.files?.[0] || null;
                if (!file) return;
                if (file.size > 25 * 1024 * 1024 || (file.type.startsWith("image/") && file.size > 1024 * 1024)) {
                  setError(file.type.startsWith("image/")
                    ? "Imagens devem ter no máximo 1 MB." : "O arquivo deve ter no máximo 25 MB.");
                  event.target.value = "";
                  return;
                }
                setError("");
                setAttachment(file);
              }}
            />
            {attachment && (
              <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate font-semibold text-foreground">{attachment.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setAttachment(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  disabled={sending}
                  className="shrink-0 text-muted-foreground underline-offset-2 hover:underline"
                >
                  Remover
                </button>
              </div>
            )}
          </div>
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
