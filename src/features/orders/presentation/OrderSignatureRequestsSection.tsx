import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  Clipboard,
  Download,
  ExternalLink,
  FileSignature,
  History,
  Mail,
  MessageCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  DOCUMENT_SIGNATURE_STATUS_LABELS,
  type DocumentSignatureAuditEvent,
  type DocumentSignatureRequestSummary,
} from "@/features/documents/domain/document-signature";
import { buildSignatureWhatsAppUrl, isActiveSignatureStatus } from "@/features/documents/domain/document-signature-ui.mjs";
import type { PrintTemplate } from "@/features/documents/domain/print-template";
import {
  cancelSignatureRequest,
  getSignatureAdminLink,
  getSignatureAudit,
  getSignedSignatureDocument,
  listOrderSignatureRequests,
  resendSignatureEmail,
} from "@/features/documents/infrastructure/document-signatures.repository";
import { getCompanyPrintContext } from "@/features/settings/infrastructure/company-settings.repository";
import { formatDateTime } from "@/shared/domain/formatters";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { AdminCard, AdminIconButton, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { OrderSignatureRequestDialog } from "./OrderSignatureRequestDialog";

type PermissionCheck = (permission: string) => boolean;

type Props = {
  order: any;
  templates: PrintTemplate[];
  usedItems: any[];
  partRequests: any[];
  history: any[];
  printedBy?: string | null;
  hasPermission: PermissionCheck;
};

const statusClasses: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  viewed: "bg-blue-50 text-blue-700 ring-blue-200",
  signed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  expired: "bg-slate-100 text-slate-600 ring-slate-200",
  cancelled: "bg-red-50 text-red-700 ring-red-200",
};

const eventLabels: Record<string, string> = {
  created: "Solicitação criada",
  email_sent: "Convite enviado por e-mail",
  email_failed: "Falha no envio do convite",
  email_resent: "Convite reenviado por e-mail",
  link_viewed: "Link visualizado",
  identity_verified: "Identidade confirmada",
  identity_failed: "Falha na confirmação da identidade",
  otp_sent: "Código enviado",
  otp_failed: "Código informado incorretamente",
  otp_verified: "Código validado",
  consent_accepted: "Aceite eletrônico confirmado",
  signature_captured: "Assinatura do cliente capturada",
  pdf_generated: "PDF final imutável gerado",
  signed: "Documento assinado",
  final_copy_emailed: "Cópia final enviada por e-mail",
  final_copy_email_failed: "Falha ao enviar a cópia final",
  cancelled: "Solicitação cancelada",
  expired: "Solicitação expirada",
};

function statusBadge(status: string) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase ring-1 ring-inset ${statusClasses[status] || statusClasses.expired}`}>{DOCUMENT_SIGNATURE_STATUS_LABELS[status as keyof typeof DOCUMENT_SIGNATURE_STATUS_LABELS] || status}</span>;
}

export function OrderSignatureRequestsSection({
  order,
  templates,
  usedItems,
  partRequests,
  history,
  printedBy,
  hasPermission,
}: Props) {
  const [requests, setRequests] = useState<DocumentSignatureRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [auditRequest, setAuditRequest] = useState<DocumentSignatureRequestSummary | null>(null);
  const [auditEvents, setAuditEvents] = useState<DocumentSignatureAuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const canView = hasPermission("documents.signatures.view");
  const canSend = hasPermission("documents.signatures.send");
  const canResend = hasPermission("documents.signatures.resend");
  const canCancel = hasPermission("documents.signatures.cancel");
  const canAudit = hasPermission("documents.signatures.audit");
  const onlineTemplates = useMemo(() => templates.filter(template => template.is_active !== false && template.allow_online_signature === true), [templates]);

  const load = useCallback(async () => {
    if (!canView || !order?.organization_id || !order?.id) return;
    setLoading(true);
    try {
      setRequests(await listOrderSignatureRequests(order.organization_id, order.id));
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : String(error), type: "error" });
    } finally {
      setLoading(false);
    }
  }, [canView, order?.organization_id, order?.id]);

  useEffect(() => { void load(); }, [load]);

  if (!canView) return <div className="rounded-xl border border-dashed border-[#0d1b2e]/10 px-4 py-10 text-center text-xs text-[#5a6a82]">Você não possui permissão para visualizar assinaturas eletrônicas.</div>;

  const withBusy = async (requestId: string, action: () => Promise<void>) => {
    if (busyId) return;
    setBusyId(requestId);
    setMessage(null);
    try { await action(); }
    catch (error) { setMessage({ text: error instanceof Error ? error.message : String(error), type: "error" }); }
    finally { setBusyId(null); }
  };

  const getLink = async (request: DocumentSignatureRequestSummary) => getSignatureAdminLink(order.organization_id, request.id);

  const openLink = (request: DocumentSignatureRequestSummary) => withBusy(request.id, async () => {
    const link = await getLink(request);
    window.open(link, "_blank", "noopener,noreferrer");
  });

  const copyLink = (request: DocumentSignatureRequestSummary) => withBusy(request.id, async () => {
    const link = await getLink(request);
    await navigator.clipboard.writeText(link);
    setMessage({ text: "Link de assinatura copiado.", type: "success" });
  });

  const openWhatsApp = (request: DocumentSignatureRequestSummary) => withBusy(request.id, async () => {
    if (!request.external_signer_phone) throw new Error("O assinante não possui WhatsApp/telefone informado nesta solicitação.");
    const [link, company] = await Promise.all([getLink(request), getCompanyPrintContext(order.organization_id)]);
    const whatsappUrl = buildSignatureWhatsAppUrl(request.external_signer_phone, link, {
      companyName: company.name,
      documentName: request.template_name_snapshot,
      expiresAt: request.expires_at,
    });
    if (!whatsappUrl) throw new Error("Não foi possível preparar a mensagem do WhatsApp.");
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  });

  const resend = (request: DocumentSignatureRequestSummary) => withBusy(request.id, async () => {
    const result = await resendSignatureEmail(order.organization_id, request.id);
    setMessage({ text: `Convite reenviado para ${result.recipient}.`, type: "success" });
    await load();
  });

  const openSignedPdf = (request: DocumentSignatureRequestSummary) => withBusy(request.id, async () => {
    const result = await getSignedSignatureDocument(order.organization_id, request.id);
    window.open(result.download_url, "_blank", "noopener,noreferrer");
  });

  const downloadSignedPdf = (request: DocumentSignatureRequestSummary) => withBusy(request.id, async () => {
    const result = await getSignedSignatureDocument(order.organization_id, request.id);
    const anchor = document.createElement("a");
    anchor.href = result.download_url;
    anchor.download = `${request.template_name_snapshot || "documento"}-OS-${request.order_number_snapshot || ""}.pdf`;
    anchor.rel = "noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  });

  const verifySignedDocument = (request: DocumentSignatureRequestSummary) => withBusy(request.id, async () => {
    const result = await getSignedSignatureDocument(order.organization_id, request.id);
    window.open(result.verification_url, "_blank", "noopener,noreferrer");
  });

  const cancel = (request: DocumentSignatureRequestSummary) => {
    if (!window.confirm("Cancelar esta solicitação de assinatura? O link deixará de aceitar assinatura.")) return;
    void withBusy(request.id, async () => {
      await cancelSignatureRequest(order.organization_id, request.id);
      setMessage({ text: "Solicitação cancelada.", type: "success" });
      await load();
    });
  };

  const openAudit = (request: DocumentSignatureRequestSummary) => {
    setAuditRequest(request);
    setAuditEvents([]);
    setAuditLoading(true);
    void getSignatureAudit(order.organization_id, request.id)
      .then(setAuditEvents)
      .catch(error => setMessage({ text: error instanceof Error ? error.message : String(error), type: "error" }))
      .finally(() => setAuditLoading(false));
  };

  return <>
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-sm font-black text-[#0d1b2e]">Assinaturas eletrônicas</h2><p className="mt-1 text-xs text-[#5a6a82]">Solicitações enviadas a partir dos modelos habilitados para assinatura online.</p></div>
        <div className="flex items-center gap-2"><AdminIconButton ariaLabel="Atualizar assinaturas" title="Atualizar" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /></AdminIconButton>{canSend && <BtnPrimary onClick={() => setCreateOpen(true)} disabled={onlineTemplates.length === 0}><Plus size={15} /> Enviar para assinatura</BtnPrimary>}</div>
      </div>

      {message && <div className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-xs ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}><span className="min-w-0 break-words">{message.text}</span><button type="button" onClick={() => setMessage(null)}><X size={13} /></button></div>}

      {canSend && onlineTemplates.length === 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">Nenhum modelo ativo está marcado com “Permitir assinatura online”. Configure em Operação → Documentos.</div>}

      {loading ? <LoadingState text="Carregando assinaturas..." /> : requests.length === 0 ? <div className="rounded-xl border border-dashed border-[#0d1b2e]/10 px-4 py-10 text-center"><FileSignature size={24} className="mx-auto text-[#8a98aa]" /><p className="mt-2 text-sm font-bold text-[#0d1b2e]">Nenhuma solicitação</p><p className="mt-1 text-xs text-[#5a6a82]">Os documentos enviados para assinatura aparecerão aqui.</p></div> : <div className="space-y-3">{requests.map(request => {
        const active = isActiveSignatureStatus(request.status);
        const signed = request.status === "signed";
        const busy = busyId === request.id;
        const finalPdfHash = String((request as any).final_pdf_hash || "");
        return <AdminCard key={request.id} className="p-4 shadow-none">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><h3 className="min-w-0 truncate text-sm font-black text-[#0d1b2e]">{request.template_name_snapshot}</h3>{statusBadge(request.status)}</div>
              <div className="mt-3 grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                <Meta label="Assinante" value={request.external_signer_name || (request.require_external_signature ? "—" : "Somente funcionário")} />
                <Meta label="Funcionário" value={request.employee_name || (request.require_employee_signature ? "—" : "Não exigido")} />
                <Meta label="Criada em" value={formatDateTime(request.created_at, "—")} />
                {signed ? <Meta label="Assinado em" value={formatDateTime(request.signed_at, "—")} /> : <Meta label="Validade" value={formatDateTime(request.expires_at, "—")} />}
                <Meta label="Primeira visualização" value={request.first_viewed_at ? formatDateTime(request.first_viewed_at, "—") : "Ainda não visualizado"} />
                <Meta label="Código" value={request.verification_code} mono />
                {signed && finalPdfHash && <div className="sm:col-span-2 lg:col-span-3"><Meta label="Hash do PDF final (SHA-256)" value={finalPdfHash} mono /></div>}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-1 border-t border-[#0d1b2e]/8 pt-3 md:max-w-[240px] md:justify-end md:border-l md:border-t-0 md:pl-3 md:pt-0">
              {signed && <>
                <AdminIconButton ariaLabel="Visualizar documento assinado" title="Ver PDF assinado" disabled={busy} onClick={() => void openSignedPdf(request)}><ExternalLink size={15} /></AdminIconButton>
                <AdminIconButton ariaLabel="Baixar documento assinado" title="Baixar PDF" disabled={busy} onClick={() => void downloadSignedPdf(request)}><Download size={15} /></AdminIconButton>
                <AdminIconButton ariaLabel="Verificar autenticidade do documento" title="Verificar autenticidade" disabled={busy} onClick={() => void verifySignedDocument(request)}><ShieldCheck size={15} /></AdminIconButton>
              </>}
              {active && request.require_external_signature && <>
                <AdminIconButton ariaLabel="Abrir link de assinatura" title="Abrir link" disabled={busy} onClick={() => void openLink(request)}><ExternalLink size={15} /></AdminIconButton>
                <AdminIconButton ariaLabel="Copiar link de assinatura" title="Copiar link" disabled={busy} onClick={() => void copyLink(request)}><Clipboard size={15} /></AdminIconButton>
                <AdminIconButton ariaLabel="Abrir assinatura no WhatsApp" title="WhatsApp" disabled={busy || !request.external_signer_phone} onClick={() => void openWhatsApp(request)}><MessageCircle size={15} /></AdminIconButton>
                {canResend && <AdminIconButton ariaLabel="Reenviar convite por e-mail" title="Reenviar e-mail" disabled={busy} onClick={() => void resend(request)}><Mail size={15} /></AdminIconButton>}
              </>}
              {canAudit && <AdminIconButton ariaLabel="Ver auditoria da assinatura" title="Auditoria" disabled={busy} onClick={() => openAudit(request)}><History size={15} /></AdminIconButton>}
              {active && canCancel && <AdminIconButton ariaLabel="Cancelar solicitação de assinatura" title="Cancelar solicitação" disabled={busy} className="border-red-300 text-red-600 hover:bg-red-50" onClick={() => cancel(request)}><Ban size={15} /></AdminIconButton>}
            </div>
          </div>
        </AdminCard>;
      })}</div>}
    </div>

    <OrderSignatureRequestDialog
      open={createOpen}
      order={order}
      templates={onlineTemplates}
      usedItems={usedItems}
      partRequests={partRequests}
      history={history}
      printedBy={printedBy}
      onClose={() => setCreateOpen(false)}
      onCreated={result => {
        const warning = result.email_warning || result.finalization_warning;
        const signed = result.request?.status === "signed";
        setMessage({
          text: warning ? `Solicitação criada. Atenção: ${warning}` : signed ? "Documento gerado e assinado com sucesso." : "Solicitação criada e convite preparado.",
          type: warning ? "error" : "success",
        });
        void load();
      }}
    />

    {auditRequest && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#07111f]/65 p-4" role="dialog" aria-modal="true" aria-label="Auditoria da assinatura">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-[#0d1b2e]/10 bg-white px-5 py-4"><div><h2 className="text-lg font-black text-[#0d1b2e]">Auditoria da assinatura</h2><p className="mt-1 text-xs text-[#5a6a82]">{auditRequest.template_name_snapshot} · {auditRequest.verification_code}</p></div><button type="button" onClick={() => setAuditRequest(null)} className="rounded-lg p-2 text-[#5a6a82] hover:bg-[#f5f7fa]"><X size={18} /></button></div>
        <div className="space-y-3 p-5">{auditLoading ? <LoadingState text="Carregando auditoria..." /> : auditEvents.length === 0 ? <p className="py-8 text-center text-sm text-[#5a6a82]">Nenhum evento registrado.</p> : auditEvents.map(event => <div key={event.id} className="rounded-xl border border-[#0d1b2e]/10 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-black text-[#0d1b2e]">{eventLabels[event.event_type] || event.event_type}</span><span className="text-[10px] font-semibold text-[#5a6a82]">{formatDateTime(event.created_at, "—")}</span></div><div className="mt-2 grid gap-2 text-[10px] text-[#5a6a82] sm:grid-cols-2"><span>Origem: {event.actor_type}</span><span>IP: {event.ip_address || "—"}</span>{event.user_agent && <span className="break-words sm:col-span-2">Navegador: {event.user_agent}</span>}</div></div>)}</div>
        <div className="sticky bottom-0 border-t border-[#0d1b2e]/10 bg-white px-5 py-4"><BtnSecondary onClick={() => setAuditRequest(null)}>Fechar</BtnSecondary></div>
      </div>
    </div>}
  </>;
}

function Meta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0"><div className="text-[9px] font-black uppercase tracking-[0.1em] text-[#8a98aa]">{label}</div><div className={`mt-1 min-w-0 break-words text-xs font-semibold text-[#0d1b2e] ${mono ? "font-mono" : ""}`}>{value}</div></div>;
}
