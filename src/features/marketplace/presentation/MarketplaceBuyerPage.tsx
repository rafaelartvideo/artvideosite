import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { useLocation, useNavigate } from "react-router";
import { ArrowLeft, CalendarDays, CheckCircle2, ClipboardList, MapPin, Plus, UserRound, X } from "lucide-react";
import { marketplaceBuyerClient } from "../infrastructure/marketplace-buyer.client";
import {
  cancelMyMarketplaceRequest, createMarketplaceServiceRequest, listMyMarketplaceRequests,
  loadMarketplaceBuyerProfile, saveMarketplaceBuyerProfile,
  loadBuyerMarketplaceProposals, respondToMarketplaceProposal,
  type MarketplaceBuyer, type MarketplaceServiceRequest, type MarketplaceBuyerProposal,
} from "../infrastructure/marketplace-requests.repository";
import { loadPublicMarketplaceListing, type MarketplaceCategory, type MarketplaceListing } from "../infrastructure/marketplace.repository";

type Props = { mode: "account" | "request"; categories: MarketplaceCategory[] };
const input = "mt-1.5 h-11 w-full min-w-0 rounded-lg border border-[#dce2ec] bg-white px-3 text-sm text-[#16243c] outline-none focus:border-[#1032dc]";
const label = "block text-xs font-bold text-[#53627a]";
const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#1032dc] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#0928b8] disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#dce2ec] bg-white px-4 py-2 text-sm font-bold text-[#41516d] transition hover:bg-[#f3f5fb]";

function getError(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação. Tente novamente.";
}

export function MarketplaceBuyerPage({ mode, categories }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const listingId = new URLSearchParams(location.search).get("anuncio");
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<MarketplaceBuyer | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [requests, setRequests] = useState<MarketplaceServiceRequest[]>([]);
  const [proposals, setProposals] = useState<MarketplaceBuyerProposal[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [sourceListing, setSourceListing] = useState<MarketplaceListing | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [preferredDate, setPreferredDate] = useState("");

  useEffect(() => {
    let active = true;
    void marketplaceBuyerClient.auth.getSession()
      .then(({ data }) => { if (active) setUser(data.session?.user ?? null); })
      .catch(() => { if (active) setError("Não foi possível recuperar sua sessão."); })
      .finally(() => { if (active) setInitializing(false); });
    const { data: listener } = marketplaceBuyerClient.auth.onAuthStateChange((_event, session) => {
      if (active) { setUser(session?.user ?? null); setInitializing(false); }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  const reloadRequests = useCallback(async (userId: string) => {
    setRequestsLoading(true);
    try {
      const items = await listMyMarketplaceRequests(userId);
      setRequests(items);
      setProposals(await loadBuyerMarketplaceProposals(items.map(item => item.id)));
    } catch (cause) {
      setError(getError(cause));
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setRequests([]);
      setProposals([]);
      return;
    }
    let active = true;
    setProfileLoading(true);
    setError("");
    void loadMarketplaceBuyerProfile(user.id).then(result => {
      if (!active) return;
      setProfile(result);
      setName(result?.full_name || String(user.user_metadata?.full_name || ""));
      setPhone(result?.phone || String(user.user_metadata?.phone || ""));
    }).catch(cause => {
      if (active) setError(getError(cause));
    }).finally(() => {
      if (active) setProfileLoading(false);
    });
    if (mode === "account") void reloadRequests(user.id);
    return () => { active = false; };
  }, [user?.id, mode, reloadRequests]);

  useEffect(() => {
    if (mode !== "request" || !listingId) {
      setSourceListing(null);
      return;
    }
    let active = true;
    setSourceLoading(true);
    void loadPublicMarketplaceListing(listingId)
      .then(result => {
        if (!active) return;
        if (result?.source_kind === "service") {
          setSourceListing(result);
          setTitle(current => current || result.title);
          setCategoryId(current => current || result.category_id || "");
        } else {
          setError("O anúncio vinculado não é um serviço publicado. Você pode criar uma solicitação geral.");
          setSourceListing(null);
        }
      }).catch(() => {
        if (active) setError("Não foi possível carregar o serviço de referência.");
      }).finally(() => {
        if (active) setSourceLoading(false);
      });
    return () => { active = false; };
  }, [listingId, mode]);

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (register && name.trim().length < 2) {
      setError("Informe seu nome completo.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (register) {
        const { data, error: signUpError } = await marketplaceBuyerClient.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            emailRedirectTo: window.location.origin + "/marketplace/conta",
            data: { full_name: name.trim(), phone: phone.trim(), registration_origin: "marketplace_buyer" },
          },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setMessage("Confira seu e-mail para confirmar o cadastro. Depois, volte e entre na sua conta.");
          setRegister(false);
        } else {
          setUser(data.session.user);
        }
      } else {
        const { data, error: signInError } = await marketplaceBuyerClient.auth.signInWithPassword({
          email: email.trim().toLowerCase(), password,
        });
        if (signInError) throw signInError;
        setUser(data.user);
      }
      setPassword("");
    } catch (cause) {
      setError(getError(cause));
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || busy) return;
    if (name.trim().length < 2) {
      setError("Informe seu nome completo.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const updated = await saveMarketplaceBuyerProfile({ user_id: user.id, full_name: name, phone });
      setProfile(updated);
      setEditingProfile(false);
      setMessage("Seus dados foram salvos.");
    } catch (cause) {
      setError(getError(cause));
    } finally {
      setBusy(false);
    }
  };

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !profile || busy || sourceLoading) return;
    if (title.trim().length < 8 || description.trim().length < 30 || city.trim().length < 2 || !/^[A-Za-z]{2}$/.test(state)) {
      setError("Informe título (mín. 8 caracteres), descrição (mín. 30), cidade e UF com duas letras.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await createMarketplaceServiceRequest(user.id, {
        listing_id: sourceListing?.id || null,
        category_id: categoryId || null,
        title: title.trim(),
        description: description.trim(),
        city: city.trim(),
        state: state.toUpperCase(),
        preferred_date: preferredDate || null,
      });
      navigate("/marketplace/conta?enviado=1");
    } catch (cause) {
      setError(getError(cause));
    } finally {
      setBusy(false);
    }
  };

  const cancelRequest = async (requestId: string) => {
    if (!user || busy || !window.confirm("Cancelar esta solicitação?")) return;
    setBusy(true);
    setError("");
    try {
      await cancelMyMarketplaceRequest(user.id, requestId);
      await reloadRequests(user.id);
      setMessage("Solicitação cancelada.");
    } catch (cause) {
      setError(getError(cause));
    } finally {
      setBusy(false);
    }
  };

  const respondToProposal = async (proposalId: string, status: "accepted" | "declined") => {
    if (!user || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await respondToMarketplaceProposal(proposalId, status);
      setMessage(status === "accepted"
        ? "Seu interesse foi enviado à Union World. A confirmação depende da intermediação."
        : "Sua resposta foi registrada pela Union World.");
      await reloadRequests(user.id);
    } catch (cause) {
      setError(getError(cause));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    setError("");
    try {
      const { error: signOutError } = await marketplaceBuyerClient.auth.signOut();
      if (signOutError) throw signOutError;
      setUser(null);
      setProfile(null);
      setMessage("Você saiu da sua conta.");
    } catch (cause) {
      setError(getError(cause));
    } finally {
      setBusy(false);
    }
  };

  return <div className="mx-auto max-w-4xl space-y-5">
    <button className="flex items-center gap-2 text-sm font-bold text-[#53627a] hover:text-[#1032dc]"
      onClick={() => navigate("/marketplace")}><ArrowLeft size={16} /> Voltar ao Marketplace</button>
    <div className="rounded-xl border border-[#e1e6ef] bg-white p-5 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-[#1032dc]">Marketplace Union</p>
          <h1 className="mt-1 text-2xl font-black">{mode === "request" ? "Preciso de um serviço" : "Minha conta"}</h1>
          <p className="mt-2 text-sm text-[#738097]">{mode === "request"
            ? "Descreva sua necessidade. A Union World analisará sua solicitação antes de apresentar às empresas."
            : "Gerencie seus dados e acompanhe suas solicitações."}</p>
        </div>
        {user && <button type="button" onClick={() => void signOut()} disabled={busy} className={secondary}>Sair da conta</button>}
      </div>

      {(message || new URLSearchParams(location.search).has("enviado")) && <div role="status" className="mb-5 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
        <CheckCircle2 size={18} />{new URLSearchParams(location.search).has("enviado") ? "Solicitação enviada para análise da Union World. Acompanhe o andamento aqui." : message}
      </div>}
      {error && <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {initializing || profileLoading ? <div className="flex min-h-52 items-center justify-center text-sm text-[#738097]">Carregando sua conta...</div>
        : !user ? <div className="max-w-md space-y-5">
          <div className="flex gap-2 border-b border-[#e4e8f0] pb-3">
            <button type="button" onClick={() => { setRegister(false); setError(""); }} className={register ? secondary : primary}>Entrar</button>
            <button type="button" onClick={() => { setRegister(true); setError(""); }} className={register ? primary : secondary}>Criar conta</button>
          </div>
          <p className="text-sm text-[#64738a]">O acesso de contratantes é separado do painel das empresas.</p>
          <form onSubmit={submitAuth} className="space-y-4">
            {register && <><label className={label}>Nome completo
              <input className={input} autoComplete="name" value={name} onChange={e => setName(e.target.value)} required maxLength={120} />
            </label><label className={label}>Telefone (opcional)
              <input className={input} type="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} maxLength={30} />
            </label></>}
            <label className={label}>E-mail
              <input className={input} type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </label>
            <label className={label}>Senha
              <input className={input} type="password" autoComplete={register ? "new-password" : "current-password"}
                value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
            </label>
            <button className={primary + " w-full"} type="submit" disabled={busy}>{busy ? "Aguarde..." : register ? "Criar minha conta" : "Entrar"}</button>
          </form>
        </div> : !profile || editingProfile ? <form onSubmit={saveProfile} className="max-w-lg space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-black"><UserRound size={20} /> {profile ? "Editar meus dados" : "Complete seu cadastro"}</h2>
          <p className="text-sm text-[#748198]">Seus dados de contato ficam protegidos e não aparecem publicamente nas solicitações.</p>
          <label className={label}>Nome completo
            <input className={input} autoComplete="name" value={name} onChange={e => setName(e.target.value)} maxLength={120} required />
          </label>
          <label className={label}>Telefone (opcional)
            <input className={input} type="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} maxLength={30} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className={primary}>{busy ? "Salvando..." : "Salvar meus dados"}</button>
            {profile && <button type="button" className={secondary} onClick={() => { setEditingProfile(false); setError(""); }}>Cancelar</button>}
          </div>
        </form> : mode === "request" ? <form onSubmit={submitRequest} className="space-y-5">
          {sourceLoading && <p className="text-sm text-[#738097]">Carregando serviço de referência...</p>}
          {sourceListing && <div className="flex items-center justify-between gap-3 rounded-lg bg-[#eff2ff] px-4 py-3 text-sm text-[#253fb8]">
            <span><strong>Serviço selecionado:</strong> {sourceListing.title}</span>
            <button type="button" onClick={() => { setSourceListing(null); navigate("/marketplace/solicitar", { replace: true }); }} aria-label="Remover serviço de referência"><X size={16} /></button>
          </div>}
          <p className="rounded-lg bg-[#f6f8fc] p-3 text-xs leading-6 text-[#64738a]">
            A Union World é responsável pela intermediação. Seu pedido será analisado antes de ficar disponível às empresas. Evite colocar telefone, e-mail, CPF ou endereço completo na descrição.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label + " sm:col-span-2"}>O que você precisa?
              <input className={input} value={title} onChange={e => setTitle(e.target.value)}
                placeholder="Ex.: Conserto de geladeira que não está resfriando" minLength={8} maxLength={160} required />
            </label>
            <label className={label}>Categoria
              <select className={input} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                <option value="">Sem categoria</option>
                {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
            </label>
            <label className={label}>Data desejada (opcional)
              <input className={input} type="date" value={preferredDate} onChange={e => setPreferredDate(e.target.value)} />
            </label>
            <label className={label}>Cidade
              <input className={input} value={city} onChange={e => setCity(e.target.value)} maxLength={120} required autoComplete="address-level2" />
            </label>
            <label className={label}>UF
              <input className={input} value={state} onChange={e => setState(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))}
                placeholder="SE" maxLength={2} required autoComplete="address-level1" />
            </label>
            <label className={label + " sm:col-span-2"}>Descreva o serviço
              <textarea className={input + " min-h-40 resize-y py-3"} value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Explique o problema, quando começou e o que espera do serviço..." minLength={30} maxLength={3000} required />
              <span className="mt-1 block text-right text-[11px] font-medium text-[#8190a6]">{description.length}/3000</span>
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e4e8f0] pt-5">
            <button type="button" className={secondary} onClick={() => navigate("/marketplace/conta")}>Minhas solicitações</button>
            <button type="submit" disabled={busy || sourceLoading} className={primary}>{busy ? "Enviando..." : "Enviar para análise da Union"}</button>
          </div>
        </form> : <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-sm font-semibold">{profile.full_name}</p><p className="text-xs text-[#748198]">{user.email}</p></div>
            <button type="button" className={secondary} onClick={() => setEditingProfile(true)}>Editar meus dados</button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e4e8f0] pt-5">
            <h2 className="flex items-center gap-2 text-lg font-black"><ClipboardList size={20} /> Minhas solicitações</h2>
            <button className={primary} type="button" onClick={() => navigate("/marketplace/solicitar")}><Plus size={16} /> Nova solicitação</button>
          </div>
          {requestsLoading ? <div className="py-12 text-center text-sm text-[#738097]">Carregando solicitações...</div>
            : requests.length === 0 ? <div className="rounded-lg bg-[#f6f8fc] px-4 py-10 text-center text-sm text-[#738097]">Você ainda não publicou solicitações.</div>
            : <div className="divide-y divide-[#e6eaf2]">
              {requests.map(item => <div key={item.id} className="space-y-2 py-4 first:pt-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-black">{item.title}</h3>
                  <span className={"rounded-md px-2 py-1 text-[11px] font-bold " + (item.status === "open" ? "bg-emerald-50 text-emerald-700" : "bg-[#f0f2f7] text-[#6f7d91]")}>
                    {item.status === "pending_union" ? "Em análise pela Union" : item.status === "open" ? "Aprovada pela Union" : item.status === "rejected" ? "Não aprovada" : item.status === "cancelled" ? "Cancelada" : "Encerrada"}
                  </span>
                </div>
                <p className="line-clamp-3 whitespace-pre-wrap text-sm text-[#64738a]">{item.description}</p>
                <div className="flex flex-wrap items-center gap-4 text-xs text-[#748198]">
                  <span className="flex items-center gap-1"><MapPin size={13} /> {item.city} · {item.state}</span>
                  <span className="flex items-center gap-1"><CalendarDays size={13} /> {new Date(item.created_at).toLocaleDateString("pt-BR")}</span>
                </div>
                {(item.status === "open" || item.status === "pending_union") && <button className="text-xs font-bold text-red-600 hover:underline" type="button" disabled={busy}
                  onClick={() => void cancelRequest(item.id)}>Cancelar solicitação</button>}
                {proposals.filter(proposal => proposal.request_id === item.id).length > 0 && <div className="mt-3 space-y-3 rounded-lg border border-[#dde4f0] bg-[#f8faff] p-4">
                  <h4 className="text-sm font-black text-[#203b8c]">Propostas intermediadas pela Union World</h4>
                  {proposals.filter(proposal => proposal.request_id === item.id).map(proposal =>
                    <div key={proposal.id} className="space-y-2 border-t border-[#e2e6f2] pt-3 first:border-0 first:pt-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="text-sm">{proposal.amount == null
                          ? "Valor sob orçamento"
                          : Number(proposal.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
                        <span className="text-xs font-bold text-[#44577a]">
                          {proposal.status === "presented" ? "Aguardando sua resposta"
                            : proposal.status === "accepted" ? "Aceite enviado à Union"
                            : proposal.status === "declined" ? "Proposta recusada"
                            : proposal.status === "confirmed" ? "Confirmada pela Union" : "Retirada pela Union"}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm text-[#596983]">{proposal.description}</p>
                      {proposal.estimated_days && <p className="text-xs text-[#70829b]">Prazo estimado: {proposal.estimated_days} dias</p>}
                      {proposal.status === "presented" && item.status === "open" && <div className="flex flex-wrap gap-2 pt-1">
                        <button type="button" disabled={busy} className={primary}
                          onClick={() => void respondToProposal(proposal.id, "accepted")}>Tenho interesse</button>
                        <button type="button" disabled={busy} className={secondary}
                          onClick={() => void respondToProposal(proposal.id, "declined")}>Recusar proposta</button>
                      </div>}
                    </div>)}
                  <p className="text-xs text-[#7b89a0]">Toda negociação e confirmação é coordenada pela Union World. Seu aceite não confirma o serviço automaticamente.</p>
                </div>}
              </div>)}
            </div>}
        </div>}
    </div>
  </div>;
}
