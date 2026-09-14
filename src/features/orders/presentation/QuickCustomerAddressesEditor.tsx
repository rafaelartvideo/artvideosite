import { Plus, Trash2 } from "lucide-react";
import { AddressFields } from "@/shared/ui/address/AddressFields";
import { emptyAddress, type Address } from "@/lib/address";
import { BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { FInput, INPUT } from "@/shared/ui/admin/AdminFormControls";

export function newQuickCustomerAddress(isDefault = false): Address {
  return {
    ...emptyAddress,
    id: crypto.randomUUID(),
    is_default: isDefault,
    reference: "",
    shared_map_url: "",
  };
}

export function QuickCustomerAddressesEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: Address[];
  onChange: (value: Address[]) => void;
  disabled?: boolean;
}) {
  const update = (index: number, next: Address) => {
    const addresses = [...value];
    addresses[index] = next;
    onChange(addresses);
  };

  const add = () => onChange([...value, newQuickCustomerAddress(value.length === 0)]);

  const remove = (index: number) => {
    const removedDefault = value[index]?.is_default === true;
    const next = value.filter((_, currentIndex) => currentIndex !== index);
    if (removedDefault && next.length) next[0] = { ...next[0], is_default: true };
    onChange(next);
  };

  const markDefault = (index: number) => {
    onChange(value.map((address, currentIndex) => ({
      ...address,
      is_default: currentIndex === index,
    })));
  };

  return <Section
    title="Endereços do cliente"
    actions={!disabled ? <BtnSecondary onClick={add}><Plus size={14} /> Adicionar endereço</BtnSecondary> : undefined}
  >
    {value.length === 0 ? <p className="py-6 text-center text-sm text-[#5a6a82]">Não há endereço cadastrado.</p> : <div className="divide-y divide-[#0d1b2e]/8">
      {value.map((address, index) => <div key={address.id || `address-${index}`} className="py-5 first:pt-0 last:pb-0">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-black text-[#0d1b2e]">Endereço {index + 1}</span>
              {address.is_default && <span className="text-[10px] font-black uppercase tracking-wide text-[#0057e7]">Principal</span>}
            </div>
          </div>
          {!disabled && !address.is_default && <button type="button" onClick={() => markDefault(index)} className="rounded-lg border border-[#0057e7]/25 px-3 py-2 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5">Marcar principal</button>}
          {!disabled && <button type="button" onClick={() => remove(index)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50" aria-label={`Remover endereço ${index + 1}`} title="Remover endereço"><Trash2 size={15} /></button>}
        </div>

        <AddressFields value={address} onChange={next => update(index, { ...address, ...next })} inputClassName={INPUT} />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FInput label="Referência" disabled={disabled} value={address.reference || ""} onChange={(event: any) => update(index, { ...address, reference: event.target.value })} />
          <FInput label="Link de localização" disabled={disabled} type="url" placeholder="Google Maps, Waze, Apple Maps..." value={address.shared_map_url || ""} onChange={(event: any) => update(index, { ...address, shared_map_url: event.target.value })} />
        </div>
      </div>)}
    </div>}
  </Section>;
}
