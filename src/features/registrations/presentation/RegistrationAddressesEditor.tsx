import { Plus, Trash2 } from "lucide-react";
import { AddressFields } from "@/shared/ui/address/AddressFields";
import { BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { FInput, INPUT } from "@/shared/ui/admin/AdminFormControls";
import {
  emptyRegistrationAddress,
  type RegistrationAddressForm,
} from "../domain/registration-form";

export function RegistrationAddressesEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: RegistrationAddressForm[];
  onChange: (value: RegistrationAddressForm[]) => void;
  disabled?: boolean;
}) {
  const update = (index: number, next: RegistrationAddressForm) => {
    const addresses = [...value];
    addresses[index] = next;
    onChange(addresses);
  };

  const markPrimary = (index: number) => {
    onChange(value.map((address, currentIndex) => ({
      ...address,
      is_primary: currentIndex === index,
      is_default: currentIndex === index,
      type: currentIndex === index && (!address.type || address.type === "Outro") ? "Principal" : address.type,
    })));
  };

  const remove = (index: number) => {
    const removedWasPrimary = value[index]?.is_primary;
    const next = value.filter((_, currentIndex) => currentIndex !== index);
    if (removedWasPrimary && next.length) {
      next[0] = { ...next[0], is_primary: true, is_default: true, type: next[0].type || "Principal" };
    }
    onChange(next);
  };

  const add = () => {
    onChange([...value, emptyRegistrationAddress(value.length === 0)]);
  };

  return <Section
    title="Endereços"
    actions={!disabled ? <BtnSecondary onClick={add}><Plus size={14} /> Adicionar endereço</BtnSecondary> : undefined}
  >
    {value.length === 0 ? <div className="py-3">
      <p className="text-sm text-[#5a6a82]">Não há endereço cadastrado.</p>
      {!disabled && <BtnSecondary className="mt-3" onClick={add}><Plus size={14} /> Adicionar endereço</BtnSecondary>}
    </div> : <div className="divide-y divide-[#0d1b2e]/8">
      {value.map((address, index) => <div key={address.id || `new-${index}`} className="py-5 first:pt-0 last:pb-0">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-black text-[#0d1b2e]">Endereço {index + 1}</span>
              {address.is_primary && <span className="text-[10px] font-black uppercase tracking-wide text-[#0057e7]">Principal</span>}
            </div>
          </div>
          {!disabled && !address.is_primary && <button type="button" onClick={() => markPrimary(index)} className="rounded-lg border border-[#0057e7]/25 px-3 py-2 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5">Marcar principal</button>}
          {!disabled && <button type="button" onClick={() => remove(index)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50" aria-label={`Remover endereço ${index + 1}`} title="Remover endereço"><Trash2 size={15} /></button>}
        </div>

        <AddressFields
          value={address}
          onChange={next => update(index, { ...address, ...next })}
          inputClassName={`${INPUT} ${disabled ? "pointer-events-none opacity-70" : ""}`}
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <FInput label="Tipo / Apelido" disabled={disabled} value={address.type || ""} onChange={(event: any) => update(index, { ...address, type: event.target.value })} />
          <FInput label="Referência" disabled={disabled} value={address.reference || ""} onChange={(event: any) => update(index, { ...address, reference: event.target.value })} />
          <FInput label="Link de localização" disabled={disabled} type="url" placeholder="Google Maps, Waze, Apple Maps..." value={address.shared_map_url || ""} onChange={(event: any) => update(index, { ...address, shared_map_url: event.target.value })} />
        </div>
      </div>)}
    </div>}
  </Section>;
}
