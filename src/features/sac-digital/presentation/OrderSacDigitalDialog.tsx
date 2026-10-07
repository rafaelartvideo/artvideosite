import { mediaMaximum } from '../domain/resource-ui.mjs';
import { PRINT_TEMPLATE_TYPE_LABELS, type PrintTemplate } from "@/features/documents/domain/print-template";
import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { FSelect, FTextarea } from '@/shared/ui/admin/AdminFormControls';
import { AdminButton, AdminDialog, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import {
  DEFAULT_SAC_ORDER_MESSAGE_PRESETS,
  listSacDigitalOrderMessagePresets,
  listSacDigitalProtocols,
  sendSacDigitalMediaMessage,
  sendSacDigitalOrderMessage,
  type SacDigitalOrderMessagePreset,
  type SacDigitalOrderMessagePresetKey,
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

function renderOrderMessage(template: string, order: any) {
  const fullName = orderCustomerName(order);
  const firstName = fullName.split(/\s+/).filter(Boolean)[0] || "cliente";
  const os = String(order?.os_number || order?.external_os_number || "").trim() || "—";
  return String(template || "")
    .replaceAll("{primeiro_nome}", firstName)
    .replaceAll("{nome_cliente}", fullName || firstName)
    .replaceAll("{os}", os);
}

function presetMessage(
  presets: SacDigitalOrderMessagePreset[],
  key: SacDigitalOrderMessagePresetKey,
  order: any,
) {
  const preset = presets.find(item => item.preset_key === key)
    || DEFAULT_SAC_ORDER_MESSAGE_PRESETS.find(item => item.preset_key === key)
    || DEFAULT_SAC_ORDER_MESSAGE_PRESETS[0];
  return renderOrderMessage(preset.message_template, order);
}

export function OrderSacDigitalDialog({
  open,
  order,
  onClose,
  onOpenChat,
  documentTemplates = [],
  onBuildDocument,
}: {
  open: boolean;
  order: any;
  onClose: () => void;
  onOpenChat?: () => void;
  documentTemplates?: PrintTemplate[];
  onBuildDocument?: (templateId: string) => Promise<File>;
}) {
  const [text, setText] = useState("");
  const [purpose, setPurpose] = useState<SacDigitalOrderMessagePresetKey>("initial");
  const [messagePresets, setMessagePresets] = useState<SacDigitalOrderMessagePreset[]>(DEFAULT_SAC_ORDER_MESSAGE_PRESETS);
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [documentTemplateId, setDocumentTemplateId] = useState("");
  const sendInFlightRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPurpose("initial");
    setMessagePresets(DEFAULT_SAC_ORDER_MESSAGE_PRESETS);
    setText(presetMessage(DEFAULT_SAC_ORDER_MESSAGE_PRESETS, "initial", order));
    setAttachment(null);
    setDocumentTemplateId("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setError("");

    if (order?.organization_id) {
      void listSacDigitalOrderMessagePresets(order.organization_id)
        .then(presets => {
          if (cancelled) return;
          const active = presets.filter(item => item.is_active);
          const next = active.length ? presets : DEFAULT_SAC_ORDER_MESSAGE_PRESETS;
          const first = next.find(item => item.is_active) || next[0];
          setMessagePresets(next);
          if (first) {
            setPurpose(first.preset_key);
            setText(renderOrderMessage(first.message_template, order));
          }
        })
        .catch(() => {
          // Os modelos padrão permanecem disponíveis se a configuração não puder ser lida.
        });
    }

    return () => { cancelled = true; };
  }, [open, order?.id, order?.organization_id]);

  const send = async () => {
    const message = text.trim();
    if ((!message && !attachment && !documentTemplateId) || !order?.id || !order?.organization_id || sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    setSending(true);
    setError("");
    try {
      if (attachment || documentTemplateId) {
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

        let fileToSend = attachment;
        if (!fileToSend && documentTemplateId) {
          if (!onBuildDocument) throw new Error("Não foi possível gerar este documento da OS.");
          fileToSend = await onBuildDocument(documentTemplateId);
        }
        if (!fileToSend) throw new Error("Selecione um documento para enviar.");

        await sendSacDigitalMediaMessage(
          order.organization_id,
          available[0].external_protocol_id,
          fileToSend,
          message,
          order.id,
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
            disabled={(!text.trim() && !attachment && !documentTemplateId) || sending}
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
          <div className="mb-4"><FSelect label="Tipo de mensagem" value={purpose} disabled={sending}
            onChange={(event: any) => {
              const next = event.target.value as SacDigitalOrderMessagePresetKey;
              const preset = messagePresets.find(item => item.preset_key === next);
              setPurpose(next);
              if (preset) setText(renderOrderMessage(preset.message_template, order));
            }}
            options={messagePresets
              .filter(item => item.is_active)
              .map(item => ({ value: item.preset_key, label: item.label }))} /></div>
          <FTextarea label="Mensagem" aria-label="Mensagem" rows={6} maxLength={5000} value={text} disabled={sending} onChange={(event: any) => setText(event.target.value)} placeholder="Digite a mensagem para o cliente" />
          <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <span>Revise o texto antes de enviar. A legenda é opcional ao anexar um documento.</span>
            <span className="shrink-0">{text.length}/5000</span>
          </div>

          {documentTemplates.length > 0 && onBuildDocument && (
            <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/25 p-3">
              <FSelect
                label="Documento da OS"
                value={documentTemplateId}
                disabled={sending}
                onChange={(event: any) => {
                  setDocumentTemplateId(event.target.value);
                  if (event.target.value) {
                    setAttachment(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }
                  setError("");
                }}
                options={[
                  { value: "", label: "Sem documento gerado" },
                  ...documentTemplates.map(template => ({
                    value: template.id,
                    label: `${template.name} · ${PRINT_TEMPLATE_TYPE_LABELS[template.document_type] || template.document_type}`,
                  })),
                ]}
              />
              <p className="text-[10px] text-muted-foreground">
                São os mesmos modelos ativos disponíveis em Imprimir. O PDF será gerado com os dados atuais da OS e enviado ao cliente.
              </p>
            </div>
          )}

          <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/25 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-foreground">Arquivo do dispositivo</p>
                <p className="text-[10px] text-muted-foreground">
                  Envie um arquivo do seu dispositivo pelo protocolo ativo (imagens 1 MB; áudio 3 MB; vídeo/arquivos 5 MB).
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
                if (file.size > mediaMaximum(file.type)) {
                  setError(file.type.startsWith("image/")
                    ? "Imagens devem ter no máximo 1 MB." : `O arquivo deve ter no máximo ${mediaMaximum(file.type) / (1024 * 1024)} MB.`);
                  event.target.value = "";
                  return;
                }
                setError("");
                setDocumentTemplateId("");
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
