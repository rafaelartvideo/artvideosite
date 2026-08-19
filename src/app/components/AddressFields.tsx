import { useEffect, useState } from "react";
import { emptyAddress, fetchAddressByZipCode, formatZipCode, searchAddressSuggestions, type Address, type AddressSuggestion } from "@/lib/address";

export function AddressFields({
  value,
  onChange,
  inputClassName,
  labelClassName = "text-xs font-bold text-[#5a6a82] uppercase tracking-wide",
}: {
  value: Address;
  onChange: (value: Address) => void;
  inputClassName: string;
  labelClassName?: string;
}) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loadingZip, setLoadingZip] = useState(false);
  const [zipError, setZipError] = useState("");

  useEffect(() => {
    const zipCode = value.zip_code.replace(/\D/g, "");
    if (zipCode.length !== 8) return;
    let active = true;
    setLoadingZip(true);
    setZipError("");
    fetchAddressByZipCode(zipCode)
      .then((address) => { if (active && address) onChange({ ...value, ...address }); })
      .catch(() => { if (active) setZipError("Não foi possível consultar este CEP."); })
      .finally(() => { if (active) setLoadingZip(false); });
    return () => { active = false; };
  }, [value.zip_code]);

  useEffect(() => {
    const query = value.street.trim();
    if (query.length < 3) { setSuggestions([]); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      searchAddressSuggestions(query).then((items) => { if (active) setSuggestions(items); });
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [value.street]);

  const update = (key: keyof Address, nextValue: string) => onChange({ ...value, [key]: nextValue });
  const selectSuggestion = (suggestion: AddressSuggestion) => {
    onChange({ ...value, ...suggestion });
    setSuggestions([]);
  };

  const field = (key: keyof Address, label: string, className = "") => (
    <div className={className}>
      <label className={`${labelClassName} block mb-1.5`}>{label}</label>
      <input
        className={inputClassName}
        value={value[key] || ""}
        onChange={(event) => update(key, event.target.value)}
        autoComplete="off"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={`${labelClassName} block mb-1.5`}>CEP</label>
          <input
            className={inputClassName}
            value={value.zip_code}
            maxLength={9}
            placeholder="00000-000"
            onChange={(event) => update("zip_code", formatZipCode(event.target.value))}
            autoComplete="postal-code"
          />
          {loadingZip && <p className="text-[10px] text-[#5a6a82] mt-1">Consultando CEP...</p>}
          {zipError && <p className="text-[10px] text-amber-700 mt-1">{zipError}</p>}
        </div>
        {field("number", "Número")}
      </div>
      <div className="relative">
        <label className={`${labelClassName} block mb-1.5`}>Rua / Logradouro</label>
        <input
          className={inputClassName}
          value={value.street}
          onChange={(event) => update("street", event.target.value)}
          autoComplete="street-address"
        />
        {suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-20 bg-white border border-[#0d1b2e]/15 rounded-lg shadow-lg overflow-hidden">
            {suggestions.map((suggestion, index) => (
              <button key={`${suggestion.label}-${index}`} type="button" className="w-full text-left px-3 py-2 text-xs text-[#0d1b2e] hover:bg-[#f5f7fa] border-b last:border-b-0 border-[#0d1b2e]/8" onClick={() => selectSuggestion(suggestion)}>
                {suggestion.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {field("complement", "Complemento")}
        {field("neighborhood", "Bairro")}
        {field("city", "Cidade")}
        {field("state", "Estado (UF)")}
      </div>
    </div>
  );
}

export function normalizeAddress(value?: Partial<Address> | null): Address {
  return { ...emptyAddress, ...(value || {}) };
}
