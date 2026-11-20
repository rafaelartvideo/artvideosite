import { useEffect, useMemo, useRef, useState } from "react";
import { getOrderChecklist } from "@/features/checklists/infrastructure/checklists.repository";
import { buildOrderDocumentSignatureSnapshot } from "@/features/documents/domain/document-signature";
import { freezeOrderPrintPdf } from "@/features/documents/domain/order-print-pdf-freeze";
import type { PrintTemplate } from "@/features/documents/domain/print-template";
import { isOrderTerminalDocumentVisible, isTerminalDocumentType } from "../domain/order-terminal-document-visibility";
import { loadPrintTemplateEditorValue } from "@/features/documents/infrastructure/documents.repository";
import {
  attachFrozenPrintPdf,
  cancelSignatureRequest,
  createSignatureRequest,
  getSignatureAdminLink,
  listOrderSignatureRequests,
} from "@/features/documents/infrastructure/document-signatures.repository";
import { getOrderWhatsAppAvailability, sendOrderSignatureViaUnionWhatsApp, signatureInviteText } from "../application/order-signature-whatsapp";
import { buildSignatureWhatsAppUrl, isActiveSignatureStatus } from "@/features/documents/domain/document-signature-ui.mjs";
import type { DocumentSignatureRequestSummary } from "@/features/documents/domain/document-signature";
import { getCompanyPrintContext } from "@/features/settings/infrastructure/company-settings.repository";
import { resolveMediaStorageUrl } from "@/shared/infrastructure/media.repository";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { isValidEmail, normalizeDigits } from "@/shared/domain/formatters";
import { AdminSelect, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";

const signerOptions = [
  { value: "customer", label: "Cliente da OS" },
  { value: "contact", label: "Responsável / contato" },
];

function customerName(customer: any) {
  return String(customer?.full_name || customer?.trade_name || customer?.legal_name || "").trim();
}

function customerDocument(customer: any) {
  return String(customer?.cnpj || customer?.document || "").trim();
}

export function OrderSignatureRequestDialog({
  open,
  order,
  templates,
  preferredDocumentType,
  usedItems,
  partRequests,
  history,
  printedBy,
  existingRequests,
  requestsLoading,
  requestsError,
  onRefreshRequests,
  onClose,
  onCreated,
  embedded = false,
  onBusyChange,
}: {
  open: boolean;
  embedded?: boolean;
  onBusyChange?: (busy:boolean)=>void;
  order: any;
  templates: PrintTemplate[];
  preferredDocumentType?: string | null;
  usedItems: any[];
  partRequests: any[];
  history: any[];
  printedBy?: string | null;
  // The documents panel supplies its loaded list. The OS details shortcut
  // opens independently, so it must load the list itself when these are absent.
  existingRequests?: DocumentSignatureRequestSummary[];
  requestsLoading?: boolean;
  requestsError?: string;
  onRefreshRequests?: () => void;
  onClose: () => void;
  onCreated: (result: {
    link?: string | null;
    email_warning?: string | null;
    whatsapp_warning?: string | null;
    finalization_warning?: string | null;
    reused?: boolean;
    resent?: boolean;
    request?: { id?: string; status?: string } | null;
  }) => void;
}) {
  const onlineTemplates = useMemo(
    () => templates.filter(template =>
      template.is_active !== false
      && template.allow_online_signature === true
      && (!preferredDocumentType || template.document_type === preferredDocumentType)
      // Assinatura exigida antes do fechamento: somente a ação específica
      // do modal de descarte/devolução pode preparar antecipadamente o termo.
      && ((preferredDocumentType === template.document_type && isTerminalDocumentType(preferredDocumentType))
        || isOrderTerminalDocumentVisible(template.document_type,order))
      && !(template.require_employee_signature === true && template.employee_signature_source === "manual")
    ),
    [templates,preferredDocumentType,order?.completed_at,order?.closure_outcome],
  );
  const [templateId, setTemplateId] = useState("");
  const [signerType, setSignerType] = useState<"customer" | "contact">("customer");
  const [contactName, setContactName] = useState("");
  const [contactDocument, setContactDocument] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(()=>{onBusyChange?.(saving);},[saving,onBusyChange]);
  const [unionEnabled, setUnionEnabled] = useState<boolean | null>(null);
  const unionAvailableRef=useRef<boolean|null>(null);
  useEffect(()=>{unionAvailableRef.current=unionEnabled;},[unionEnabled]);
  const [channelStatusError, setChannelStatusError] = useState("");
  const [directRequests, setDirectRequests] = useState<DocumentSignatureRequestSummary[]>([]);
  const [directRequestsLoading, setDirectRequestsLoading] = useState(true);
  const [directRequestsError, setDirectRequestsError] = useState("");
  const [requestsRefreshNonce, setRequestsRefreshNonce] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<{
    customer?: string;
    contactName?: string;
    contactDocument?: string;
    contactEmail?: string;
    contactPhone?: string;
  }>({});

  const providedRequests = Array.isArray(existingRequests);
  const currentRequests = providedRequests ? existingRequests : directRequests;
  const checkingRequests = providedRequests ? requestsLoading === true : directRequestsLoading;
  const currentRequestsError = providedRequests ? (requestsError || "") : directRequestsError;
  const refreshRequests = () => {
    if (providedRequests) onRefreshRequests?.();
    else setRequestsRefreshNonce(value => value + 1);
  };
  const selectedTemplate = onlineTemplates.find(template => template.id === templateId) || onlineTemplates[0] || null;
  const customer = order?.customer || {};
  const activeRequest = currentRequests.find(item =>
    item.print_template_id === selectedTemplate?.id
    && isActiveSignatureStatus(item.status)
    && Date.parse(item.expires_at) > Date.now()
  ) || null;
  const selectedSignerEmail = String(signerType === "customer" ? customer.email || "" : contactEmail).trim().toLowerCase();
  const selectedSignerPhone = normalizeDigits(signerType === "customer" ? customer.whatsapp || customer.phone : contactPhone);
  const existingMatchesSigner = Boolean(activeRequest
    && activeRequest.external_signer_type === signerType
    && activeRequest.external_signer_email?.trim().toLowerCase() === selectedSignerEmail
    && normalizeDigits(activeRequest.external_signer_phone) === selectedSignerPhone);

  useEffect(() => {
    if (!open || !order?.organization_id) return;
    let alive = true;
    setUnionEnabled(null);
    setChannelStatusError("");
    void getOrderWhatsAppAvailability(order.organization_id)
      .then(connected => { if (alive) setUnionEnabled(connected); })
      .catch(error => { if (alive) setChannelStatusError(systemErrorMessage(error, "Não foi possível consultar o canal WhatsApp da Union.")); });
    return () => { alive = false; };
  }, [open, order?.organization_id]);

  useEffect(() => {
    if (!open || providedRequests || !order?.organization_id || !order?.id) return;
    let active = true;
    setDirectRequests([]);
    setDirectRequestsLoading(true);
    setDirectRequestsError("");
    void listOrderSignatureRequests(order.organization_id, order.id)
      .then(items => { if (active) setDirectRequests(items); })
      .catch(error => {
        if (active) setDirectRequestsError(systemErrorMessage(error, "Não foi possível verificar as assinaturas ativas da OS."));
      })
      .finally(() => { if (active) setDirectRequestsLoading(false); });
    return () => { active = false; };
  }, [open, providedRequests, order?.organization_id, order?.id, requestsRefreshNonce]);

  useEffect(() => {
    if (!open) return;
    setTemplateId(current => current && onlineTemplates.some(template => template.id === current) ? current : onlineTemplates[0]?.id || "");
    setSignerType("customer");
    setContactName("");
    setContactDocument("");
    setContactEmail("");
    setContactPhone("");
    setFieldErrors({});
  }, [open, order?.id, onlineTemplates]);

  if (!open) return null;

  const reuseExisting = async () => {
    if (!activeRequest || saving) return;
    // Never send a personal signature link to a new/different recipient.
    const canSendInvite = existingMatchesSigner && Boolean(activeRequest.external_signer_phone)
      && unionEnabled !== null && !channelStatusError;
    const whatsappTab = canSendInvite && unionEnabled === false ? window.open("about:blank", "_blank") : null;
    if (whatsappTab) whatsappTab.opener = null;
    setSaving(true);
    try {
      const link = await getSignatureAdminLink(order.organization_id, activeRequest.id);
      let whatsappWarning: string | null = null;
      if (canSendInvite) {
        try {
          const company = await getCompanyPrintContext(order.organization_id);
          const whatsappUrl = buildSignatureWhatsAppUrl(activeRequest.external_signer_phone, link, {
            companyName: company.name,
            documentName: activeRequest.template_name_snapshot,
            signerName: activeRequest.external_signer_name,
            operatorName: printedBy,
          });
          if (!whatsappUrl) throw new Error("Não foi possível preparar o convite de assinatura.");
          if (unionAvailableRef.current === true) {
            if (whatsappTab && !whatsappTab.closed) whatsappTab.close();
            await sendOrderSignatureViaUnionWhatsApp({
              organizationId: order.organization_id, orderId: order.id,
              phone: activeRequest.external_signer_phone || "",
              signerName: activeRequest.external_signer_name || "",
              message: signatureInviteText(whatsappUrl),
            });
          } else if (whatsappTab && !whatsappTab.closed) {
            whatsappTab.location.replace(whatsappUrl);
          } else whatsappWarning = "Permita novas abas ou copie o link pelo QR Code.";
        } catch (error) {
          if (whatsappTab && !whatsappTab.closed) whatsappTab.close();
          whatsappWarning = systemErrorMessage(error, "Não foi possível reenviar o link pelo WhatsApp.");
        }
      } else if (whatsappTab && !whatsappTab.closed) whatsappTab.close();
      onCreated({
        link,
        request: activeRequest,
        reused: true,
        resent: canSendInvite && !whatsappWarning,
        whatsapp_warning: whatsappWarning,
      });
      onClose();
    } catch (error) {
      if (whatsappTab && !whatsappTab.closed) whatsappTab.close();
      notifyAdmin(systemErrorMessage(error, "Não foi possível recuperar o link existente."), "error");
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (!order?.id || !order?.organization_id || !selectedTemplate || saving || activeRequest || checkingRequests || currentRequestsError) return;
    setFieldErrors({});
    const nextErrors: typeof fieldErrors = {};
    if (selectedTemplate.require_external_signature) {
      if (signerType === "customer") {
        if (!customerName(customer)) nextErrors.customer = "O cliente da OS não possui nome para assinatura.";
        else if (![11, 14].includes(normalizeDigits(customerDocument(customer)).length)) nextErrors.customer = "O cliente precisa ter CPF/CNPJ cadastrado para assinatura online.";
        else if (!String(customer.email || "").trim() || !isValidEmail(String(customer.email || ""))) nextErrors.customer = "O cliente precisa ter um e-mail válido cadastrado para receber o convite de assinatura.";
        else if (normalizeDigits(customer.whatsapp || customer.phone).length < 10) nextErrors.customer = "O cliente precisa ter WhatsApp/telefone cadastrado para receber o link de assinatura.";
      } else {
        if (!contactName.trim()) nextErrors.contactName = "Informe o nome do responsável/contato.";
        if (![11, 14].includes(normalizeDigits(contactDocument).length)) nextErrors.contactDocument = "Informe um CPF/CNPJ válido do responsável/contato.";
        if (!contactEmail.trim() || !isValidEmail(contactEmail)) nextErrors.contactEmail = "Informe um e-mail válido do responsável/contato.";
        if (normalizeDigits(contactPhone).length < 10) nextErrors.contactPhone = "Informe o WhatsApp/telefone do responsável/contato.";
      }
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    // Reservar a aba no clique somente quando não há SAC; gerar PDF e link
    // leva tempo e abrir o WhatsApp após um await seria bloqueado.
    const whatsappTab = unionEnabled === false && selectedTemplate.require_external_signature
      ? window.open("about:blank", "_blank")
      : null;
    if (whatsappTab) whatsappTab.opener = null;

    setSaving(true);
    let createdRequestId: string | null = null;
    try {
      // Template and company are independent: load them concurrently instead of
      // waiting for the template before starting the company lookup.
      const [configuredTemplate, company] = await Promise.all([
        loadPrintTemplateEditorValue(selectedTemplate),
        getCompanyPrintContext(order.organization_id),
      ]);
      const needsChecklist = [...configuredTemplate.selectedFields].some(key => key.startsWith("checklists."));
      const checklist = needsChecklist ? await getOrderChecklist(order.id) : null;
      const checklistMedia = (checklist?.stages || [])
        .filter(stage => configuredTemplate.selectedFields.has(`checklists.${stage.stage_type_snapshot}`))
        .flatMap(stage => stage.items.flatMap(item => item.media.flatMap(link => link.media ? [link] : [])));
      const checklistPhotoUrls = Object.fromEntries(await Promise.all(
        checklistMedia.map(async link => [
          link.media_id,
          await resolveMediaStorageUrl(link.media!.bucket_id, link.media!.storage_path),
        ] as const),
      ));
      const printContext = {
        order,
        checklist,
        checklistPhotoUrls,
        usedItems,
        partRequests,
        history,
        printedBy,
        company,
      };
      const snapshot = buildOrderDocumentSignatureSnapshot(configuredTemplate, printContext);

      // Freeze exactly the same HTML/CSS used by the existing Imprimir flow before
      // creating the online request. No secondary document renderer is involved here.
      const frozenPdf = await freezeOrderPrintPdf(configuredTemplate, printContext);

      const externalSigner = selectedTemplate.require_external_signature
        ? signerType === "customer"
          ? {
              type: "customer" as const,
              name: customerName(customer),
              document: customerDocument(customer),
              email: String(customer.email || ""),
              phone: String(customer.whatsapp || customer.phone || "") || null,
            }
          : {
              type: "contact" as const,
              name: contactName.trim(),
              document: contactDocument.trim(),
              email: contactEmail.trim(),
              phone: contactPhone.trim() || null,
            }
        : null;
      const result = await createSignatureRequest({
        organization_id: order.organization_id,
        service_order_id: order.id,
        print_template_id: selectedTemplate.id,
        snapshot,
        external_signer: externalSigner,
        manual_employee_entity_id: null,
      });
      createdRequestId = result.request.id;

      const frozenResult = await attachFrozenPrintPdf(order.organization_id, result.request.id, frozenPdf, result.base_pdf_upload);
      let whatsappWarning: string | null = null;
      if (result.link && result.request?.id && externalSigner?.phone) {
        try {
          const whatsappUrl = buildSignatureWhatsAppUrl(externalSigner.phone, result.link, {
            companyName: company.name,
            documentName: selectedTemplate.name,
            signerName: externalSigner.name,
            operatorName: printedBy,
          });
          if (!whatsappUrl) throw new Error("Não foi possível preparar o convite de assinatura.");
          if (unionAvailableRef.current === true) {
            if (whatsappTab && !whatsappTab.closed) whatsappTab.close();
            await sendOrderSignatureViaUnionWhatsApp({
              organizationId: order.organization_id, orderId: order.id,
              phone: externalSigner.phone, signerName: externalSigner.name,
              message: signatureInviteText(whatsappUrl),
            });
          } else if (whatsappTab && !whatsappTab.closed) {
            whatsappTab.location.replace(whatsappUrl);
          } else whatsappWarning = channelStatusError || "A assinatura foi criada. Compartilhe o link pelo QR Code.";
        } catch (whatsappError) {
          if (whatsappTab && !whatsappTab.closed) whatsappTab.close();
          whatsappWarning = systemErrorMessage(
            whatsappError,
            "A solicitação foi criada, mas não foi possível enviar o link pelo WhatsApp.",
          );
        }
      } else if (whatsappTab && !whatsappTab.closed) whatsappTab.close();
      onCreated({
        link: result.link,
        email_warning: result.email_warning,
        whatsapp_warning: whatsappWarning,
        finalization_warning: frozenResult.final_pdf_hash ? null : result.finalization_warning,
        request: result.request,
      });
      onClose();
    } catch (submitError) {
      if (whatsappTab && !whatsappTab.closed) whatsappTab.close();
      if (createdRequestId) {
        try { await cancelSignatureRequest(order.organization_id, createdRequestId); }
        catch { /* best effort: prevent a partially prepared link from remaining active */ }
      }
      const message = systemErrorMessage(submitError, "Não foi possível criar a solicitação de assinatura.");
      if (message.includes("Já existe uma solicitação ativa")) refreshRequests();
      notifyAdmin(message, "error");
    } finally {
      setSaving(false);
    }
  };

  const preparing = checkingRequests;

  const formFooter = preparing ? null : <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <BtnSecondary onClick={onClose} disabled={saving}>{embedded ? "Voltar" : "Cancelar"}</BtnSecondary>
      <BtnPrimary
        onClick={() => void (activeRequest ? reuseExisting() : submit())}
        loading={saving}
        loadingText="Enviando..."
        disabled={onlineTemplates.length === 0 || checkingRequests || Boolean(currentRequestsError) || saving}
      >{activeRequest ? (existingMatchesSigner ? "Reenviar link existente" : "Ver link existente") : "Criar e enviar"}</BtnPrimary>
    </div>;
  const formContent = <>
    {preparing ? (
      <div className="flex min-h-[240px] items-center justify-center" role="status" aria-live="polite">
        <LoadingState text="Preparando envio para assinatura..." />
      </div>
    ) : <div className="space-y-5">
        {channelStatusError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{channelStatusError}</p>}
        {currentRequestsError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{currentRequestsError}</p>}
        {activeRequest && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          <p className="font-bold">Este modelo já possui uma assinatura {activeRequest.status === "viewed" ? "visualizada" : "pendente"}.</p>
          <p className="mt-1">Assinante: {activeRequest.external_signer_name || "não informado"}. O link é válido até {new Date(activeRequest.expires_at).toLocaleString("pt-BR")}.</p>
          <p className="mt-1">{existingMatchesSigner
            ? "Reenvie o link existente, sem gerar outro documento."
            : "O link pertence ao assinante acima e não será enviado ao contato selecionado. Para gerar outro documento, cancele a solicitação anterior em Documentos → Assinaturas eletrônicas."}</p>
        </div>}
        {onlineTemplates.length === 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Nenhum modelo ativo está marcado com “Permitir assinatura online”.</div> : <>
          {(!embedded || onlineTemplates.length > 1) && <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Modelo</label>
            <AdminSelect value={templateId} onValueChange={value => { setTemplateId(value); setFieldErrors({}); }} ariaLabel="Modelo de documento" options={onlineTemplates.map(template => ({ value: template.id, label: template.name }))} />
          </div>}

          {!embedded && selectedTemplate && <div className="grid gap-2 rounded-xl border border-border bg-muted/40 p-4 sm:grid-cols-2">
            <Info label="Assinatura do cliente" value={selectedTemplate.require_external_signature ? "Obrigatória" : "Não exigida"} />
            <Info label="Validade do link" value={`${selectedTemplate.signature_link_ttl_hours || 72} horas`} />
            <Info label="OS" value={String(order.os_number || "—")} />
          </div>}

          {selectedTemplate?.require_external_signature && <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div><h3 className="text-sm font-bold text-foreground">Assinante</h3><p className="mt-1 text-xs text-muted-foreground">Identidade validada antes da assinatura.</p></div>
            <AdminSelect value={signerType} onValueChange={value => { setSignerType(value as "customer" | "contact"); setFieldErrors({}); }} ariaLabel="Tipo de assinante" options={signerOptions} />
            {signerType === "customer" ? <div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Info label="Nome" value={customerName(customer) || "Não informado"} />
                <Info label="CPF/CNPJ" value={customerDocument(customer) || "Não informado"} />
                <Info label="E-mail" value={String(customer.email || "Não informado")} />
                <Info label="WhatsApp / telefone" value={String(customer.whatsapp || customer.phone || "Não informado")} />
              </div>
              {fieldErrors.customer && <p className="mt-3 text-xs font-semibold leading-relaxed text-red-600">{fieldErrors.customer}</p>}
            </div> : <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome" error={fieldErrors.contactName}><input className={INPUT} value={contactName} onChange={event => { setFieldErrors(current => ({ ...current, contactName: undefined })); setContactName(event.target.value); }} /></Field>
              <Field label="CPF/CNPJ" error={fieldErrors.contactDocument}><input className={INPUT} value={contactDocument} onChange={event => { setFieldErrors(current => ({ ...current, contactDocument: undefined })); setContactDocument(event.target.value); }} inputMode="numeric" /></Field>
              <Field label="E-mail" error={fieldErrors.contactEmail}><input className={INPUT} value={contactEmail} onChange={event => { setFieldErrors(current => ({ ...current, contactEmail: undefined })); setContactEmail(event.target.value); }} type="email" /></Field>
              <Field label="WhatsApp / telefone" error={fieldErrors.contactPhone}><input className={INPUT} value={contactPhone} onChange={event => { setFieldErrors(current => ({ ...current, contactPhone: undefined })); setContactPhone(event.target.value); }} inputMode="tel" /></Field>
            </div>}
          </section>}

        </>}

    </div>}
  </>;
  if (embedded) {
    return <div className="space-y-4" data-signature-inline-step="true">
      {formContent}
      {formFooter && <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">{formFooter}</div>}
    </div>;
  }
  return <AdminDialog
    open
    onClose={onClose}
    title="Enviar para assinatura"
    description="Escolha o assinante e envie o link pelo WhatsApp da empresa."
    minimizable={!saving}
    className="max-w-xl"
    preparing={preparing}
    preparingKey={order?.id}
    preparingText="Preparando assinatura..."
    footer={formFooter}
  >
    {formContent}
  </AdminDialog>;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>{children}{error && <span className="mt-1 block text-[10px] font-semibold leading-relaxed text-red-600">{error}</span>}</label>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 break-words text-xs font-semibold text-foreground">{value}</div></div>;
}
