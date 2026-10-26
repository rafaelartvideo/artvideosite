import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  ArrowRight, CheckCircle2, ClipboardList, Eye, EyeOff, FileText,
  LockKeyhole, LogOut, Mail, Package, RefreshCw, ShieldCheck, UserRound, Wrench,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import {
  activateCustomerAccount, getCustomerPortal,
  type CustomerPortal, type CustomerPortalItem, type CustomerActivation,
} from "../infrastructure/customer-account.repository";

type AuthMode = "login" | "register" | "forgot" | "email_sent";
type Tab = "overview" | "orders" | "services" | "quotes" | "profile";
type AccountState = CustomerActivation["status"] | "anonymous" | "loading" | "ready" | "error";
const inputClass = "h-11 w-full rounded-lg border border-[#dce5f1] bg-white px-3.5 text-sm text-[#10213d] outline-none transition-colors focus:border-[var(--art-primary)] focus:ring-2 focus:ring-blue-500/10";
const primaryClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--art-primary)] px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60";
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
function RecordList({ items, kind }: { items: CustomerPortalItem[]; kind: "orders" | "services" | "quotes" }) {
  if (!items.length) return <EmptyHistory
    title={kind === "orders" ? "Nenhum pedido encontrado" : kind === "services" ? "Nenhuma ordem de serviço encontrada" : "Nenhum orçamento encontrado"}
    description="Quando houver registros vinculados ao seu cadastro, eles aparecerão aqui automaticamente." />;
  return <div className="grid gap-3">
    {items.map(item => <article key={item.id} className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8090a7]">
            {kind === "orders" ? "Pedido" : kind === "services" ? "Ordem de serviço" : "Orçamento"} {item.number || "—"}
          </p>
          <h3 className="mt-1 break-words text-sm font-bold text-[#10213d]">
            {kind === "orders" ? item.product_name || "Produtos da compra" :
              kind === "services" ? item.equipment || "Serviço" : item.description || "Solicitação"}
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

export function CustomerAccountPage() {
  const { session, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [passwordRecovery, setPasswordRecovery] = useState(() => new URLSearchParams(window.location.search).has("recovery"));
  const [tab, setTab] = useState<Tab>("overview");
  const [state, setState] = useState<AccountState>("loading");
  const [portal, setPortal] = useState<CustomerPortal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
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
        setState(data.status === "ready" ? "ready" : data.status);
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
      if (name.trim().length < 3) return setError("Informe seu nome completo.");
      if (password.length < 8) return setError("A senha deve ter no mínimo 8 caracteres.");
      if (password !== confirmPassword) return setError("As senhas não coincidem.");
      if (phone.trim() && !/^\d{10,13}$/.test(phone.replace(/\D/g, ""))) {
        return setError("Informe um telefone com DDD válido.");
      }
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
            data: { registration_origin: "artvideo_customer", full_name: name.trim(), phone: phone.replace(/\D/g, "") },
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
    setBusy(true);
    setError("");
    try {
      const result = await activateCustomerAccount(name.trim(), phone.trim());
      if (result.status === "linked") setRefreshIndex(index => index + 1);
      else if (result.status === "invalid_phone") setError("Informe um telefone com DDD válido.");
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
    overview: "Visão geral", orders: "Meus pedidos", services: "Meus serviços",
    quotes: "Meus orçamentos", profile: "Meus dados",
  };
  const orders = portal?.orders || [];
  const services = portal?.services || [];
  const quotes = portal?.quotes || [];

  return <div className="min-h-[65vh] bg-[#f6f8fc] pb-16">
    <div className="mx-auto max-w-7xl px-4 pt-9 sm:px-6 lg:px-8">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.12em] text-[var(--art-primary)]">Eletrônica Artvideo</p>
          <h1 className="mt-1 text-[26px] font-bold tracking-tight text-[#122947] sm:text-[32px]">Minha conta</h1>
          <p className="mt-2 text-sm text-[#657a95]">Seus pedidos, serviços e orçamentos em um só lugar.</p>
        </div>
        {userId && <button type="button" className={secondaryClass} onClick={() => void signOut()} disabled={busy}>
          <LogOut size={16}/> Sair da conta
        </button>}
      </div>

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
      state === "anonymous" ? <div className="mx-auto max-w-md rounded-2xl border border-[#e0e8f3] bg-white p-6 shadow-sm sm:p-8">
        {mode === "email_sent" ? <div className="py-6 text-center">
          <CheckCircle2 className="mx-auto text-emerald-600" size={42}/>
          <h2 className="mt-4 text-xl font-bold text-[#19324e]">Confira seu e-mail</h2>
          <p className="mt-3 text-sm leading-6 text-[#6b7e97]">Se o endereço informado estiver apto, você receberá um link para continuar. Verifique também a caixa de spam.</p>
          <button type="button" onClick={() => { setMode("login"); setError(""); }} className={"mt-5 w-full " + primaryClass}>Voltar ao login</button>
        </div> : <>
          <div className="mb-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#eff4ff] text-[var(--art-primary)]"><UserRound size={25}/></div>
            <h2 className="mt-4 text-xl font-bold text-[#173450]">{mode === "register" ? "Criar minha conta" : mode === "forgot" ? "Recuperar senha" : "Acessar minha conta"}</h2>
            <p className="mt-2 text-[13px] leading-5 text-[#73869e]">{mode === "register" ? "Use seu e-mail para acompanhar os atendimentos da Artvideo." : mode === "forgot" ? "Enviaremos instruções para seu e-mail." : "Entre para consultar seu histórico de atendimento."}</p>
          </div>
          <form onSubmit={event => void submitAuth(event)} className="space-y-4">
            {mode === "register" && <>
              <label className="block text-xs font-semibold text-[#294361]">Nome completo
                <input className={inputClass + " mt-1.5"} value={name} onChange={event => setName(event.target.value)} autoComplete="name" maxLength={120} required placeholder="Seu nome completo"/>
              </label>
              <label className="block text-xs font-semibold text-[#294361]">Telefone (opcional)
                <input className={inputClass + " mt-1.5"} type="tel" value={phone} onChange={event => setPhone(event.target.value)} autoComplete="tel" placeholder="(00) 00000-0000"/>
              </label>
            </>}
            <label className="block text-xs font-semibold text-[#294361]">E-mail
              <input className={inputClass + " mt-1.5"} type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required placeholder="seuemail@exemplo.com"/>
            </label>
            {mode !== "forgot" && <label className="block text-xs font-semibold text-[#294361]">Senha
              <span className="relative mt-1.5 block">
                <input className={inputClass + " pr-11"} type={showPassword ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 8 : 1} placeholder="Sua senha"/>
                <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} className="absolute inset-y-0 right-2 px-2 text-[#627b96]">{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
              </span>
            </label>}
            {mode === "register" && <label className="block text-xs font-semibold text-[#294361]">Confirmar senha
              <input className={inputClass + " mt-1.5"} type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required placeholder="Repita sua senha"/>
            </label>}
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
            <button type="submit" disabled={busy} className={"w-full " + primaryClass}>
              {busy ? <RefreshCw size={17} className="animate-spin"/> : mode === "register" ? <UserRound size={17}/> : mode === "forgot" ? <Mail size={17}/> : <LockKeyhole size={17}/>}
              {mode === "register" ? "Criar conta" : mode === "forgot" ? "Enviar instruções" : "Entrar"} <ArrowRight size={16}/>
            </button>
          </form>
          <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-[13px] font-semibold text-[var(--art-primary)]">
            {mode !== "login" && <button type="button" onClick={() => { setMode("login"); setError(""); }}>Já tenho conta</button>}
            {mode !== "register" && <button type="button" onClick={() => { setMode("register"); setError(""); }}>Criar uma conta</button>}
            {mode === "login" && <button type="button" onClick={() => { setMode("forgot"); setError(""); }}>Esqueci minha senha</button>}
          </div>
          <div className="mt-6 flex items-start gap-2 border-t border-[#e9edf5] pt-4 text-[11px] leading-5 text-[#788ca5]"><ShieldCheck size={16} className="mt-0.5 shrink-0"/> Seus dados são vinculados ao cadastro da Artvideo somente após confirmação do e-mail.</div>
        </>}
      </div> :
      state === "needs_name" || state === "invalid_phone" ? <div className={"mx-auto max-w-lg " + cardClass}>
        <h2 className="text-xl font-bold text-[#173450]">Complete seu cadastro</h2>
        <p className="mt-2 text-sm text-[#657a95]">Precisamos do seu nome para criar seu cadastro de cliente no CRM.</p>
        <form onSubmit={event => void completeAccount(event)} className="mt-5 space-y-4">
          <label className="block text-xs font-semibold text-[#294361]">Nome completo<input className={inputClass + " mt-1.5"} value={name} onChange={event => setName(event.target.value)} required minLength={3} maxLength={120}/></label>
          <label className="block text-xs font-semibold text-[#294361]">Telefone (opcional)<input className={inputClass + " mt-1.5"} value={phone} onChange={event => setPhone(event.target.value)} type="tel"/></label>
          {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className={primaryClass}>Concluir cadastro <ArrowRight size={16}/></button>
        </form>
      </div> :
      state === "verify_email" ? <div className={"mx-auto max-w-xl text-center " + cardClass}>
        <Mail className="mx-auto text-[var(--art-primary)]" size={34}/>
        <h2 className="mt-3 text-lg font-bold">Confirme seu e-mail</h2>
        <p className="mt-2 text-sm text-[#627b96]">Para proteger seus dados, confirme o e-mail antes de acessar o histórico de pedidos e serviços.</p>
      </div> :
      state === "needs_review" ? <div className={"mx-auto max-w-xl text-center " + cardClass}>
        <ShieldCheck className="mx-auto text-[var(--art-primary)]" size={34}/>
        <h2 className="mt-3 text-lg font-bold">Precisamos confirmar seu cadastro</h2>
        <p className="mt-2 text-sm leading-6 text-[#627b96]">Encontramos um cadastro que precisa ser conferido pela equipe da Artvideo antes de liberar seu histórico. Entre em contato com nosso atendimento.</p>
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
            ["services", "Meus serviços", Wrench],
            ["quotes", "Meus orçamentos", FileText],
            ["profile", "Meus dados", ShieldCheck],
          ] as const).map(([key, label, Icon]) => <button key={key} type="button" onClick={() => setTab(key)}
            aria-current={tab === key ? "page" : undefined}
            className={"flex min-h-10 items-center gap-2 rounded-lg px-3 text-left text-[13px] font-semibold transition-colors " + (tab === key ? "bg-[#eef3ff] text-[var(--art-primary)]" : "text-[#627994] hover:bg-[#f5f7fb]")}>
            <Icon size={17}/> {label}
          </button>)}
        </aside>
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-xl font-bold text-[#183250]">{tab === "overview" ? "Olá, " + portal.customer.name.split(" ")[0] : headings[tab]}</h2>
              <p className="mt-1 text-[13px] text-[#72849b]">{tab === "overview" ? "Confira seus acompanhamentos mais recentes." : "Informações sincronizadas com os registros da Artvideo."}</p></div>
            <button type="button" onClick={() => setRefreshIndex(index => index + 1)} className={secondaryClass} title="Atualizar informações"><RefreshCw size={16}/> Atualizar</button>
          </div>
          {tab === "overview" && <>
            <div className="grid gap-3 sm:grid-cols-3">
              {([{ label: "Pedidos", count: orders.length, icon: Package, target: "orders" },
                { label: "Serviços", count: services.length, icon: Wrench, target: "services" },
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
              <h3 className="mb-3 text-sm font-bold text-[#24405d]">Últimos serviços</h3>
              <RecordList kind="services" items={services.slice(0, 3)}/>
              {services.length > 3 && <button type="button" onClick={() => setTab("services")} className="mt-3 text-sm font-semibold text-[var(--art-primary)]">Ver todos os serviços <ArrowRight size={15} className="inline"/></button>}
            </div>
          </>}
          {tab === "orders" && <RecordList kind="orders" items={orders}/>}
          {tab === "services" && <><p className="mb-4 text-[13px] text-[#6e829a]">Para consultar informações detalhadas de uma OS, você também pode usar o acompanhamento por protocolo na página inicial.</p><RecordList kind="services" items={services}/></>}
          {tab === "quotes" && <RecordList kind="quotes" items={quotes}/>}
          {tab === "profile" && <div className={cardClass}>
            <h3 className="text-sm font-bold text-[#25405e]">Dados do cadastro</h3>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[["Nome", portal.customer.name], ["E-mail", portal.customer.email], ["Telefone", portal.customer.phone || "Não informado"]].map(([label, value]) =>
                <div key={label}><span className="block text-[11px] uppercase tracking-wide text-[#8493a8]">{label}</span><strong className="mt-1 block break-words text-sm text-[#24405e]">{value}</strong></div>)}
            </div>
            <p className="mt-5 border-t border-[#ecf0f5] pt-4 text-xs leading-5 text-[#71849c]">Se precisar corrigir dados do cadastro existente, entre em contato com a Artvideo. A edição online será disponibilizada em uma próxima etapa.</p>
          </div>}
        </div>
      </div>}
    </div>
  </div>;
}
