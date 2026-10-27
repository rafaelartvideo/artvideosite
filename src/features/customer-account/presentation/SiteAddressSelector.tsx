import { House, MapPin, Plus } from "lucide-react";
import { formatSiteZip, type SiteAddress } from "../infrastructure/customer-account-settings.repository";

export type SiteAddressChoice = "saved" | "other" | "new";

/** Seleção de endereços compartilhada pelos formulários públicos de serviço e orçamento. */
export function SiteAddressSelector({
  addresses, choice, selectedId, canSave, onSelectSaved, onSelectOther, onAddNew,
}: {
  addresses: SiteAddress[];
  choice: SiteAddressChoice;
  selectedId: string | null;
  canSave: boolean;
  onSelectSaved: (address: SiteAddress) => void;
  onSelectOther: () => void;
  onAddNew: () => void;
}) {
  return <div className="space-y-3">
    {addresses.length > 0 && <p className="text-[13px] font-bold text-[#203650]">Onde será o atendimento?</p>}
    {addresses.map(address => {
      const selected = choice === "saved" && selectedId === address.id;
      return <label key={address.id} className={"flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors " +
        (selected ? "border-[var(--art-primary)] bg-[#eff6ff]" : "border-[#e1e9f4] bg-white hover:bg-blue-50")}>
        <input type="radio" name="service-address-choice" className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
          checked={selected} onChange={() => onSelectSaved(address)}/>
        <House size={20} className="shrink-0 text-[var(--art-primary)]"/>
        <span className="min-w-0">
          <strong className="block text-[13px] text-[#203650]">{address.label}
            {address.is_default && <span className="ml-2 inline-block rounded-full bg-[#e0edff] px-2 py-0.5 text-[10px] font-medium text-[var(--art-primary)]">Principal</span>}
          </strong>
          <span className="mt-1 block text-[12px] leading-5 text-[#63758c]">
            {address.street}, {address.number} · {address.district} · {address.city}/{address.state} · CEP {formatSiteZip(address.postal_code)}
          </span>
        </span>
      </label>;
    })}
    <label className={"flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors " +
      (choice !== "saved" ? "border-[var(--art-primary)] bg-[#eff6ff]" : "border-[#e1e9f4] bg-white hover:bg-blue-50")}>
      <input type="radio" name="service-address-choice" className="h-4 w-4 shrink-0 accent-blue-600"
        checked={choice !== "saved"} onChange={onSelectOther}/>
      <MapPin size={20} className="shrink-0 text-[var(--art-primary)]"/>
      <span>
        <strong className="block text-[13px] text-[#203650]">Usar outro endereço</strong>
        <span className="text-[11px] text-[#6c7e94]">Informe o CEP e o local do atendimento</span>
      </span>
    </label>
    {canSave && <button type="button" onClick={onAddNew}
      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#c8dafa] bg-[#f7faff] px-3.5 text-[12px] font-semibold text-[var(--art-primary)] transition-colors hover:border-[var(--art-primary)] hover:bg-[#edf3ff]">
      <Plus size={16}/> Adicionar novo endereço
    </button>}
  </div>;
}
