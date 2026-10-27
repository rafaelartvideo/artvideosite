import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Link } from "react-router";
import {
  ArrowLeft, ArrowRight, CheckCircle2, ClipboardList, Eye, EyeOff, FileText,
  Heart, IdCard, KeyRound, LockKeyhole, LogOut, Mail, MapPin, Package, Phone, RefreshCw, ShieldCheck, UserRound, UserRoundPlus,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { formatCpf, isValidCpf } from "@/shared/domain/formatters";
import { formatSitePhone } from "../infrastructure/customer-account-settings.repository";
import { CustomerAddresses } from "./CustomerAddresses";
import { CustomerFavorites } from "./CustomerFavorites";
import { CustomerProfile } from "./CustomerProfile";
import {
  activateCustomerAccount, getCustomerPortal,
  type CustomerPortal, type CustomerPortalItem, type CustomerActivation,
} from "../infrastructure/customer-account.repository";

type AuthMode = "login" | "register" | "forgot" | "email_sent";
type Tab = "overview" | "orders" | "quotes" | "addresses" | "favorites" | "profile";
type AccountState = CustomerActivation["status"] | "anonymous" | "loading" | "ready" | "error";
const inputClass = "h-12 w-full rounded-xl border border-[#dbe5f2] bg-[#fbfcff] px-4 text-[14px] text-[#132b4a] outline-none transition-[border-color,box-shadow] placeholder:text-[#9aabc0] focus:border-[var(--art-primary)] focus:bg-white focus:ring-[3px] focus:ring-blue-500/10";
const primaryClass = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--art-primary)] px-5 text-sm font-semibold text-white shadow-[0_5px_14px_rgba(23,77,162,.14)] transition-[background-color,box-shadow] hover:bg-blue-800 hover:shadow-[0_7px_18px_rgba(23,77,162,.2)] disabled:cursor-not-allowed disabled:opacity-60";
const authLabelClass = "block text-[12px] font-medium text-[#344d6a]";
const authInputClass = "h-11 w-full rounded-lg border border-[#dbe3ee] bg-white pl-10 pr-3.5 text-[13px] text-[#1b3353] outline-none transition-[border-color,box-shadow] placeholder:text-[#a0aebe] focus:border-[var(--art-primary)] focus:ring-2 focus:ring-blue-500/10";
const authButtonClass = "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--art-primary)] px-5 text-[12.5px] font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#dce5f1] bg-white px-4 text-sm font-semibold text-[#254360] transition-colors hover:bg-[#f3f7fc]";
const cardClass = "rounded-xl border border-[#e2e8f1] bg-white p-5 shadow-[0_5px_24px_rgba(15,42,83,.035)]";

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}
function displayAmount(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : null;
}
function statusLabel(value: string) {
  const states: Record<string, string> = {
    pending: "Aguardando pagamento", awaiting_payment: "Aguardando pagamento",
    paid: "Pagamento confirmado", approved: "Aprovado",
    processing: "Em preparação", shipped: "Enviado", delivered: "Entregue",
    cancelled: "Cancelado", canceled: "Cancelado", refunded: "Reembolsado",
    ready_for_pickup: "Pronto para retirada", picked_up: "Retirado",
    in_transit: "Em transporte", awaiting_pickup: "Aguardando retirada",
  };
  return states[value?.toLowerCase()] || value || "Em acompanhamento";
}

function EmptyHistory({ title, description }: { title: string; description: string }) {
  return <div className={"flex flex-col items-center justify-center py-12 text-center " + cardClass}>
    <ClipboardList size={29} className="mb-3 text-[#8ba1bd]" />
    <p className="text-sm font-bold text-[#173450]">{title}</p>
    <p className="mt-1 max-w-sm text-[13px] leading-6 text-[#73839a]">{description}</p>
  </div>;
}
function RecordList({ items, kind }: { items: CustomerPortalItem[]; kind: "orders" | "quotes" }) {
  if (!items.length) return <EmptyHistory
    title={kind === "orders" ? "Nenhum pedido encontrado" : "Nenhum orçamento encontrado"}
    description="Assim que você fizer uma compra ou solicitar um orçamento, os detalhes aparecerão aqui." />;
  return <div className="grid gap-3">
    {items.map(item => <article key={item.id} className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8090a7]">
            {kind === "orders" ? "Pedido" : "Orçamento"} {item.number || "—"}
          </p>
          <h3 className="mt-1 break-words text-sm font-bold text-[#10213d]">
            {kind === "orders" ? item.product_name || "Produtos da compra" : item.description || "Solicitação"}
          </h3>
          <p className="mt-1 text-xs text-[#8190a5]">Registrado em {displayDate(item.created_at)}</p>
        </div>
        <span className="rounded-full bg-[#eef4ff] px-3 py-1.5 text-[11px] font-semibold text-[#244b9b]">{statusLabel(item.status)}</span>
      </div>
      {(kind === "orders" && (displayAmount(item.total) || item.delivery_status)) && <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#e9edf5] pt-3 text-xs text-[#61748e]">
        <span>{item.delivery_status ? "Entrega: " + statusLabel(item.delivery_status) : "Pedido registrado"}</span>
        {displayAmount(item.total) && <strong className="text-sm text-[#1e3959]">{displayAmount(item.total)}</strong>}
      </div>}
    </article>)}
  </div>;
}




function AccountEntryShell({ children }: { children: React.ReactNode }) {
  return <motion.div layout="size" initial={false} transition={{ layout: { duration: 0.24, ease: "easeOut" } }} className="mx-auto w-full max-w-[456px] rounded-2xl border border-[#e1e7f0] bg-white px-6 py-7 shadow-[0_10px_38px_rgba(17,40,77,.055)] sm:px-10 sm:py-9">
    {children}
  </motion.div>;
}

const authIconClass = "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#91a1b6]";


export function CustomerAccountPage() {
  const { session, loading: authLoading } = useAuth();
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<AuthMode>("login");
  const [passwordRecovery, setPasswordRecovery] = useState(() => new URLSearchParams(window.location.search).has("recovery"));
  const [tab, setTab] = useState<Tab>("overview");
  const [state, setState] = useState<AccountState>("loading");
  const [portal, setPortal] = useState<CustomerPortal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const userId = session?.user?.id;

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(event => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      setPortal(null);
      setState("anonymous");
      return;
    }
    let cancelled = false;
    setState("loading");
    setError("");
    (async () => {
      try {
        const activated = await activateCustomerAccount();
        if (cancelled) return;
        if (activated.status !== "linked") {
          setState(activated.status);
          return;
        }
        const data = await getCustomerPortal();
        if (cancelled) return;
        setPortal(data);
        setState(data.status === "ready" ? "ready" : data.status === "unlinked" ? "needs_review" : "verify_email");
      } catch {
        if (!cancelled) {
          setState("error");
          setError("Não foi possível carregar sua conta. Tente novamente.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [userId, authLoading, refreshIndex]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (mode === "register") {
      if (!isValidCpf(cpf)) return setError("Informe um CPF válido.");
      if (name.trim().length < 3) return setError("Informe seu nome completo.");
      if (!/^\d{10,11}$/.test(phone.replace(/\D/g, ""))) return setError("Informe um WhatsApp com DDD válido.");
      if (password.length < 8) return setError("A senha deve ter no mínimo 8 caracteres.");
      if (password !== confirmPassword) return setError("As senhas não coincidem.");
    }
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
          redirectTo: window.location.origin + "/minha-conta?recovery=1",
        });
        if (resetError) throw resetError;
        setMode("email_sent");
      } else if (mode === "register") {
        const { error: signupError } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            emailRedirectTo: window.location.origin + "/minha-conta",
            data: { registration_origin: "artvideo_customer", full_name: name.trim(), phone: phone.replace(/\D/g, ""), cpf: cpf.replace(/\D/g, "") },
          },
        });
        if (signupError) throw signupError;
        setPassword("");
        setConfirmPassword("");
        setMode("email_sent");
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(), password,
        });
        if (loginError) throw new Error("E-mail ou senha inválidos.");
        setPassword("");
        setRefreshIndex(index => index + 1);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível concluir sua solicitação.");
    } finally {
      setBusy(false);
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) return setError("A senha deve ter no mínimo 8 caracteres.");
    if (password !== confirmPassword) return setError("As senhas não coincidem.");
    setBusy(true);
    setError("");
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword("");
      setConfirmPassword("");
      setPasswordRecovery(false);
      window.history.replaceState(window.history.state, "", "/minha-conta");
      setRefreshIndex(index => index + 1);
    } catch {
      setError("Não foi possível atualizar sua senha. Solicite um novo link.");
    } finally {
      setBusy(false);
    }
  }

  async function completeAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!isValidCpf(cpf)) return setError("Informe um CPF válido.");
    if (!/^\d{10,11}$/.test(phone.replace(/\D/g, ""))) return setError("Informe um WhatsApp com DDD válido.");
    setBusy(true);
    setError("");
    try {
      const result = await activateCustomerAccount(name.trim(), phone.trim(), cpf.trim());
      if (result.status === "linked") setRefreshIndex(index => index + 1);
      else if (result.status === "invalid_phone") setError("Informe um telefone com DDD válido.");
      else if (result.status === "invalid_cpf") setError("CPF inválido. Verifique os números informados.");
      else setState(result.status);
    } catch {
      setError("Não foi possível completar o cadastro. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await supabase.auth.signOut({ scope: "local" });
      setPortal(null);
      setState("anonymous");
      setMode("login");
    } finally {
      setBusy(false);
    }
  }

  const headings: Record<Tab, string> = {
    overview: "Visão geral", orders: "Meus pedidos",
    quotes: "Meus orçamentos", addresses: "Meus endereços", favorites: "Meus favoritos", profile: "Meus dados",
  };
  const orders = portal?.orders || [];
  const quotes = portal?.quotes || [];
  const greeting = new Date().getHours() < 12 ? "Bom dia" : new Date().getHours() < 18 ? "Boa tarde" : "Boa noite";
  const firstName = portal?.customer?.name?.trim().split(/\s+/)[0] || "";
  const displayName = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : "";

  return <div className="min-h-[65vh] bg-[#f6f8fc] pb-16">
    <div className={"mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 " + (state === "anonymous" && !passwordRecovery ? "flex min-h-[68vh] items-center justify-center py-10 sm:py-14" : "pt-9")}>
      {userId && !passwordRecovery && state === "ready" && <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-[#122947] sm:text-[27px]">Minha conta</h1>
          <p className="mt-2 text-sm text-[#657a95]">Seus pedidos e orçamentos em um só lugar.</p>
        </div>
        <button type="button" className={secondaryClass} onClick={() => void signOut()} disabled={busy}>
          <LogOut size={16}/> Sair da conta
        </button>
      </div>}

      {passwordRecovery && userId && !authLoading ? <div className={"mx-auto max-w-md " + cardClass}>
        <h2 className="text-xl font-bold text-[#173450]">Criar nova senha</h2>
        <p className="mt-2 text-sm text-[#6b8098]">Escolha uma senha com pelo menos 8 caracteres.</p>
        <form onSubmit={event => void updatePassword(event)} className="mt-5 space-y-4">
          <label className="block text-xs font-semibold text-[#294361]">Nova senha
            <input className={inputClass + " mt-1.5"} type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required/>
          </label>
          <label className="block text-xs font-semibold text-[#294361]">Confirmar nova senha
            <input className={inputClass + " mt-1.5"} type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required/>
          </label>
          {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
          <button className={"w-full " + primaryClass} type="submit" disabled={busy}>Salvar nova senha <ArrowRight size={16}/></button>
        </form>
      </div> : (authLoading || state === "loading") ? <div role="status" className="flex min-h-[290px] flex-col items-center justify-center gap-3 text-sm font-medium text-[#64809f]">
        <RefreshCw size={27} className="animate-spin text-[var(--art-primary)]"/> Preparando sua conta...
      </div> :
      state === "anonymous" ? <AccountEntryShell>
        <AnimatePresence initial={false} mode="wait">
          <motion.div key={mode}
            initial={reduceMotion ? false : { opacity: 0, y: 9 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -7 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}>
            {mode === "email_sent" ? <div className="py-3 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#eef8f2] text-[#23815b]"><CheckCircle2 size={24} strokeWidth={1.8}/></div>
              <h1 className="mt-4 text-[21px] font-semibold tracking-[-.035em] text-[#172d4b]">Verifique seu e-mail</h1>
              <p className="mx-auto mt-2 max-w-[320px] text-[13px] leading-6 text-[#6a7e96]">Se o endereço estiver disponível, enviaremos as orientações para você. Confira também o spam.</p>
              <button type="button" onClick={() => { setMode("login"); setError(""); }} className={"mt-6 w-full " + authButtonClass}><ArrowLeft size={15}/> Voltar ao login</button>
            </div> : <>
              {mode === "forgot" && <button type="button" onClick={() => { setMode("login"); setError(""); }} className="mb-4 inline-flex items-center gap-2 text-xs font-medium text-[#647b96] hover:text-[var(--art-primary)]"><ArrowLeft size={15}/> Voltar</button>}
              <div className="mb-6 text-center">
                <h1 className="flex items-center justify-center gap-2 text-[19px] font-semibold tracking-[-.03em] text-[#142d4e] sm:text-[20px]">
                  {mode === "register" ? <UserRoundPlus size={19} className="text-[var(--art-primary)]"/> : mode === "forgot" ? <KeyRound size={19} className="text-[var(--art-primary)]"/> : <UserRound size={19} className="text-[var(--art-primary)]"/>}
                  {mode === "register" ? "Criar conta" : mode === "forgot" ? "Recuperar senha" : "Entrar"}
                </h1>
                <p className="mt-1.5 text-[12.5px] leading-5 text-[#6c8099]">
                  {mode === "register" ? "Cadastre-se para acompanhar seus pedidos e orçamentos." : mode === "forgot" ? "Receba um link para redefinir sua senha." : "Acesse seus pedidos e orçamentos."}
                </p>
              </div>
              <form onSubmit={event => void submitAuth(event)} className="space-y-4">
                {mode === "register" && <>
                  <label className={authLabelClass}>Nome completo
                    <span className="relative mt-1.5 block">
                      <UserRound size={17} className={authIconClass}/>
                      <input className={authInputClass} value={name} onChange={event => setName(event.target.value)} autoComplete="name" maxLength={120} required placeholder="Seu nome completo"/>
                    </span>
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className={authLabelClass}>CPF
                      <span className="relative mt-1.5 block">
                        <IdCard size={17} className={authIconClass}/>
                        <input className={authInputClass} value={formatCpf(cpf)} onChange={event => setCpf(event.target.value.replace(/\D/g, "").slice(0, 11))} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" maxLength={14} aria-invalid={cpf.length === 11 && !isValidCpf(cpf)} required/>
                        {cpf.length === 11 && <span className={"mt-1 block text-[10px] font-medium " + (isValidCpf(cpf) ? "text-emerald-700" : "text-red-600")}>{isValidCpf(cpf) ? "CPF válido" : "Confira o CPF informado"}</span>}
                      </span>
                    </label>
                    <label className={authLabelClass}>WhatsApp
                      <span className="relative mt-1.5 block">
                        <Phone size={17} className={authIconClass}/>
                        <input className={authInputClass} type="tel" inputMode="tel" value={formatSitePhone(phone)} onChange={event => setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))} autoComplete="tel" placeholder="(00) 00000-0000" required/>
                      </span>
                    </label>
                  </div>
                </>}
                <label className={authLabelClass}>E-mail
                  <span className="relative mt-1.5 block">
                    <Mail size={17} className={authIconClass}/>
                    <input className={authInputClass} type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required placeholder="voce@exemplo.com"/>
                  </span>
                </label>
                {mode !== "forgot" && <label className={authLabelClass}>
                  <span className="flex items-center justify-between gap-2">
                    <span>Senha</span>
                    {mode === "login" && <button type="button" onClick={() => { setMode("forgot"); setError(""); }} className="text-xs font-medium text-[var(--art-primary)] hover:underline">Esqueceu a senha?</button>}
                  </span>
                  <span className="relative mt-1.5 block">
                    <LockKeyhole size={17} className={authIconClass}/>
                    <input className={authInputClass + " pr-11"} type={showPassword ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 8 : 1} placeholder={mode === "register" ? "Pelo menos 8 caracteres" : "Sua senha"}/>
                    <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} className="absolute inset-y-0 right-2 flex items-center px-2 text-[#778da6] hover:text-[var(--art-primary)]">{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button>
                  </span>
                </label>}
                {mode === "register" && <label className={authLabelClass}>Confirmar senha
                  <span className="relative mt-1.5 block">
                    <LockKeyhole size={17} className={authIconClass}/>
                    <input className={authInputClass} type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required placeholder="Repita sua senha"/>
                  </span>
                </label>}
                {error && <p role="alert" className="rounded-lg bg-[#fff1f1] px-3 py-2.5 text-[12px] text-[#ab3232]">{error}</p>}
                <button type="submit" disabled={busy} className={"mt-1 w-full " + authButtonClass}>
                  {busy && <RefreshCw size={16} className="animate-spin"/>}
                  <span className="flex-1 text-center">{mode === "register" ? "Criar conta" : mode === "forgot" ? "Enviar link" : "Entrar"}</span>
                  {!busy && <ArrowRight size={16} className="ml-auto"/>}
                </button>
              </form>
              {mode === "register" && <p className="mt-3 text-center text-[11.5px] leading-5 text-[#8999aa]">Enviaremos um e-mail para confirmar sua conta.</p>}
              {mode !== "forgot" && <div className="mt-5 border-t border-[#edf0f4] pt-4 text-center text-[12px] text-[#73849a]">
                {mode === "register" ? "Já tem uma conta?" : "Ainda não tem uma conta?"}{" "}
                <button type="button" onClick={() => { setMode(mode === "register" ? "login" : "register"); setError(""); }} className="font-semibold text-[var(--art-primary)] hover:underline">
                  {mode === "register" ? "Entrar" : "Criar conta"}
                </button>
              </div>}
            </>}
          </motion.div>
        </AnimatePresence>
      </AccountEntryShell> :
      state === "needs_name" || state === "needs_cpf" || state === "invalid_cpf" || state === "invalid_phone" ? <div className={"mx-auto max-w-lg " + cardClass}>
        <h2 className="text-xl font-bold text-[#173450]">Complete seu cadastro</h2>
        <p className="mt-2 text-sm text-[#657a95]">Só precisamos de mais alguns dados para concluir sua conta.</p>
        <form onSubmit={event => void completeAccount(event)} className="mt-5 space-y-4">
          <label className="block text-xs font-semibold text-[#294361]">Nome completo<input className={inputClass + " mt-1.5"} value={name} onChange={event => setName(event.target.value)} required minLength={3} maxLength={120}/></label>
          <label className="block text-xs font-semibold text-[#294361]">CPF<input className={inputClass + " mt-1.5"} value={formatCpf(cpf)} onChange={event => setCpf(event.target.value.replace(/\D/g, "").slice(0, 11))} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" maxLength={14} required/></label>
          <label className="block text-xs font-semibold text-[#294361]">WhatsApp<input className={inputClass + " mt-1.5"} value={formatSitePhone(phone)} onChange={event => setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))} type="tel" required/></label>
          {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className={primaryClass}>Concluir cadastro <ArrowRight size={16}/></button>
        </form>
      </div> :
      state === "verify_email" ? <div className={"mx-auto max-w-xl text-center " + cardClass}>
        <Mail className="mx-auto text-[var(--art-primary)]" size={34}/>
        <h2 className="mt-3 text-lg font-bold">Confirme seu e-mail</h2>
        <p className="mt-2 text-sm text-[#627b96]">Para proteger seus dados, confirme o e-mail antes de acessar seus pedidos e orçamentos do site.</p>
      </div> :
      state === "needs_review" ? <div className={"mx-auto max-w-xl text-center " + cardClass}>
        <ShieldCheck className="mx-auto text-[var(--art-primary)]" size={34}/>
        <h2 className="mt-3 text-lg font-bold">Precisamos confirmar seu cadastro</h2>
        <p className="mt-2 text-sm leading-6 text-[#627b96]">Precisamos conferir algumas informações. Nossa equipe poderá ajudar você a concluir seu cadastro.</p>
        <Link to="/contato" className={"mt-5 " + primaryClass}>Entrar em contato <ArrowRight size={16}/></Link>
      </div> :
      state === "error" || !portal?.customer ? <div className={"mx-auto max-w-lg text-center " + cardClass}>
        <h2 className="text-lg font-bold">Não foi possível abrir sua conta</h2>
        <p className="mt-2 text-sm text-[#667a92]">{error || "Tente novamente."}</p>
        <button type="button" onClick={() => setRefreshIndex(index => index + 1)} className={"mt-4 " + primaryClass}><RefreshCw size={16}/> Tentar novamente</button>
      </div> :
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="flex flex-wrap content-start gap-1 self-start rounded-xl border border-[#e2e8f1] bg-white p-2 lg:flex-col">
          {([
            ["overview", "Visão geral", UserRound],
            ["orders", "Meus pedidos", Package],
            ["quotes", "Meus orçamentos", FileText],
            ["addresses", "Meus endereços", MapPin],
            ["favorites", "Meus favoritos", Heart],
            ["profile", "Meus dados", ShieldCheck],
          ] as const).map(([key, label, Icon]) => <button key={key} type="button" onClick={() => setTab(key)}
            aria-current={tab === key ? "page" : undefined}
            className={"flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-[13px] font-semibold transition-colors " + (tab === key ? "bg-[#eef3ff] text-[var(--art-primary)]" : "text-[#627994] hover:bg-[#f5f7fb]")}>
            <Icon size={17}/> {label}
          </button>)}
        </aside>
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-[20px] font-bold tracking-tight text-[#183250]">{tab === "overview" ? greeting + ", " + displayName + "!" : headings[tab]}</h2>
              <p className="mt-1 text-[13px] text-[#72849b]">{tab === "overview" ? "Que bom ter você aqui. Veja as novidades da sua conta." : "Consulte e organize suas informações."}</p></div>
          </div>
          {portal.match_status === "pending_review" && <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <ShieldCheck size={19} className="mt-0.5 shrink-0"/>
            <div><strong className="block">Seus dados estão em análise</strong>
              <p className="mt-1 text-xs leading-5">Estamos conferindo algumas informações do seu cadastro. Você pode continuar consultando suas compras e solicitações normalmente.</p>
            </div>
          </div>}
          {portal.match_status === "rejected" && <div className="mb-4 rounded-xl border border-[#dce5f1] bg-white p-4 text-sm text-[#536982]">Não conseguimos confirmar alguns dados do cadastro. Suas compras e solicitações continuam disponíveis.</div>}
          {tab === "overview" && <>
            <div className="grid gap-3 sm:grid-cols-2">
              {([{ label: "Pedidos", count: orders.length, icon: Package, target: "orders" },
                { label: "Orçamentos", count: quotes.length, icon: FileText, target: "quotes" }] as const).map(({ label, count, icon: Icon, target }) =>
                <button type="button" key={target} onClick={() => setTab(target)} className={"flex items-center gap-3 text-left transition-colors hover:border-[#aabde2] " + cardClass}>
                  <span className="rounded-lg bg-[#eef4ff] p-3 text-[var(--art-primary)]"><Icon size={22}/></span>
                  <span><strong className="block text-xl text-[#153250]">{count}</strong><span className="text-xs text-[#72849b]">{label}</span></span>
                </button>)}
            </div>
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-bold text-[#24405d]">Últimos pedidos</h3>
              <RecordList kind="orders" items={orders.slice(0, 3)}/>
              {orders.length > 3 && <button type="button" onClick={() => setTab("orders")} className="mt-3 text-sm font-semibold text-[var(--art-primary)]">Ver todos os pedidos <ArrowRight size={15} className="inline"/></button>}
            </div>
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-bold text-[#24405d]">Últimos orçamentos do site</h3>
              <RecordList kind="quotes" items={quotes.slice(0, 3)}/>
              {quotes.length > 3 && <button type="button" onClick={() => setTab("quotes")} className="mt-3 text-sm font-semibold text-[var(--art-primary)]">Ver todos os orçamentos <ArrowRight size={15} className="inline"/></button>}
            </div>
          </>}
          {tab === "orders" && <RecordList kind="orders" items={orders}/>}
          {tab === "addresses" && userId && <CustomerAddresses userId={userId}/>}
          {tab === "favorites" && <CustomerFavorites/>}

          {tab === "quotes" && <RecordList kind="quotes" items={quotes}/>}
          {tab === "profile" && userId && <CustomerProfile userId={userId} email={portal.customer.email} onSaved={() => setRefreshIndex(index => index + 1)}/>}

        </div>
      </div>}
    </div>
  </div>;
}
