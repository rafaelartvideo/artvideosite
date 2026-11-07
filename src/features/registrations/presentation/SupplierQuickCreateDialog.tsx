import { useRef, useState } from "react";
import { hasCustomerAddressData, normalizeSharedMapUrl, validateCustomerAddress } from "@/lib/address";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { emptyEmployeeAccessForm } from "@/features/access/presentation/UserAccessSection";
import type { InventorySupplier } from "@/features/inventory/infrastructure/inventory.repository";
import { useRegistrationLookups } from "../application/useRegistrationLookups";
import {
  emptyRegistrationAddress,
  emptyRegistrationForm,
  registrationAddressPayload,
  registrationEntityPayload,
  validateRegistrationFormFields,
  type RegistrationAddressForm,
  type RegistrationFieldErrors,
  type RegistrationFormState,
} from "../domain/registration-form";
import {
  getRegistration,
  saveRegistration,
  syncRegistrationAddresses,
  syncRegistrationSupplierItems,
  type SupplierInventoryItem,
} from "../infrastructure/registrations.repository";
import { RegistrationEditor } from "./RegistrationEditor";

/** Cadastro rápido, com o MESMO formulário e consultas do módulo Cadastros.
 * O vínculo Fornecedor é implícito; nenhum outro tipo de cadastro é selecionado. */
export function SupplierQuickCreateDialog({
  organizationId, onClose, onCreated,
}: {
  organizationId: string;
  onClose: () => void;
  onCreated: (supplier: InventorySupplier) => void;
}) {
  const [form, setForm] = useState<RegistrationFormState>(() => ({
    ...emptyRegistrationForm(), roles: ["supplier"], person_type: "PJ",
  }));
  const [addresses, setAddresses] = useState<RegistrationAddressForm[]>([emptyRegistrationAddress(true)]);
  const [supplierItems, setSupplierItems] = useState<SupplierInventoryItem[]>([]);
  const [fieldErrors, setFieldErrors] = useState<RegistrationFieldErrors>({});
  const [addressValidationAttempted, setAddressValidationAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const createdIdRef = useRef<string | null>(null);

  const lookups = useRegistrationLookups({
    organizationId,
    registrationId: createdIdRef.current,
    form,
    addresses,
    setForm,
    setAddresses,
  });

  const save = async () => {
    if (!organizationId || saving) return;
    const normalizedForm: RegistrationFormState = { ...form, roles: ["supplier"] };
    const errors = validateRegistrationFormFields(normalizedForm);
    const includedAddresses = addresses.filter(hasCustomerAddressData);
    const invalidAddress = includedAddresses.some(address => Object.keys(validateCustomerAddress(address)).length > 0);
    setFieldErrors(errors);
    setAddressValidationAttempted(true);
    if (Object.keys(errors).length) {
      setError("Revise os campos indicados antes de cadastrar o fornecedor.");
      return;
    }
    if (invalidAddress) {
      setError("Preencha corretamente o endereço informado ou deixe-o vazio.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await saveRegistration({
        id: createdIdRef.current,
        organizationId,
        entity: registrationEntityPayload(normalizedForm),
        roles: ["supplier"],
      });
      if (saved.error || !saved.data) throw saved.error || new Error("Não foi possível salvar o cadastro.");
      const id = String(saved.data);
      createdIdRef.current = id;

      const addressPayloads = includedAddresses.map(address =>
        registrationAddressPayload({
          ...address, shared_map_url: normalizeSharedMapUrl(address.shared_map_url),
        }),
      );
      const syncedAddresses = await syncRegistrationAddresses(organizationId, id, addressPayloads);
      if (syncedAddresses.error) throw syncedAddresses.error;

      if (supplierItems.length) {
        const linkedItems = await syncRegistrationSupplierItems(
          organizationId, id, supplierItems.map(item => item.id),
        );
        if (linkedItems.error) throw linkedItems.error;
      }

      const refreshed = await getRegistration(organizationId, id);
      if (refreshed.error || !refreshed.data) {
        throw refreshed.error || new Error("O fornecedor foi salvo, mas não foi possível consultar seus dados.");
      }
      const supplier = refreshed.data;
      onCreated({
        id,
        name: String(supplier.name || supplier.trade_name || supplier.legal_name || "Fornecedor"),
        legal_name: supplier.legal_name || null,
        trade_name: supplier.trade_name || null,
        document: supplier.document || null,
        person_type: supplier.person_type === "PJ" ? "PJ" : "PF",
        is_active: supplier.is_active !== false,
        supplier_reference: null,
      });
      onClose();
    } catch (cause) {
      setError(systemErrorMessage(cause, "Não foi possível cadastrar o fornecedor."));
    } finally {
      setSaving(false);
    }
  };

  return <>
    <RegistrationEditor
      creating
      supplierQuickCreate
      form={form}
      setForm={setForm}
      addresses={addresses}
      setAddresses={setAddresses}
      addressValidationAttempted={addressValidationAttempted}
      supplierItems={supplierItems}
      setSupplierItems={setSupplierItems}
      organizationId={organizationId}
      canModify={!saving}
      showAccess={false}
      accessForm={emptyEmployeeAccessForm()}
      onAccessChange={() => undefined}
      accessExisting={false}
      accessLoading={false}
      canModifyAccess={false}
      lookups={lookups}
      fieldErrors={fieldErrors}
      onClearFieldError={key => setFieldErrors(current => {
        if (!current[key]) return current;
        const next = { ...current };
        delete next[key];
        return next;
      })}
      saving={saving}
      onSave={() => void save()}
      onClose={() => { if (!saving) onClose(); }}
      onToggleRole={() => undefined}
    />
    {error && <div role="alert" className="fixed bottom-5 left-1/2 z-[220] w-[min(92vw,600px)] -translate-x-1/2 rounded-lg border border-destructive/30 bg-card px-4 py-3 text-sm font-semibold text-destructive shadow-xl">
      {error}
    </div>}
  </>;
}
