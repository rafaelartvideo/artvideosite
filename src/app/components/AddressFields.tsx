import { useEffect, useState } from "react";
import { emptyAddress, fetchAddressByZipCode, formatZipCode, type Address } from "@/lib/address";

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

  const update = (key: keyof Address, nextValue: string) => onChange({ ...value, [key]: nextValue });

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
      <div>
        <label className={`${labelClassName} block mb-1.5`}>Rua / Logradouro</label>
        <input
          className={inputClassName}
          value={value.street}
          onChange={(event) => update("street", event.target.value)}
          autoComplete="street-address"
        />
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
