import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { isValidCnpj, isValidCpf } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { saveRegistration } from "@/features/registrations/infrastructure/registrations.repository";
import type { FinancialCounterparty } from "../infrastructure/finance-entries.repository";

export function FinanceQuickSupplierDialog({ onClose, onSaved }: {
  onClose: () => void;
  onSaved: (supplier: FinancialCounterparty) => void;
}) {
  const { activeOrganizationId } = useAuth();
  const [personType, setPersonType] = useState<"PF" | "PJ">("PJ");
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const cleanName = name.trim();
    const digits = document.replace(/\D/g, "");
    if (!cleanName) { setError("Informe o nome do fornecedor ou favorecido."); return; }
    if (digits && !(personType === "PF" ? isValidCpf(digits) : isValidCnpj(digits))) {
      setError(personType === "PF" ? "CPF inválido." : "CNPJ inválido.");
      return;
    }
    if (!activeOrganizationId) { setError("Selecione uma empresa antes de cadastrar."); return; }
    setSaving(true);
    setError("");
    try {
      const { data, error: saveError } = await saveRegistration({
        organizationId: activeOrganizationId,
        entity: {
          person_type: personType,
          name: cleanName,
          legal_name: personType === "PJ" ? cleanName : "",
          document: digits,
          phone: phone.trim(),
          is_active: true,
        },
        roles: ["supplier"],
      });
      if (saveError || !data) throw saveError || new Error("O cadastro não retornou um identificador.");
      notifyAdmin("Fornecedor cadastrado com sucesso.", "success");
      onSaved({ id: String(data), name: cleanName, document: digits || null, roles: ["supplier"] });
    } catch (failure) {
      setError(systemErrorMessage(failure, "Não foi possível cadastrar o fornecedor."));
    } finally {
      setSaving(false);
    }
  };

  return <AdminDialog open onClose={() => { if (!saving) onClose(); }} title="Cadastro rápido de fornecedor"
    description="Cadastre o favorecido sem sair da conta a pagar." className="max-w-lg"
    footer={<div className="flex justify-end gap-2">
      <AdminButton variant="secondary" disabled={saving} onClick={onClose}>Cancelar</AdminButton>
      <AdminButton loading={saving} onClick={() => void submit()}>Cadastrar</AdminButton>
    </div>}>
    <div className="grid gap-4 sm:grid-cols-2">
      <FSelect label="Tipo de pessoa" value={personType} options={[{ value: "PF", label: "Pessoa física" }, { value: "PJ", label: "Pessoa jurídica" }]}
        onChange={(event: any) => { setPersonType(event.target.value); setDocument(""); setError(""); }} />
      <FInput label="Nome / razão social" required value={name} onChange={(event: any) => { setName(event.target.value); setError(""); }} />
      <FInput label={personType === "PF" ? "CPF (opcional)" : "CNPJ (opcional)"} inputMode="numeric" value={document}
        onChange={(event: any) => { setDocument(event.target.value); setError(""); }} />
      <FInput label="Telefone (opcional)" value={phone} onChange={(event: any) => setPhone(event.target.value)} />
    </div>
    {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
  </AdminDialog>;
}
