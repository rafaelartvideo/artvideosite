import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, FileCheck2, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { FInput, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { formatCurrency } from "@/shared/domain/formatters";
import { OrderChecklistMobileBridge } from "@/features/checklists/presentation/OrderChecklistMobileBridge";
import {
  attachOrderSituationDocument, listAttachmentTypes, listOrderSituationDocuments,
} from "../infrastructure/order-documents.repository";
import type { OrderQuoteProposal } from "../infrastructure/order-quote.repository";

function totalForQuote(quote: OrderQuoteProposal): number {
  const subtotal = (quote.items || []).reduce((sum, item) =>
    sum + Number(item.quantity || 0) * Number(item.unit_price || 0) + Number(item.additional_cost || 0), 0);
  const discount = quote.discount_type === "percentage"
    ? subtotal * Number(quote.discount_value || 0) / 100 : Number(quote.discount_value || 0);
  return Math.max(0, subtotal - discount);
}
function isDeliveryEvidenceName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === "evidencia de entrega";
}

export function OrderQuoteReturnDialog({ order, quote, open, canAttach, onClose, onReturned }: {
  order: any;
  quote: OrderQuoteProposal;
  open: boolean;
  canAttach: boolean;
  onClose: () => void;
  onReturned: () => void;
}) {
  const queryClient = useQueryClient();
  const [recipient, setRecipient] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [attachmentTypeId, setAttachmentTypeId] = useState("");
  const [hasEvidence, setHasEvidence] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const organizationId = String(order.organization_id);
  const orderId = String(order.id);

  const refreshEvidence = async () => {
    const { data, error: loadError } = await listOrderSituationDocuments(orderId, organizationId);
    if (loadError) throw loadError;
    const exists = (data || []).some((row: any) =>
      !row.situation_id && isDeliveryEvidenceName(String(row.attachment_type?.name || "")));
    setHasEvidence(exists);
    return exists;
  };

  useEffect(() => {
    if (!open) return;
    let active = true;
    setRecipient("");
    setNotes("");
    setFile(null);
    setError("");
    setHasEvidence(false);
    setAttachmentTypeId("");
    setPreparing(true);
    Promise.all([
      listAttachmentTypes(true, organizationId),
      listOrderSituationDocuments(orderId, organizationId),
    ]).then(([types, documents]) => {
      if (!active) return;
      if (types.error) throw types.error;
      if (documents.error) throw documents.error;
      const type = (types.data || []).find(item => isDeliveryEvidenceName(item.name));
      if (!type) throw new Error("O tipo Evidência de entrega não está configurado nesta empresa.");
      setAttachmentTypeId(type.id);
      setHasEvidence((documents.data || []).some((row: any) =>
        !row.situation_id && isDeliveryEvidenceName(String(row.attachment_type?.name || ""))));
    }).catch(caught => { if (active) setError(systemErrorMessage(caught)); })
      .finally(() => { if (active) setPreparing(false); });
    return () => { active = false; };
  }, [open, orderId, organizationId]);

  const chooseFile = (selected: File | null) => {
    if (!selected) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(selected.type)
      || /\.pdf$/i.test(selected.name);
    if (!allowed) { setError("Utilize uma foto JPG, PNG, WebP ou um PDF."); return; }
    setError("");
    setFile(selected);
  };

  const finish = async () => {
    if (saving || preparing || recipient.trim().length < 3 || (!hasEvidence && !file)) return;
    setSaving(true);
    setError("");
    try {
      if (!hasEvidence) {
        if (!canAttach || !file || !attachmentTypeId)
          throw new Error("Selecione a evidência de entrega antes de finalizar.");
        await attachOrderSituationDocument({
          organizationId, serviceOrderId: orderId,
          attachmentTypeId, file, optimizePhoto: true,
        });
        setFile(null);
        setHasEvidence(true);
      }
      const { error: rpcError } = await (supabase as any).rpc("close_rejected_quote_return_v1", {
        p_organization_id: organizationId,
        p_order_id: orderId,
        p_recipient_name: recipient.trim(),
        p_notes: notes.trim(),
      });
      if (rpcError) throw rpcError;
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["finance", "losses", organizationId] });
      onReturned();
      onClose();
    } catch (caught) {
      setError(systemErrorMessage(caught, "Não foi possível finalizar a devolução."));
    } finally {
      setSaving(false);
    }
  };

  return <AdminDialog open={open} onClose={() => { if (!saving) onClose(); }}
    title="Finalizar devolução"
    description="O orçamento continuará reprovado e a OS será fechada sem solução técnica nem cobrança automática."
    className="w-[calc(100vw-1.5rem)] max-w-2xl"
    footer={<div className="flex w-full flex-wrap justify-end gap-2">
      <BtnSecondary disabled={saving} onClick={onClose}>Voltar</BtnSecondary>
      <BtnPrimary loading={saving} loadingText="Finalizando..."
        disabled={preparing || saving || recipient.trim().length < 3 || (!hasEvidence && (!file || !attachmentTypeId || !canAttach))}
        onClick={() => void finish()}>Confirmar devolução</BtnPrimary>
    </div>}>
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">OS {order.os_number} · orçamento versão {quote.version}</span>
          <strong>{formatCurrency(totalForQuote(quote))}</strong>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Motivo da reprovação: {quote.rejection_reason || "Não informado"}</p>
        <p className="mt-1 text-xs text-muted-foreground">Este valor será acompanhado em Financeiro → Perdas, sem gerar conta a receber.</p>
      </div>
      <FInput label="Responsável pela retirada" required maxLength={180}
        value={recipient} disabled={saving} placeholder="Nome de quem recebeu o equipamento"
        onChange={(event: any) => setRecipient(event.target.value)} />
      <FTextarea label="Observações da devolução" rows={3} maxLength={2000}
        value={notes} disabled={saving} placeholder="Estado do equipamento, acessórios devolvidos e outras observações."
        onChange={(event: any) => setNotes(event.target.value)} />
      <div className="space-y-3 rounded-xl border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold">Evidência de entrega <span className="text-destructive">*</span></p>
            <p className="text-xs text-muted-foreground">A foto ou documento ficará salvo em Documentos da OS.</p>
          </div>
          {canAttach && <OrderChecklistMobileBridge orderId={orderId}
            osNumber={String(order.os_number)} scope="payment-proof"
            disabled={saving} onDocumentsUpdated={() => { void refreshEvidence().catch(caught => setError(systemErrorMessage(caught))); }} />}
        </div>
        {preparing ? <p className="text-xs text-muted-foreground">Consultando anexos da OS...</p>
          : hasEvidence ? <p className="flex items-center gap-2 text-xs font-semibold text-emerald-600">
              <FileCheck2 size={16} /> Evidência de entrega já anexada à OS.
            </p>
          : canAttach ? <>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf"
              className="hidden" onChange={event => { chooseFile(event.target.files?.[0] || null); event.target.value = ""; }} />
            <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment"
              className="hidden" onChange={event => { chooseFile(event.target.files?.[0] || null); event.target.value = ""; }} />
            <div className="flex flex-wrap gap-2">
              <BtnSecondary disabled={saving || !attachmentTypeId} onClick={() => fileRef.current?.click()}>
                <Upload size={15} /> Selecionar arquivo</BtnSecondary>
              <BtnSecondary disabled={saving || !attachmentTypeId} onClick={() => cameraRef.current?.click()}>
                <Camera size={15} /> Tirar foto</BtnSecondary>
            </div>
            {file && <p className="break-all text-xs font-semibold text-foreground">{file.name}</p>}
          </> : <p className="text-xs text-destructive">Seu perfil não possui permissão para anexar documentos.</p>}
      </div>
      {error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
    </div>
  </AdminDialog>;
}
