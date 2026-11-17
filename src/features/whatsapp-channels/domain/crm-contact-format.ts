import { formatCnpj, formatCpf } from "@/shared/domain/formatters";

export type CrmContactAddress = {
  id?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  reference?: string | null;
  is_default?: boolean | null;
};

export function formatCrmDocument(value: string | null | undefined): string {
  const raw=String(value || "").trim();
  if(!raw)return "Não informado";
  const digits=raw.replace(/\D/g,"");
  if(digits.length===11)return formatCpf(digits);
  if(digits.length===14)return formatCnpj(digits);
  return raw;
}

export function formatCrmCep(value: string | null | undefined): string {
  const raw=String(value || "").trim();
  if(!raw)return "";
  const digits=raw.replace(/\D/g,"");
  return digits.length===8?`${digits.slice(0,5)}-${digits.slice(5)}`:raw;
}

/** Endereço compacto e completo, no padrão usado nos detalhes dos cadastros. */
export function formatCrmFullAddress(address: CrmContactAddress): string {
  const streetNumber=[address.street,address.number].map(value=>String(value||"").trim()).filter(Boolean).join(", ");
  const locality=[address.city,address.state].map(value=>String(value||"").trim()).filter(Boolean).join(" - ");
  const cep=formatCrmCep(address.zip_code);
  const segments=[
    [streetNumber,address.complement].map(value=>String(value||"").trim()).filter(Boolean).join(", "),
    address.neighborhood,
    locality,
    cep?"CEP "+cep:"",
    address.reference?"Referência: "+String(address.reference).trim():"",
  ].map(value=>String(value||"").trim()).filter(Boolean);
  return segments.join(" · ") || "Endereço não informado";
}

export function orderedCrmAddresses(addresses: CrmContactAddress[] | null | undefined): CrmContactAddress[] {
  if(!Array.isArray(addresses))return [];
  return [...addresses].sort((left,right)=>Number(Boolean(right.is_default))-Number(Boolean(left.is_default)));
}
