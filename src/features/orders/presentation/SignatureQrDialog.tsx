import { useState } from "react";
import { Check, ClipboardCopy, ExternalLink } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";

export function SignatureQrDialog({ link, onClose }: { link: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const validLink = (() => {
    if (!link) return null;
    try {
      const parsed = new URL(link);
      return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
    } catch { return null; }
  })();
  return <AdminDialog
    open={Boolean(link)}
    onClose={() => { setCopied(false); onClose(); }}
    title="Assinatura pronta"
    description="O QR Code abre o mesmo link enviado ao cliente. Mostre-o para que ele possa escanear e assinar no próprio celular."
    className="max-w-lg"
    footer={<div className="flex flex-wrap justify-end gap-2">
      <BtnSecondary onClick={() => { setCopied(false); onClose(); }}>Fechar</BtnSecondary>
      {validLink && <BtnPrimary onClick={() => window.open(validLink, "_blank", "noopener,noreferrer")}><ExternalLink size={14} className="mr-2 inline" />Abrir assinatura</BtnPrimary>}
    </div>}
  >
    {validLink ? <div className="space-y-4 text-center">
      <div className="mx-auto w-fit rounded-2xl border border-border bg-white p-4">
        <QRCodeCanvas value={validLink} size={228} level="M" marginSize={2} aria-label="QR Code do link de assinatura" />
      </div>
      <p className="text-sm font-semibold text-foreground">Escaneie para abrir o documento e assinar</p>
      <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted p-2 text-left">
        <span className="min-w-0 flex-1 break-all text-xs text-foreground">{validLink}</span>
        <BtnSecondary aria-label="Copiar link" onClick={() => void navigator.clipboard.writeText(validLink).then(() => setCopied(true)).catch(() => setCopied(false))}>{copied ? <Check size={16} /> : <ClipboardCopy size={16} />}</BtnSecondary>
      </div>
      <p className="text-xs text-muted-foreground">O QR Code respeita a validade e a verificação de identidade do link original.</p>
    </div> : <p className="text-sm text-destructive">Não foi possível montar o QR Code deste link.</p>}
  </AdminDialog>;
}
