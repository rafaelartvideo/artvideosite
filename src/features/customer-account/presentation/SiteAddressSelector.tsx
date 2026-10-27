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
    <div className={canSave ? "grid grid-cols-2 gap-3" : "grid grid-cols-1 gap-3"}>
      <label className={"flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border p-3 transition-colors sm:gap-3 sm:p-4 " +
        (choice === "other" ? "border-[var(--art-primary)] bg-[#eff6ff]" : "border-[#e1e9f4] bg-white hover:bg-blue-50")}>
        <input type="radio" name="service-address-choice" className="h-4 w-4 shrink-0 accent-blue-600"
          checked={choice === "other"} onChange={onSelectOther}/>
        <MapPin size={20} className="hidden shrink-0 text-[var(--art-primary)] sm:block"/>
        <span className="min-w-0">
          <strong className="block text-[13px] leading-5 text-[#203650]">Usar outro endereço</strong>
          <span className="block text-[11px] leading-4 text-[#6c7e94]">Informe o CEP e o local do atendimento</span>
        </span>
      </label>
      {canSave && <button type="button" onClick={onAddNew} aria-pressed={choice === "new"}
        className={"flex min-w-0 items-center justify-center gap-2 rounded-lg border p-3 text-center text-[12px] font-semibold transition-colors sm:p-4 " +
          (choice === "new" ? "border-[var(--art-primary)] bg-[#eff6ff] text-[var(--art-primary)]" :
            "border-[#c8dafa] bg-[#f7faff] text-[var(--art-primary)] hover:border-[var(--art-primary)] hover:bg-[#edf3ff]")}>
        <Plus size={18} className="shrink-0"/>
        <span className="flex flex-col leading-4"><span>Adicionar</span><span>Novo</span></span>
      </button>}
    </div>
  </div>;
}
