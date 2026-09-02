import type { Dispatch, SetStateAction } from "react";
import { X } from "lucide-react";
import type { Address } from "@/lib/address";
import type { AppointmentFormState } from "../application/appointment-form";
import { AdminIconButton, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { FInput } from "@/shared/ui/admin/AdminFormControls";
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/primitives/dialog";

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

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent showClose={false} className="max-w-lg gap-0 rounded-xl bg-white p-5 shadow-2xl">
      <DialogTitle className="sr-only">Endereço do atendimento</DialogTitle>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-black text-[#0d1b2e]">Endereço do atendimento</h3>
        <AdminIconButton ariaLabel="Fechar endereço" onClick={onClose} variant="ghost"><X size={17} /></AdminIconButton>
      </div>
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
      <div className="mt-4 flex justify-end gap-2">
        <BtnSecondary onClick={onClose}>Cancelar</BtnSecondary>
        <BtnPrimary onClick={onClose}>Confirmar</BtnPrimary>
      </div>
    </DialogContent>
  </Dialog>;
}
