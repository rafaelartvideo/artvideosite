import type { ReactNode } from "react";

export function normalizeWhatsAppPhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) return `55${digits}`;
  return digits;
}

/** Apenas abre o aplicativo externo; nenhuma mensagem é enviada pelo CRM. */
export function CompanyWhatsAppAction({phone,children,className,title,disabled}:{
  phone?:string|null; name?:string|null; organizationId?:string|null;
  children:ReactNode; className?:string; title?:string; disabled?:boolean;
}) {
  const digits=normalizeWhatsAppPhone(phone);
  return <button type="button" disabled={disabled || !digits}
    onClick={()=>{if(!disabled&&digits)window.open(`https://wa.me/${digits}`,"_blank","noopener,noreferrer");}}
    title={title || "Abrir conversa pelo WhatsApp"} aria-label={title || "Abrir conversa pelo WhatsApp"}
    className={className}>{children}</button>;
}
