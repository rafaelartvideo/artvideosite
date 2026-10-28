import { useEffect, useRef, useState } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { customerAccessRequest } from "@/lib/customer-access";

// A regular site account (including email signups) can verify its WhatsApp
// without a staff invitation. The server uses the account's saved number.
export function CustomerWhatsAppVerification({ onVerified }: { onVerified: () => void }) {
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = window.setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(interval);
  }, [cooldown > 0]);

  async function sendCode(resend = false) {
    if (busy || (resend && cooldown > 0)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (resend && challenge) {
        await customerAccessRequest("resend", { challenge_id: challenge });
      } else {
        const response = await customerAccessRequest<{ challenge_id?: string; already_verified?: boolean }>("profile_send");
        if (response.already_verified) {
          setNotice("Seu WhatsApp já está confirmado. Atualizando sua conta...");
          onVerified();
          return;
        }
        if (!response.challenge_id) throw new Error("Não foi possível iniciar a confirmação.");
        setChallenge(response.challenge_id);
      }
      setCooldown(60);
      setCode("");
      window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível enviar o código pelo WhatsApp.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode() {
    if (busy || !challenge || !/^[0-9]{6}$/.test(code)) return;
    setBusy(true);
    setError("");
    try {
      await customerAccessRequest("profile_verify", { challenge_id: challenge, code });
      setNotice("WhatsApp confirmado com sucesso.");
      onVerified();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível confirmar o código.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="rounded-xl border border-[#d9e5f8] bg-[#f0f5ff] p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[var(--art-primary)]">
        <ShieldCheck size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[14px] font-bold text-[#183250]">Confirme seu WhatsApp</h2>
        <p className="mt-1 text-[12px] leading-5 text-[#59718f]">
          Verifique o número da sua conta para concluir a identificação do cadastro e consultar suas ordens de serviço.
        </p>
        {!challenge ? <button type="button" disabled={busy} onClick={() => void sendCode()}
          className="mt-3 inline-flex min-h-9 items-center justify-center rounded-lg bg-[var(--art-primary)] px-4 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">
          {busy ? <LoaderCircle size={18} className="animate-spin" aria-label="Enviando código..." /> : "Enviar código pelo WhatsApp"}
        </button> : <div className="mt-4 max-w-xs">
          <p className="mb-2 text-xs font-medium text-[#294361]">Código recebido no WhatsApp</p>
          <div className="relative cursor-text">
            <div aria-hidden="true" className="grid grid-cols-6 gap-2">
              {Array.from({ length: 6 }, (_, index) => <span key={index}
                className={"flex h-10 items-center justify-center rounded-lg border bg-white text-base font-semibold tabular-nums text-[#173450] " +
                  (index === code.length ? "border-[var(--art-primary)]" : "border-[#dbe3ee]")}>{code[index] || ""}</span>)}
            </div>
            <input ref={inputRef} type="text" autoComplete="one-time-code" inputMode="numeric"
              aria-label="Código de seis dígitos enviado pelo WhatsApp" maxLength={6}
              value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="absolute inset-0 h-full w-full opacity-0" />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-[#60758e]">
            <span>Expira em 30 minutos.</span>
            <button type="button" onClick={() => void sendCode(true)} disabled={busy || cooldown > 0}
              className="font-semibold text-[var(--art-primary)] disabled:text-[#91a0b3]">
              {cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar código"}
            </button>
          </div>
          <button type="button" disabled={busy || code.length !== 6} onClick={() => void confirmCode()}
            className="mt-3 flex min-h-10 w-full items-center justify-center rounded-lg bg-[var(--art-primary)] px-4 text-xs font-semibold text-white disabled:opacity-50">
            {busy ? <LoaderCircle size={18} className="animate-spin" aria-label="Confirmando..." /> : "Confirmar WhatsApp"}
          </button>
        </div>}
        {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
        {notice && <p role="status" className="mt-3 text-xs text-[#294361]">{notice}</p>}
      </div>
    </div>
  </section>;
}
