import { useEffect, useRef, useState } from "react";
import { fetchAddressByZipCode, formatZipCode } from "@/lib/address";
import { FEmailInput, FInput, FPhoneInput } from "@/shared/ui/admin/AdminFormControls";

export type SiteContactGroup = "channels" | "social" | "address" | "hours" | "business";

export const siteContactGroups: { id: SiteContactGroup; title: string; description: string }[] = [
  { id: "channels", title: "Canais de contato", description: "Telefone, WhatsApp e e-mail" },
  { id: "social", title: "Redes sociais", description: "Instagram e links públicos" },
  { id: "address", title: "Endereço", description: "Localização e CEP da empresa" },
  { id: "hours", title: "Horário de funcionamento", description: "Dias e horários de atendimento" },
  { id: "business", title: "Identificação pública", description: "Nome exibido no site" },
];

export function SiteContactFields({
  group, settings, onChange, disabled,
}: {
  group: SiteContactGroup;
  settings: Record<string, unknown>;
  onChange: (key: string, value: string) => void;
  disabled: boolean;
}) {
  const zip = String(settings.zip_code || "");
  const [loadingZip, setLoadingZip] = useState(false);
  const [zipError, setZipError] = useState("");
  const onChangeRef = useRef(onChange);
  const previousZipRef = useRef(zip);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (group !== "address" || disabled) return;
    // Looking at an existing address must not silently rewrite its saved fields.
    if (previousZipRef.current === zip) return;
    previousZipRef.current = zip;
    const digits = zip.replace(/\D/g, "");
    if (digits.length !== 8) { setZipError(""); return; }
    let active = true;
    setZipError("");
    setLoadingZip(true);
    fetchAddressByZipCode(digits).then(address => {
      if (!active) return;
      if (!address) { setZipError("CEP não encontrado."); return; }
      for (const [key, value] of Object.entries({
        zip_code: address.zip_code || zip,
        street: address.street || "",
        neighborhood: address.neighborhood || "",
        city: address.city || "",
        state: address.state || "",
      })) onChangeRef.current(key, String(value));
    }).catch(() => {
      if (active) setZipError("Não foi possível consultar este CEP.");
    }).finally(() => { if (active) setLoadingZip(false); });
    return () => { active = false; };
  }, [group, disabled, zip]);

  const value = (key: string) => String(settings[key] ?? "");
  if (group === "channels") return <div className="grid gap-3 sm:grid-cols-2">
    <FPhoneInput label="Telefone" value={value("phone")} disabled={disabled} onChange={(event: any) => onChange("phone", event.target.value)} />
    <FPhoneInput label="WhatsApp" mobile value={value("whatsapp")} disabled={disabled} onChange={(event: any) => onChange("whatsapp", event.target.value)} />
    <div className="sm:col-span-2"><FEmailInput label="E-mail" value={value("email")} disabled={disabled} onChange={(event: any) => onChange("email", event.target.value)} /></div>
  </div>;
  if (group === "social") return <FInput label="Instagram" value={value("instagram")} disabled={disabled}
    onChange={(event: any) => onChange("instagram", event.target.value)} placeholder="@empresa" />;
  if (group === "hours") return <FInput label="Horário" value={value("business_hours")} disabled={disabled}
    onChange={(event: any) => onChange("business_hours", event.target.value)} placeholder="Seg a Sex: 8h às 18h" />;
  if (group === "business") return <FInput label="Nome da empresa" value={value("company_name")} disabled={disabled}
    onChange={(event: any) => onChange("company_name", event.target.value)} placeholder="Eletrônica Artvideo" />;
  return <div className="grid gap-3 sm:grid-cols-2">
    <div>
      <FInput label="CEP" value={value("zip_code")} disabled={disabled} maxLength={9}
        onChange={(event: any) => onChange("zip_code", formatZipCode(event.target.value))} placeholder="00000-000" />
      {loadingZip && <p className="mt-1 text-xs text-muted-foreground">Consultando CEP...</p>}
      {zipError && <p className="mt-1 text-xs text-amber-600">{zipError}</p>}
    </div>
    <div><FInput label="Número" value={value("number")} disabled={disabled}
      onChange={(event: any) => onChange("number", event.target.value)} /></div>
    <div className="sm:col-span-2"><FInput label="Rua" value={value("street")} disabled={disabled}
      onChange={(event: any) => onChange("street", event.target.value)} placeholder="Rua da empresa" /></div>
    <FInput label="Bairro" value={value("neighborhood")} disabled={disabled}
      onChange={(event: any) => onChange("neighborhood", event.target.value)} />
    <FInput label="Complemento" value={value("complement")} disabled={disabled}
      onChange={(event: any) => onChange("complement", event.target.value)} placeholder="Sala, bloco..." />
    <FInput label="Cidade" value={value("city")} disabled={disabled}
      onChange={(event: any) => onChange("city", event.target.value)} />
    <FInput label="Estado" value={value("state")} disabled={disabled} maxLength={2}
      onChange={(event: any) => onChange("state", event.target.value.toUpperCase())} placeholder="SP" />
  </div>;
}
