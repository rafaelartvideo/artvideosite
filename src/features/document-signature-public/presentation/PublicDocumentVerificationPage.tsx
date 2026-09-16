import { useEffect, useState } from "react";
import { CheckCircle2, FileCheck2, ShieldCheck, XCircle } from "lucide-react";
import { useParams } from "react-router";
import {
  verifyPublicSignedDocument,
  type PublicDocumentVerification,
} from "../infrastructure/public-document-signature.repository";

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function signerTypeLabel(value: "employee" | "external") {
  return value === "employee" ? "Funcionário" : "Cliente / responsável";
}

function validationLabel(value: "stored_employee_signature" | "email_otp") {
  return value === "stored_employee_signature"
    ? "Assinatura cadastrada do funcionário"
    : "CPF/CNPJ + código por e-mail";
}

export function PublicDocumentVerificationPage() {
  const { verificationCode = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [document, setDocument] = useState<PublicDocumentVerification | null>(null);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDocument(null);
    setInvalid(false);
    void verifyPublicSignedDocument(verificationCode)
      .then(result => {
        if (!cancelled) setDocument(result);
      })
      .catch(() => {
        if (!cancelled) setInvalid(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [verificationCode]);

  return <main className="min-h-dvh bg-[#f3f6fa] px-4 py-6 text-[#172536] sm:py-10">
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#0057e7]">Verificação de autenticidade</p>
          <h1 className="mt-1 text-xl font-black text-[#0d1b2e] sm:text-2xl">Documento assinado eletronicamente</h1>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#e8f0ff] text-[#0057e7]"><ShieldCheck size={23} /></div>
      </header>

      {loading && <div className="rounded-2xl border border-[#dbe2ea] bg-white p-8 text-center text-sm font-semibold text-[#64748b]">Verificando autenticidade...</div>}

      {!loading && invalid && <div className="rounded-2xl border border-red-200 bg-white p-7 text-center shadow-sm"><XCircle size={34} className="mx-auto text-red-500" /><h2 className="mt-4 text-xl font-black text-[#0d1b2e]">Documento não localizado</h2><p className="mt-2 text-sm leading-6 text-[#64748b]">Não foi possível confirmar um documento assinado com este código. Confira o código ou o QR Code apresentado no documento.</p></div>}

      {!loading && document && <div className="space-y-4">
        <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
          <div className="flex items-start gap-4 bg-emerald-50 p-5 sm:p-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 size={27} /></div>
            <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">Autenticidade confirmada</p><h2 className="mt-1 text-xl font-black text-[#0d1b2e]">Documento válido no sistema</h2><p className="mt-1 text-sm text-[#64748b]">Os dados abaixo correspondem ao registro imutável preservado no momento da assinatura.</p></div>
          </div>
          <div className="grid gap-px bg-[#e8edf3] sm:grid-cols-2">
            <Info label="Empresa" value={document.company_name} />
            <Info label="Documento" value={document.document_name} />
            <Info label="Ordem de Serviço" value={`OS ${document.order_number}`} />
            <Info label="Assinado em" value={formatDateTime(document.signed_at)} />
            <div className="sm:col-span-2"><Info label="Código de autenticidade" value={document.verification_code} mono /></div>
          </div>
        </section>

        <section className="rounded-2xl border border-[#dbe2ea] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2"><FileCheck2 size={18} className="text-[#0057e7]" /><h2 className="text-sm font-black text-[#0d1b2e]">Assinaturas registradas</h2></div>
          <div className="mt-4 space-y-3">
            {document.signers.map((signer, index) => <div key={`${signer.signer_type}-${index}`} className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] font-black uppercase tracking-wide text-[#0057e7]">{signerTypeLabel(signer.signer_type)}</span><span className="text-[10px] font-semibold text-[#64748b]">{formatDateTime(signer.signed_at)}</span></div>
              <p className="mt-2 text-sm font-black text-[#0d1b2e]">{signer.signer_name}</p>
              {signer.signer_document_masked && <p className="mt-1 font-mono text-xs text-[#475569]">{signer.signer_document_masked}</p>}
              <p className="mt-2 text-xs text-[#64748b]">Método: {validationLabel(signer.validation_method)}</p>
            </div>)}
          </div>
        </section>

        <section className="rounded-2xl border border-[#dbe2ea] bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-sm font-black text-[#0d1b2e]">Integridade criptográfica</h2>
          <p className="mt-1 text-xs leading-5 text-[#64748b]">Os hashes SHA-256 permitem conferir se o conteúdo congelado ou o PDF final foram alterados após a emissão.</p>
          <div className="mt-4 space-y-3">
            <HashValue label="Hash do conteúdo congelado" value={document.snapshot_hash} />
            <HashValue label="Hash do PDF final" value={document.final_pdf_hash} />
          </div>
        </section>

        <p className="px-3 text-center text-[11px] leading-5 text-[#64748b]">Esta página confirma somente as evidências mínimas de autenticidade. O documento integral, dados pessoais completos, IP e informações de navegador não são expostos publicamente.</p>
      </div>}
    </div>
  </main>;
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0 bg-white p-4"><span className="block text-[10px] font-black uppercase tracking-wide text-[#64748b]">{label}</span><strong className={`mt-1 block break-words text-sm text-[#0d1b2e] ${mono ? "font-mono" : "font-bold"}`}>{value || "—"}</strong></div>;
}

function HashValue({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-[#f8fafc] p-3"><span className="block text-[10px] font-black uppercase tracking-wide text-[#64748b]">{label}</span><code className="mt-1 block break-all text-[11px] font-semibold leading-5 text-[#334155]">{value || "—"}</code></div>;
}
