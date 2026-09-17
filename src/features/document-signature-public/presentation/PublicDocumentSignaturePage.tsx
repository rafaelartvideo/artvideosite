import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, FileCheck2, LockKeyhole, ShieldCheck } from "lucide-react";
import { useParams } from "react-router";
import {
  completePublicSignature,
  getPublicSignedDocument,
  inspectPublicSignature,
  loadPublicSignatureDocument,
  validatePublicSignatureIdentity,
  type PublicSignatureDocument,
  type PublicSignatureInspection,
} from "../infrastructure/public-document-signature.repository";
import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";

type Step = "loading" | "identity" | "document" | "signed" | "terminal" | "error";

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function digits(value: string) {
  return value.replace(/\D/g, "").slice(0, 14);
}

function formatIdentity(value: string) {
  const raw = digits(value);
  if (raw.length <= 11) {
    return raw
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }
  return raw
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\/\d{4})(\d{1,2})$/, "$1-$2");
}

function fieldValue(value: unknown) {
  const text = value == null || value === "" ? "—" : String(value);
  return text.split("\\n").join("\n");
}

function checklistAnswer(item: any) {
  const labels: Record<string, string> = {
    ok: "Conforme",
    not_ok: "Não conforme",
    yes: "Sim",
    no: "Não",
    confirmed: "Confirmado",
    na: "Não se aplica",
  };
  if (item?.response_code && labels[item.response_code]) return labels[item.response_code];
  if (item?.response_number != null) return String(item.response_number);
  return item?.response_text || "Não respondido";
}

function DocumentSnapshot({ document }: { document: PublicSignatureDocument }) {
  const snapshot = document.snapshot || {};
  const company = snapshot.company || {};
  const template = snapshot.template || {};
  const order = snapshot.order || {};
  const sections = Array.isArray(snapshot.sections) ? snapshot.sections : [];
  const checklists = Array.isArray(snapshot.checklists) ? snapshot.checklists : [];

  return (
    <div className="overflow-hidden rounded-2xl border border-[#dbe2ea] bg-white shadow-sm">
      <header className="border-b border-[#dbe2ea] bg-[#f8fafc] p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0057e7]">{company.name || "Documento"}</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-black text-[#0d1b2e]">{template.name || "Documento"}</h2>
            {template.header_text && <p className="mt-1 whitespace-pre-wrap text-sm text-[#64748b]">{String(template.header_text)}</p>}
          </div>
          <div className="shrink-0 rounded-xl bg-[#edf3ff] px-4 py-2 text-right">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-[#64748b]">OS</span>
            <strong className="text-lg text-[#0057e7]">{order.os_number || "—"}</strong>
          </div>
        </div>
        {(company.document || company.phone || company.email || company.address) && (
          <div className="mt-4 grid gap-1 text-xs text-[#64748b] sm:grid-cols-2">
            {company.document && <span>{String(company.document)}</span>}
            {company.phone && <span>{String(company.phone)}</span>}
            {company.email && <span>{String(company.email)}</span>}
            {company.address && <span>{String(company.address)}</span>}
          </div>
        )}
      </header>

      <div className="space-y-4 p-4 sm:p-6">
        {sections.map((section: any) => (
          <section key={section.key} className="overflow-hidden rounded-xl border border-[#e2e8f0]">
            <h3 className="border-b border-[#e2e8f0] bg-[#f8fafc] px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.08em] text-[#334155]">{section.label || section.key}</h3>
            <div className="grid sm:grid-cols-2">
              {(section.fields || []).map((field: any) => field.kind === "signature" ? (
                <div key={field.key} className="p-4 text-center sm:col-span-1">
                  <div className="mt-8 border-t border-[#94a3b8] pt-2 text-xs font-semibold text-[#64748b]">{field.label}</div>
                </div>
              ) : (
                <div key={field.key} className="min-w-0 border-b border-[#eef2f6] p-3 last:border-b-0 sm:border-r sm:last:border-r-0">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-[#64748b]">{field.label || field.key}</span>
                  <strong className="mt-1 block whitespace-pre-wrap break-words text-sm font-semibold text-[#172536]">{fieldValue(field.value)}</strong>
                </div>
              ))}
            </div>
          </section>
        ))}

        {checklists.map((stage: any) => (
          <section key={stage.id || stage.stage_code} className="overflow-hidden rounded-xl border border-[#e2e8f0]">
            <div className="border-b border-[#e2e8f0] bg-[#f8fafc] px-4 py-2.5">
              <h3 className="text-[11px] font-black uppercase tracking-[0.08em] text-[#334155]">Checklist · {stage.name || stage.stage_code}</h3>
            </div>
            <div className="divide-y divide-[#eef2f6]">
              {(stage.items || []).map((item: any) => (
                <div key={item.id || item.title} className="grid gap-2 p-3 sm:grid-cols-[1.3fr_.8fr_1fr]">
                  <div><span className="text-xs font-bold text-[#172536]">{item.title}</span>{item.description && <p className="mt-0.5 text-[11px] text-[#64748b]">{item.description}</p>}</div>
                  <div><span className="text-[10px] font-bold uppercase text-[#94a3b8]">Resultado</span><p className="text-xs font-semibold text-[#334155]">{checklistAnswer(item)}</p></div>
                  <div><span className="text-[10px] font-bold uppercase text-[#94a3b8]">Observação</span><p className="text-xs text-[#475569]">{item.observation || "—"}</p>{Array.isArray(item.media) && item.media.length > 0 && <p className="mt-1 text-[10px] font-semibold text-[#0057e7]">{item.media.length} {item.media.length === 1 ? "foto registrada" : "fotos registradas"}</p>}</div>
                </div>
              ))}
            </div>
          </section>
        ))}

        {template.footer_text && <p className="border-t border-[#e2e8f0] pt-3 text-center text-xs text-[#64748b]">{String(template.footer_text)}</p>}
      </div>
    </div>
  );
}

export function PublicDocumentSignaturePage() {
  const { token = "" } = useParams();
  const padRef = useRef<SignaturePadHandle | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [inspection, setInspection] = useState<PublicSignatureInspection | null>(null);
  const [documentValue, setDocumentValue] = useState("");
  const [proof, setProof] = useState("");
  const [signatureDocument, setSignatureDocument] = useState<PublicSignatureDocument | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState<string | null>(null);

  const enterSignedState = (result: { signed_at?: string | null; verification_code?: string | null }) => {
    setSignedAt(result.signed_at || new Date().toISOString());
    setVerificationCode(result.verification_code || null);
    setStep("signed");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setStep("loading");
      setError("");
      try {
        const result = await inspectPublicSignature(token);
        if (cancelled) return;
        setInspection(result);
        setSignedAt(result.signed_at);
        setVerificationCode(result.verification_code);
        if (result.state === "signed") setStep("signed");
        else if (["expired", "cancelled"].includes(result.state)) setStep("terminal");
        else setStep("identity");
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Link de assinatura inválido.");
        setStep("error");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [token]);

  const terminalMessage = useMemo(() => {
    if (!inspection) return "Esta solicitação não está disponível.";
    if (inspection.state === "expired") return "O prazo deste link terminou. Solicite um novo envio à empresa.";
    if (inspection.state === "cancelled") return "Esta solicitação foi cancelada e não aceita mais assinatura.";
    return "Esta solicitação não está disponível.";
  }, [inspection]);

  const validateIdentity = async () => {
    if (![11, 14].includes(digits(documentValue).length)) {
      setError("Informe o CPF ou CNPJ usado nesta solicitação.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await validatePublicSignatureIdentity(token, documentValue);
      if (result.signed || result.already_captured) {
        enterSignedState(result);
        return;
      }
      if (!result.proof) throw new Error("Não foi possível validar sua identidade.");
      const loadedDocument = await loadPublicSignatureDocument(token, result.proof);
      setProof(result.proof);
      setSignatureDocument(loadedDocument);
      setConsentAccepted(false);
      setHasInk(false);
      setStep("document");
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Não foi possível validar sua identidade.");
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    if (!consentAccepted) { setError("Confirme o aceite antes de assinar."); return; }
    const signatureDataUrl = padRef.current?.toPngDataUrl();
    if (!signatureDataUrl || !hasInk) { setError("Faça sua assinatura antes de confirmar."); return; }
    setBusy(true);
    setError("");
    try {
      const result = await completePublicSignature({ token, proof, signatureDataUrl });
      enterSignedState(result);
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : "Não foi possível registrar a assinatura.");
    } finally {
      setBusy(false);
    }
  };

  const downloadPdf = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await getPublicSignedDocument(token);
      const anchor = document.createElement("a");
      anchor.href = result.download_url;
      anchor.download = `${inspection?.document_name || "documento-assinado"}.pdf`;
      anchor.rel = "noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Não foi possível preparar o PDF.");
    } finally {
      setBusy(false);
    }
  };

  const openVerification = () => {
    if (!verificationCode) return;
    window.open(`/verificar-documento/${encodeURIComponent(verificationCode)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <main className="min-h-dvh bg-[#f3f6fa] px-4 py-6 text-[#172536] sm:py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#0057e7]">Assinatura eletrônica</p>
            <h1 className="mt-1 truncate text-xl font-black text-[#0d1b2e] sm:text-2xl">{inspection?.company_name || "Documento para assinatura"}</h1>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#e8f0ff] text-[#0057e7]"><ShieldCheck size={23} /></div>
        </div>

        {step === "loading" && <div className="rounded-2xl border border-[#dbe2ea] bg-white p-8 text-center text-sm font-semibold text-[#64748b]">Carregando solicitação...</div>}

        {step === "error" && <div className="rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm"><LockKeyhole className="mx-auto text-red-500" size={28} /><h2 className="mt-3 text-lg font-black">Link indisponível</h2><p className="mt-2 text-sm text-[#64748b]">{error}</p></div>}

        {step === "terminal" && <div className="rounded-2xl border border-[#dbe2ea] bg-white p-6 text-center shadow-sm"><FileCheck2 className="mx-auto text-[#0057e7]" size={30} /><h2 className="mt-3 text-lg font-black">{inspection?.document_name || "Documento"}</h2><p className="mt-2 text-sm text-[#64748b]">{terminalMessage}</p></div>}

        {step === "signed" && <div className="rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-sm sm:p-8"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check size={28} strokeWidth={3} /></div><h2 className="mt-4 text-xl font-black">Documento assinado</h2><p className="mt-2 text-sm leading-6 text-[#64748b]">{inspection?.document_name || "O documento"} foi finalizado e preservado como uma versão imutável.</p>{signedAt && <p className="mt-3 text-xs font-semibold text-[#475569]">Assinado em {formatDateTime(signedAt)}</p>}{verificationCode && <p className="mx-auto mt-4 max-w-md rounded-xl bg-[#f8fafc] px-3 py-2 font-mono text-sm font-bold">Código: {verificationCode}</p>}{error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}<div className="mx-auto mt-5 grid max-w-md gap-2 sm:grid-cols-2"><button type="button" onClick={() => void downloadPdf()} disabled={busy} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0057e7] px-4 text-sm font-black text-white hover:bg-[#0048c7] disabled:opacity-60"><Download size={16} />{busy ? "Preparando..." : "Baixar PDF"}</button><button type="button" onClick={openVerification} disabled={!verificationCode} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#0057e7]/30 bg-white px-4 text-sm font-black text-[#0057e7] hover:bg-[#f7faff] disabled:opacity-50"><ShieldCheck size={16} /> Verificar autenticidade</button></div><p className="mt-4 text-[11px] leading-5 text-[#64748b]">Uma cópia do PDF também é enviada automaticamente ao e-mail do assinante quando o serviço de e-mail está disponível.</p></div>}

        {step === "identity" && inspection && <div className="rounded-2xl border border-[#dbe2ea] bg-white p-5 shadow-sm sm:p-6">
          <div className="rounded-xl bg-[#f8fafc] p-4"><p className="text-xs font-bold uppercase tracking-wide text-[#64748b]">Documento</p><p className="mt-1 text-base font-black">{inspection.document_name}</p><p className="mt-1 text-xs text-[#64748b]">OS {inspection.order_number} · link válido até {formatDateTime(inspection.expires_at)}</p></div>
          <div className="mt-5"><h2 className="text-lg font-black">Confirme sua identidade</h2><p className="mt-1 text-sm leading-6 text-[#64748b]">Informe o CPF ou CNPJ associado a esta assinatura para liberar o documento.</p></div>
          <label className="mt-5 block text-xs font-bold uppercase tracking-wide text-[#475569]">CPF ou CNPJ</label>
          <input value={documentValue} onChange={event => setDocumentValue(formatIdentity(event.target.value))} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" className="mt-2 h-12 w-full rounded-xl border border-[#cbd5e1] bg-white px-4 text-base font-semibold outline-none transition focus:border-[#0057e7] focus:ring-2 focus:ring-[#0057e7]/10" />
          {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
          <button type="button" onClick={() => void validateIdentity()} disabled={busy} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0057e7] px-5 text-sm font-black text-white hover:bg-[#0048c7] disabled:cursor-wait disabled:opacity-60"><ShieldCheck size={17} />{busy ? "Validando..." : "Validar e abrir documento"}</button>
          <p className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-[#64748b]"><LockKeyhole size={14} className="mt-0.5 shrink-0" />O conteúdo do documento só será liberado após a validação do CPF ou CNPJ.</p>
        </div>}

        {step === "document" && signatureDocument && <div className="space-y-5">
          <DocumentSnapshot document={signatureDocument} />
          <div className="rounded-2xl border border-[#dbe2ea] bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-black">Assine o documento</h2><p className="mt-1 text-sm leading-6 text-[#64748b]">Confira o conteúdo acima. Sua assinatura será vinculada a esta versão congelada do documento.</p>
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-[#dbe2ea] bg-[#f8fafc] p-4">
              <input type="checkbox" checked={consentAccepted} onChange={event => setConsentAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0057e7]" />
              <span className="text-xs font-semibold leading-5 text-[#334155]">{signatureDocument.consent_text}</span>
            </label>
            <div className="mt-5"><span className="mb-2 block text-xs font-bold uppercase tracking-wide text-[#475569]">Sua assinatura</span><SignaturePad ref={padRef} disabled={busy} onInkChange={setHasInk} /></div>
            {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
            <button type="button" onClick={() => void complete()} disabled={busy || !consentAccepted || !hasInk} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0057e7] px-5 text-sm font-black text-white hover:bg-[#0048c7] disabled:cursor-not-allowed disabled:opacity-50"><FileCheck2 size={17} />{busy ? "Finalizando documento..." : "Confirmar assinatura"}</button>
            <p className="mt-4 text-center text-[11px] leading-5 text-[#64748b]">Validação por CPF/CNPJ · {signatureDocument.signer_document_masked}</p>
          </div>
        </div>}

        <footer className="mt-5 flex items-center justify-center gap-2 text-[10px] font-semibold text-[#94a3b8]"><ShieldCheck size={12} /> Ambiente seguro de assinatura eletrônica</footer>
      </div>
    </main>
  );
}
