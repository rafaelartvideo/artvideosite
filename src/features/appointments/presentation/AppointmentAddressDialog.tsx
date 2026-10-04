import type { Dispatch, SetStateAction } from "react";
import type { Address } from "@/lib/address";
import type { AppointmentFormState } from "../application/appointment-form";
import { AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { FInput } from "@/shared/ui/admin/AdminFormControls";
import { Checkbox } from "@/shared/ui/primitives/checkbox";

type Props = {
  form: AppointmentFormState;
  customer: any;
  setForm: Dispatch<SetStateAction<AppointmentFormState>>;
  onClose: () => void;
  onZipBlur: () => void;
};

export function AppointmentAddressDialog({ form, customer, setForm, onClose, onZipBlur }: Props) {
  const useCustomerAddress = (checked: boolean) => {
    if (checked && customer) {
      const address = (customer.addresses || []).find((item: Address) => item.is_default) || customer.addresses?.[0];
      setForm(current => ({
        ...current,
        address_source: "customer",
        customer_address_id: address?.id || "",
        zip_code: address?.zip_code || "",
        street: address?.street || "",
        number: address?.number || "",
        complement: address?.complement || "",
        neighborhood: address?.neighborhood || "",
        city: address?.city || "",
        state: address?.state || "",
      }));
      return;
    }
    setForm(current => ({ ...current, address_source: "custom", customer_address_id: "" }));
  };

  return <AdminDialog
    open
    onClose={onClose}
    title="Endereço do atendimento"
    description="Informe onde o atendimento será realizado."
    minimizedDescription={[form.street, form.number, form.neighborhood, form.city, form.state].filter(Boolean).join(", ") || "Endereço em preenchimento"}
    className="max-w-lg"
    footer={<div className="flex justify-end gap-2">
      <BtnSecondary onClick={onClose}>Cancelar</BtnSecondary>
      <BtnPrimary onClick={onClose}>Confirmar</BtnPrimary>
    </div>}
  >
    <label className="mb-4 flex items-center gap-2 text-sm font-semibold">
      <Checkbox checked={form.address_source === "customer"} onCheckedChange={checked => useCustomerAddress(checked === true)} />
      Usar endereço cadastrado do cliente
    </label>
    <div className="grid gap-3 sm:grid-cols-2">
      <FInput label="CEP" value={form.zip_code} onChange={event => setForm(current => ({ ...current, zip_code: event.target.value }))} onBlur={onZipBlur} />
      <FInput label="Rua" value={form.street} onChange={event => setForm(current => ({ ...current, street: event.target.value }))} />
      <FInput label="Número" value={form.number} onChange={event => setForm(current => ({ ...current, number: event.target.value }))} />
      <FInput label="Complemento" value={form.complement} onChange={event => setForm(current => ({ ...current, complement: event.target.value }))} />
      <FInput label="Bairro" value={form.neighborhood} onChange={event => setForm(current => ({ ...current, neighborhood: event.target.value }))} />
      <FInput label="Cidade" value={form.city} onChange={event => setForm(current => ({ ...current, city: event.target.value }))} />
      <FInput label="Estado" value={form.state} onChange={event => setForm(current => ({ ...current, state: event.target.value }))} />
    </div>

  </AdminDialog>;
}
