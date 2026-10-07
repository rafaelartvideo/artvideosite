import { useEffect, useMemo, useState } from "react";
import { getOrderChecklist } from "@/features/checklists/infrastructure/checklists.repository";
import { buildOrderDocumentSignatureSnapshot } from "@/features/documents/domain/document-signature";
import { freezeOrderPrintPdf } from "@/features/documents/domain/order-print-pdf-freeze";
import type { PrintTemplate } from "@/features/documents/domain/print-template";
import { loadPrintTemplateEditorValue } from "@/features/documents/infrastructure/documents.repository";
import {
  attachFrozenPrintPdf,
  cancelSignatureRequest,
  createSignatureRequest,
} from "@/features/documents/infrastructure/document-signatures.repository";
import { sendSacDigitalSignatureInvite } from "@/features/sac-digital/infrastructure/sac-digital.repository";
import { getCompanyPrintContext } from "@/features/settings/infrastructure/company-settings.repository";
import { resolveMediaStorageUrl } from "@/shared/infrastructure/media.repository";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { isValidEmail, normalizeDigits } from "@/shared/domain/formatters";
import { AdminSelect, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";

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
  usedItems,
  partRequests,
  history,
  printedBy,
  onClose,
  onCreated,
}: {
  open: boolean;
  order: any;
  templates: PrintTemplate[];
  usedItems: any[];
  partRequests: any[];
  history: any[];
  printedBy?: string | null;
  onClose: () => void;
  onCreated: (result: {
    link?: string | null;
    email_warning?: string | null;
    whatsapp_warning?: string | null;
    finalization_warning?: string | null;
    request?: { id?: string; status?: string } | null;
  }) => void;
}) {
  const onlineTemplates = useMemo(
    () => templates.filter(template =>
      template.is_active !== false
      && template.allow_online_signature === true
      && !(template.require_employee_signature === true && template.employee_signature_source === "manual")
    ),
    [templates],
  );
  const [templateId, setTemplateId] = useState("");
  const [signerType, setSignerType] = useState<"customer" | "contact">("customer");
  const [contactName, setContactName] = useState("");
  const [contactDocument, setContactDocument] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    customer?: string;
    contactName?: string;
    contactDocument?: string;
    contactEmail?: string;
    contactPhone?: string;
  }>({});

  const selectedTemplate = onlineTemplates.find(template => template.id === templateId) || null;
  const customer = order?.customer || {};

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

  const submit = async () => {
    if (!order?.id || !order?.organization_id || !selectedTemplate || saving) return;
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

    setSaving(true);
    let createdRequestId: string | null = null;
    try {
      const configuredTemplate = await loadPrintTemplateEditorValue(selectedTemplate);
      const needsChecklist = [...configuredTemplate.selectedFields].some(key => key.startsWith("checklists."));
      const [company, checklist] = await Promise.all([
        getCompanyPrintContext(order.organization_id),
        needsChecklist ? getOrderChecklist(order.id) : Promise.resolve(null),
      ]);
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

      const frozenResult = await attachFrozenPrintPdf(order.organization_id, result.request.id, frozenPdf);
      let whatsappWarning: string | null = null;
      if (result.link && result.request?.id && externalSigner?.phone) {
        try {
          await sendSacDigitalSignatureInvite(
            order.organization_id,
            order.id,
            result.request.id,
            result.link,
          );
        } catch (whatsappError) {
          whatsappWarning = systemErrorMessage(
            whatsappError,
            "A solicitação foi criada, mas não foi possível enviar o link pelo WhatsApp.",
          );
        }
      }
      onCreated({
        link: result.link,
        email_warning: result.email_warning,
        whatsapp_warning: whatsappWarning,
        finalization_warning: frozenResult.final_pdf_hash ? null : result.finalization_warning,
        request: result.request,
      });
      onClose();
    } catch (submitError) {
      if (createdRequestId) {
        try { await cancelSignatureRequest(order.organization_id, createdRequestId); }
        catch { /* best effort: prevent a partially prepared link from remaining active */ }
      }
      notifyAdmin(systemErrorMessage(submitError, "Não foi possível criar a solicitação de assinatura."), "error");
    } finally {
      setSaving(false);
    }
  };

  return <AdminDialog
    open
    onClose={onClose}
    title="Enviar para assinatura"
    description="O mesmo documento de impressão será congelado em PDF no momento do envio."
    minimizedDescription={[
      `OS ${order?.os_number || "—"}`,
      signerType === "customer" ? customerName(customer) : contactName.trim(),
      selectedTemplate?.name,
    ].filter(Boolean).join(" · ")}
    minimizable={!saving}
    className="max-w-xl"
    footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <BtnSecondary onClick={onClose} disabled={saving}>Cancelar</BtnSecondary>
      <BtnPrimary onClick={() => void submit()} loading={saving} loadingText="Congelando e enviando PDF..." disabled={onlineTemplates.length === 0}>Criar e enviar</BtnPrimary>
    </div>}
  >
    <div className="space-y-5">
        {onlineTemplates.length === 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Nenhum modelo ativo está marcado com “Permitir assinatura online”.</div> : <>
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Modelo</label>
            <AdminSelect value={templateId} onValueChange={value => { setTemplateId(value); setFieldErrors({}); }} ariaLabel="Modelo de documento" options={onlineTemplates.map(template => ({ value: template.id, label: template.name }))} />
          </div>

          {selectedTemplate && <div className="grid gap-2 rounded-xl border border-border bg-muted p-4 sm:grid-cols-2">
            <Info label="Assinatura do cliente" value={selectedTemplate.require_external_signature ? "Obrigatória" : "Não exigida"} />
            <Info label="Validade do link" value={`${selectedTemplate.signature_link_ttl_hours || 72} horas`} />
            <Info label="OS" value={String(order.os_number || "—")} />
          </div>}

          {selectedTemplate?.require_external_signature && <div className="space-y-4 rounded-xl border border-border p-4">
            <div><h3 className="text-sm font-black text-[#0d1b2e]">Assinante externo</h3><p className="mt-1 text-xs text-[#5a6a82]">O CPF/CNPJ será confirmado antes de liberar o PDF para assinatura.</p></div>
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
          </div>}

/div>}
        </>}

    </div>

  </AdminDialog>;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}</span>{children}{error && <span className="mt-1 block text-[10px] font-semibold leading-relaxed text-red-600">{error}</span>}</label>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-wider text-[#7c899c]">{label}</div><div className="mt-1 break-words text-xs font-semibold text-[#0d1b2e]">{value}</div></div>;
}
