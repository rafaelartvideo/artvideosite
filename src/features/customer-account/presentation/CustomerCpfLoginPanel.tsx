import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { customerAccessRequest } from "@/lib/customer-access";
import { formatCpf, isValidCpf } from "@/shared/domain/formatters";

export type CustomerLoginMethod = "password" | "code" | "recovery";
const inputClass = "mt-1.5 h-11 w-full rounded-lg border border-[#dbe3ee] bg-white px-3.5 text-sm text-[#1b3353] outline-none focus:border-[var(--art-primary)] focus:ring-2 focus:ring-blue-500/10";
const buttonClass = "inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--art-primary)] px-4 text-sm font-semibold text-white transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60";

export function CustomerCpfLoginPanel({ onRecoveryVerified, method, onMethodChange }: {
  onRecoveryVerified?: () => void;
  method: CustomerLoginMethod;
  onMethodChange: (method: CustomerLoginMethod) => void;
}) {
  const [cpf, setCpf] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryEmailSent, setRecoveryEmailSent] = useState(false);
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<"main" | "resend" | "email" | null>(null);
  const [error, setError] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => setResendSeconds(s => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds > 0]);

  useEffect(() => {
    // Ao voltar pelo cabeçalho, limpar somente o desafio anterior.
    // O CPF digitado continua preenchido.
    setChallenge("");
    setCode("");
    setError("");
    setResendSeconds(0);
    setRecoveryEmailSent(false);
  }, [method]);
  const changeMethod = (next: CustomerLoginMethod) => onMethodChange(next);

  async function sendCode(resend = false) {
    if (!isValidCpf(cpf)) { setError("Informe um CPF válido."); return; }
    setBusy(true);
    setBusyAction(resend ? "resend" : "main");
    setError("");
    try {
      if (resend && challenge) {
        await customerAccessRequest("resend", { challenge_id: challenge });
      } else {
        const result = await customerAccessRequest("login_send", { cpf: cpf.replace(/\D/g, "") });
        setChallenge(result.challenge_id);
      }
      setCode("");
      setResendSeconds(60);
      window.requestAnimationFrame(() => codeRef.current?.focus());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar o código de segurança.");
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }

  async function recoverByEmail() {
    if (!isValidCpf(cpf)) { setError("Informe um CPF válido."); return; }
    setBusy(true); setBusyAction("email"); setError("");
    try {
      await customerAccessRequest("password_reset_email", { cpf: cpf.replace(/\D/g, "") });
      setRecoveryEmailSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível solicitar a recuperação.");
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!isValidCpf(cpf)) return setError("Informe um CPF válido.");
    if (method !== "password" && !challenge) return void sendCode();
    setBusy(true);
    setBusyAction("main");
    setError("");
    try {
      if (method === "password") {
        const result = await customerAccessRequest("login_password", { cpf: cpf.replace(/\D/g, ""), password });
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: result.access_token,
          refresh_token: result.refresh_token,
        });
        if (sessionError) throw sessionError;
        setPassword("");
      } else {
        if (!/^\d{6}$/.test(code)) throw new Error("Digite os seis dígitos do código.");
        const result = await customerAccessRequest("verify", { challenge_id: challenge, code });
        if (method === "recovery") onRecoveryVerified?.();
        const { error: otpError } = await supabase.auth.verifyOtp({ token_hash: result.token_hash, type: "magiclink" });
        if (otpError) throw otpError;
        setCode("");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível acessar a conta.");
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }

  const codeMode = method !== "password";
  return <form onSubmit={event => void submit(event)} className="space-y-4">
    {recoveryEmailSent && <p role="status" className="rounded-lg border border-[#dbe5f2] bg-[#f3f7ff] p-3 text-xs leading-5 text-[#344d6a]">Se a conta possuir um e-mail cadastrado, enviaremos um link para criar outra senha. Confira também o spam.</p>}
    <label className="block text-xs font-semibold text-[#344d6a]">
      CPF
      <input className={inputClass} value={formatCpf(cpf)}
        onChange={event => { setCpf(event.target.value.replace(/\D/g, "").slice(0, 11)); setChallenge(""); setCode(""); setError(""); }}
        inputMode="numeric" autoComplete="username" placeholder="000.000.000-00" maxLength={14}
        required disabled={busy || !!challenge} />
    </label>

    {!codeMode ? <>
      <label className="block text-xs font-semibold text-[#344d6a]">
        <span className="flex items-center justify-between gap-2">
          <span>Senha</span>
          <button type="button" onClick={() => changeMethod("recovery")}
            className="shrink-0 !text-[11px] font-medium leading-tight text-[var(--art-primary)] hover:underline">Esqueceu a senha?</button>
        </span>
        <span className="relative mt-1.5 block">
          <input className={inputClass + " !mt-0 pr-11"} type={showPassword ? "text" : "password"}
            value={password} onChange={event => setPassword(event.target.value)}
            autoComplete="current-password" placeholder="Digite sua senha" required />
          <button type="button" onClick={() => setShowPassword(value => !value)}
            title={showPassword ? "Ocultar senha" : "Mostrar senha"}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            className="absolute inset-y-0 right-1 flex items-center px-3 text-[#647b96] hover:text-[var(--art-primary)]">
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </span>
      </label>
    </> : challenge ? <div className="space-y-3">
      <p className="text-xs leading-5 text-[#60758e]">
        Enviamos um código de 6 dígitos ao WhatsApp confirmado. {method === "recovery"
          ? "Após a validação, você poderá criar outra senha."
          : "Informe-o para acessar sua conta."}
      </p>
      <label className="block text-xs font-semibold text-[#344d6a]" htmlFor="customer-whatsapp-otp">Código de segurança</label>
      <div className="relative cursor-text" onClick={() => codeRef.current?.focus()}>
        <div aria-hidden="true" className="grid grid-cols-6 gap-2">
          {Array.from({ length: 6 }, (_, index) => <div key={index}
            className={"flex h-12 items-center justify-center rounded-lg border bg-white text-lg font-semibold tabular-nums " +
              (code.length === index ? "border-[var(--art-primary)] ring-1 ring-blue-500/15" : "border-[#dbe3ee]")}>
            {code[index] || ""}
          </div>)}
        </div>
        <input ref={codeRef} id="customer-whatsapp-otp" type="text" inputMode="numeric"
          autoComplete="one-time-code" aria-label="Código de 6 dígitos"
          className="absolute inset-0 h-full w-full cursor-text opacity-0"
          value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          maxLength={6} required />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#60758e]">
        <span>O código expira em 30 minutos.</span>
        <button type="button" disabled={busy || resendSeconds > 0} onClick={() => void sendCode(true)}
          className="inline-flex min-w-[100px] items-center justify-center !text-[11px] font-medium text-[var(--art-primary)] disabled:text-[#91a0b3]">
          {busyAction === "resend" ? <LoaderCircle size={15} className="animate-spin" aria-label="Reenviando..."/> : resendSeconds > 0 ? `Reenviar em ${resendSeconds}s` : "Reenviar código"}
        </button>
      </div>
    </div> : <p className="text-xs leading-5 text-[#60758e]">
      {method === "recovery" ? "Vamos confirmar seu acesso por WhatsApp para permitir uma nova senha." :
        "Enviaremos um código para o WhatsApp confirmado na ativação da conta."}
    </p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    <button type="submit" disabled={busy || (codeMode && !!challenge && code.length !== 6)}
      className={buttonClass}>
      {busyAction === "main" ? <LoaderCircle size={18} className="animate-spin" aria-label="Processando..." /> :
        (method === "password" ? "Entrar" : challenge ? "Confirmar código" : "Enviar código")}
    </button>
    {method === "recovery" && !challenge && !recoveryEmailSent && <button type="button" disabled={busy} onClick={() => void recoverByEmail()}
      className="flex w-full items-center justify-center !text-xs font-medium leading-normal text-[var(--art-primary)] hover:underline disabled:opacity-60">{busyAction === "email" ? <LoaderCircle size={16} className="animate-spin" aria-label="Enviando..."/> : "Recuperar pelo e-mail cadastrado"}</button>}
    {!codeMode ? <button type="button" className="block w-full text-center !text-xs font-medium leading-normal text-[var(--art-primary)] hover:underline"
      onClick={() => changeMethod("code")}>Entrar com código de segurança</button> : null}
  </form>;
}
