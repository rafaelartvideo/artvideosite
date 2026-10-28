import { MapPin } from "lucide-react";
import { getAddressMapUrl, type Address } from "@/lib/address";

/** Usa a mesma localização do cadastro, tanto no editor quanto nos detalhes. */
export function AddressMapLink({ address, className = "" }: {
  address: Partial<Address>;
  className?: string;
}) {
  const url = getAddressMapUrl(address);
  if (!url) return null;
  return <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Abrir endereço no mapa"
    title="Abrir localização no mapa"
    className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-primary/25 bg-card px-3 text-xs font-bold text-primary transition-colors hover:bg-primary/5 ${className}`}
  ><MapPin size={15} aria-hidden="true" /> Abrir mapa</a>;
}
