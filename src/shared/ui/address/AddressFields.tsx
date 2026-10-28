import { useEffect, useState } from "react";
import {
  emptyAddress, fetchAddressByZipCode, formatZipCode,
  type Address, type CustomerAddressField, type CustomerAddressFieldErrors,
} from "@/lib/address";

export function AddressFields({
  value,
  onChange,
  inputClassName,
  labelClassName = "text-xs font-bold text-[#5a6a82] uppercase tracking-wide",
  twoColumns = false,
  required = false,
  errors = {},
}: {
  value: Address;
  onChange: (value: Address) => void;
  inputClassName: string;
  labelClassName?: string;
  twoColumns?: boolean;
  required?: boolean;
  errors?: CustomerAddressFieldErrors;
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
  const label = (title: string, key: keyof Address) => <label className={`${labelClassName} mb-1.5 block`}>
    {title}{required && key !== "complement" && <span className="ml-0.5 text-red-600 dark:text-red-400" aria-hidden="true">*</span>}
  </label>;
  const errorText = (key: keyof Address) => {
    const message = errors[key as CustomerAddressField];
    return message ? <p className="mt-1 text-[10px] font-semibold text-red-600" role="alert">{message}</p> : null;
  };
  const field = (key: keyof Address, title: string, className = "") => (
    <div className={className || "min-w-0"}>
      {label(title, key)}
      <input
        className={inputClassName}
        value={value[key] || ""}
        aria-invalid={Boolean(errors[key as CustomerAddressField]) || undefined}
        onChange={(event) => update(key, event.target.value)}
        required={required && key !== "complement"}
        autoComplete="off"
      />
      {errorText(key)}
    </div>
  );
  const zipField = <div className="min-w-0">
    {label("CEP", "zip_code")}
    <input
      className={inputClassName}
      value={value.zip_code}
      aria-invalid={Boolean(errors.zip_code) || undefined}
      required={required}
      inputMode="numeric"
      maxLength={9}
      placeholder="00000-000"
      onChange={(event) => update("zip_code", formatZipCode(event.target.value))}
      autoComplete="postal-code"
    />
    {loadingZip && <p className="mt-1 text-[10px] text-[#5a6a82]">Consultando CEP...</p>}
    {zipError && <p className="mt-1 text-[10px] text-amber-700">{zipError}</p>}
    {errorText("zip_code")}
  </div>;

  if (twoColumns) return <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
    {zipField}
    {field("street", "Rua / Logradouro", "min-w-0")}
    {field("number", "Número", "min-w-0")}
    {field("complement", "Complemento", "min-w-0")}
    {field("neighborhood", "Bairro", "min-w-0")}
    {field("city", "Cidade", "min-w-0")}
    {field("state", "Estado (UF)", "min-w-0 sm:col-span-2")}
  </div>;

  return <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      {zipField}
      {field("number", "Número")}
    </div>
    {field("street", "Rua / Logradouro")}
    <div className="grid gap-4 sm:grid-cols-2">
      {field("complement", "Complemento")}
      {field("neighborhood", "Bairro")}
      {field("city", "Cidade")}
      {field("state", "Estado (UF)")}
    </div>
  </div>;
}

export function normalizeAddress(value?: Partial<Address> | null): Address {
  return { ...emptyAddress, ...(value || {}) };
}
