import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { FInput } from "@/shared/ui/admin/AdminFormControls";
import { isValidBrazilianMobile } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { operateUnionWhatsAppInbox } from "../infrastructure/union-whatsapp-inbox.repository";
import { VerifiedWhatsAppPhoneInput } from "./WhatsAppNumberVerification";

type Owner = { id: string; name: string };

/** Verifies and saves CRM contact plus WhatsApp address-book identity atomically. */
export function CrmAdditionalContactDialog({ organizationId, owner, ownerLoading, ownerError, previewName, onRetryOwner, onClose, onSaved }: {
  organizationId: string; owner: Owner | null; ownerLoading: boolean; ownerError: string; previewName?: string;
  onRetryOwner: () => void; onClose: () => void; onSaved: () => void;
}) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [manualName, setManualName] = useState<string | null>(null);
  const [suggestedName, setSuggestedName] = useState("");
  const name = manualName ?? suggestedName;
  const [whatsapp, setWhatsapp] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const gate = useRef(false);
  const canSave = Boolean(owner) && !ownerLoading && !ownerError && activeOrganizationId === organizationId && hasPermission("registrations.contacts.manage");
  const save = async () => {
    if (!owner || !canSave || gate.current) return;
    if (name.trim().length < 2 || !isValidBrazilianMobile(whatsapp)) {
      setError("Informe o nome e um número de WhatsApp válido com DDD."); return;
    }
    gate.current = true; setSaving(true); setError("");
    try {
      const created = await operateUnionWhatsAppInbox(organizationId, crypto.randomUUID(), "crm_contact_save", {
        entity_id: owner.id, display_name: name.trim(), phone: whatsapp, job_title: jobTitle.trim(),
      });
      if (!created.entity_contact_id) throw new Error("O contato não foi retornado após salvar.");
      void queryClient.invalidateQueries({ queryKey: queryKeys.registrations.contacts(organizationId, owner.id) });
      window.dispatchEvent(new CustomEvent("union:registration-contacts-changed", { detail: { organizationId } }));
      onSaved();
    } catch (reason) {
      setError(systemErrorMessage(reason, "Não foi possível salvar o contato."));
    } finally {
      gate.current = false; setSaving(false);
    }
  };
  return <AdminDialog open title="Novo contato" description={owner ? "Adicionar número ao cadastro de " + owner.name : "Adicionar número ao cadastro do cliente"}
    onClose={() => { if (!saving) onClose(); }} className="max-w-md"
    footer={<div className="flex justify-end gap-2">
      <AdminButton variant="secondary" disabled={saving} onClick={onClose}>Cancelar</AdminButton>
      <AdminButton disabled={!canSave || saving} loading={saving} onClick={() => void save()}>Salvar contato</AdminButton>
    </div>}>
    <div className="space-y-3">
      {ownerLoading && <p role="status" aria-live="polite" className="text-xs text-muted-foreground">{previewName ? "Confirmando cadastro de " + previewName + "..." : "Identificando o cadastro do cliente..."}</p>}
      {ownerError && <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-destructive"><span>{ownerError}</span><button type="button" onClick={onRetryOwner} className="font-semibold text-primary underline underline-offset-2">Tentar novamente</button></div>}
      <FInput label="Nome do contato" required maxLength={160} value={name} disabled={saving} onChange={event => { setManualName(event.target.value); setError(""); }} />
      <VerifiedWhatsAppPhoneInput label="WhatsApp" mobile required value={whatsapp} verificationMode="create" verificationEnabled={Boolean(owner) && !ownerLoading && !ownerError} onVerifiedName={setSuggestedName} disabled={saving}
        onChange={event => { if (event.target.value.replace(/\D/g, "") !== whatsapp.replace(/\D/g, "")) setSuggestedName(""); setWhatsapp(event.target.value); setError(""); }} />
      <FInput label="Identificação (opcional)" placeholder="Ex.: esposa, responsável, financeiro" maxLength={160} value={jobTitle} disabled={saving} onChange={event => setJobTitle(event.target.value)} />
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  </AdminDialog>;
}
