import { useEffect, useState, type FormEvent } from "react";
import { CalendarDays, ClipboardList, MapPin } from "lucide-react";
import { Section, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import {
  loadMarketplaceOpportunities, loadUnionMarketplaceBuyerContacts, loadUnionMarketplaceProposals,
  loadUnionMarketplaceRequests, loadCompanyMarketplaceProposals,
  moderateMarketplaceProposal, moderateMarketplaceRequest, sendMarketplaceProposalToUnion,
  type MarketplaceBuyer, type MarketplaceModeratedRequest,
  type MarketplaceProposal, type MarketplaceRequestLead,
} from "../infrastructure/marketplace-requests.repository";
import type { MarketplaceCategory, MarketplaceStore } from "../infrastructure/marketplace.repository";

type Props = {
  categories: MarketplaceCategory[];
  stores: MarketplaceStore[];
  enabled: boolean;
  platform: boolean;
  organizationId: string | null;
  storeApproved: boolean;
};
const inputClass = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary";
const labelClass = "block text-xs font-semibold text-foreground";
const noteClass = "text-xs leading-5 text-muted-foreground";
const statusLabels: Record<string, string> = {
  pending_union: "Aguardando análise da Union",
  open: "Aprovada pela Union",
  rejected: "Não aprovada",
  cancelled: "Cancelada",
  closed: "Encerrada",
  submitted: "Em análise pela Union",
  presented: "Encaminhada ao contratante",
  accepted: "Aceite recebido pela Union",
  declined: "Recusada pelo contratante",
  confirmed: "Confirmada pela Union",
  withdrawn: "Retirada pela Union",
};

function details(item: MarketplaceRequestLead, categories: MarketplaceCategory[]) {
  return <>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-bold text-foreground">{item.title}</h3>
        <p className="mt-1 text-xs font-semibold text-primary">
          {categories.find(category => category.id === item.category_id)?.name || "Serviço geral"}
        </p>
      </div>
      <span className="rounded-md border border-border bg-muted px-2 py-1 text-[11px] font-bold text-foreground">
        {statusLabels[item.status] || item.status}
      </span>
    </div>
    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{item.description}</p>
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1"><MapPin size={13} /> {item.city} · {item.state}</span>
      {item.preferred_date && <span className="flex items-center gap-1"><CalendarDays size={13} /> Data desejada: {item.preferred_date.split("-").reverse().join("/")}</span>}
      <span className="flex items-center gap-1"><ClipboardList size={13} /> {new Date(item.created_at).toLocaleDateString("pt-BR")}</span>
    </div>
  </>;
}

export function MarketplaceRequestsPanel({ categories, stores, enabled, platform, organizationId, storeApproved }: Props) {
  const [tab, setTab] = useState<"requests" | "proposals">("requests");
  const [page, setPage] = useState(1);
  const [requests, setRequests] = useState<MarketplaceRequestLead[]>([]);
  const [proposals, setProposals] = useState<MarketplaceProposal[]>([]);
  const [contacts, setContacts] = useState<MarketplaceBuyer[]>([]);
  const [total, setTotal] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [composing, setComposing] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState("");
  const pageSize = platform ? 20 : 10;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const isPartner = !platform && Boolean(organizationId) && storeApproved;

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    let mounted = true;
    setLoading(true);
    setError("");
    const load = async () => {
      if (platform) {
        const [requestData, proposalData] = await Promise.all([
          loadUnionMarketplaceRequests(page, pageSize),
          loadUnionMarketplaceProposals(),
        ]);
        if (!mounted) return;
        setRequests(requestData.requests);
        setTotal(requestData.total);
        setProposals(proposalData);
        const ids = [...new Set(requestData.requests.map(item => item.buyer_id))];
        const clients = await loadUnionMarketplaceBuyerContacts(ids);
        if (mounted) setContacts(clients);
      } else if (organizationId && storeApproved) {
        const [requestData, proposalData] = await Promise.all([
          loadMarketplaceOpportunities(page, pageSize),
          loadCompanyMarketplaceProposals(organizationId),
        ]);
        if (!mounted) return;
        setRequests(requestData.requests);
        setTotal(requestData.total);
        setProposals(proposalData);
      } else {
        setRequests([]);
        setProposals([]);
        setTotal(0);
      }
    };
    void load().catch(cause => {
      if (mounted) setError(cause instanceof Error ? cause.message : "Falha ao consultar os dados.");
    }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [enabled, platform, organizationId, storeApproved, page, pageSize, revision]);

  const act = async (fn: () => Promise<void>, msg: string) => {
    if (saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await fn();
      setSuccess(msg);
      setRevision(v => v + 1);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Operação não concluída.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const submitProposal = (event: FormEvent<HTMLFormElement>, requestId: string) => {
    event.preventDefault();
    if (!organizationId || description.trim().length < 20) {
      setError("Descreva a proposta com pelo menos 20 caracteres.");
      return;
    }
    const amountValue = amount.trim() === "" ? null : Number(amount);
    const daysValue = days.trim() === "" ? null : Number(days);
    if ((amountValue !== null && (!Number.isFinite(amountValue) || amountValue < 0))
      || (daysValue !== null && (!Number.isSafeInteger(daysValue) || daysValue < 1 || daysValue > 365))) {
      setError("Informe valores e prazo válidos.");
      return;
    }
    void act(
      () => sendMarketplaceProposalToUnion({
        requestId,
        organizationId,
        description: description.trim(),
        amount: amountValue,
        estimatedDays: daysValue,
      }),
      "Proposta recebida pela Union World para análise."
    ).then(ok => { if (ok) { setComposing(null); setDescription(""); setAmount(""); setDays(""); } });
  };

  const proposalForRequest = (id: string) => proposals.find(p => p.request_id === id);
  const unionRequests = requests as MarketplaceModeratedRequest[];
  const pendingCount = unionRequests.filter(r => r.status === "pending_union").length;
  const pendingProposals = proposals.filter(p => p.status === "submitted").length;

  return <Section
    title={platform ? "Mediação de solicitações" : "Solicitações de serviços"}
    description={platform
      ? "A Union analisa as solicitações, recebe as propostas das empresas e decide quando encaminhá-las ao contratante."
      : "Sua empresa só visualiza oportunidades previamente aprovadas pela Union. Toda proposta é enviada primeiro à Union, nunca diretamente ao cliente."}
    actions={<BtnSecondary onClick={() => setRevision(v => v + 1)} disabled={loading}>Atualizar</BtnSecondary>}>
    {!enabled ? <p className={noteClass}>Você não possui permissão para acessar as solicitações.</p>
    : !platform && !isPartner ? <p className={noteClass}>É necessário ter uma loja aprovada e a permissão de gerenciar anúncios para enviar propostas.</p>
    : <>
      <div className="mb-5 flex flex-wrap gap-2 border-b border-border pb-3">
        <button type="button" onClick={() => setTab("requests")}
          className={"rounded-lg px-4 py-2 text-sm font-bold " + (tab === "requests" ? "bg-primary text-white" : "bg-muted text-foreground")}>
          {platform ? "Analisar solicitações" : "Oportunidades"} {platform && pendingCount > 0 ? "(" + pendingCount + ")" : ""}
        </button>
        <button type="button" onClick={() => setTab("proposals")}
          className={"rounded-lg px-4 py-2 text-sm font-bold " + (tab === "proposals" ? "bg-primary text-white" : "bg-muted text-foreground")}>
          {platform ? "Analisar propostas" : "Minhas propostas"} {platform && pendingProposals > 0 ? "(" + pendingProposals + ")" : ""}
        </button>
      </div>
      {success && <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? <LoadingState />
      : tab === "requests" ? <div className="divide-y divide-border">
          {requests.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma solicitação encontrada.</p>}
          {requests.map(item => {
            const ownOffer = proposalForRequest(item.id);
            const buyer = platform ? contacts.find(c => c.user_id === (item as MarketplaceModeratedRequest).buyer_id) : null;
            return <article key={item.id} className="space-y-3 py-5 first:pt-0">
              {details(item, categories)}
              {platform && <div className="flex flex-wrap items-center justify-between gap-3">
                <p className={noteClass}>Contratante: {buyer?.full_name || "Cadastro não localizado"}{buyer?.phone ? " · " + buyer.phone : " · Telefone não informado"}</p>
                {item.status === "pending_union" && <div className="flex flex-wrap gap-2">
                  <BtnPrimary disabled={saving} onClick={() => void act(
                    () => moderateMarketplaceRequest(item.id, "open"), "Solicitação aprovada. Agora as empresas podem visualizar."
                  )}>Aprovar</BtnPrimary>
                  <BtnSecondary disabled={saving} onClick={() => void act(
                    () => moderateMarketplaceRequest(item.id, "rejected"), "Solicitação não aprovada."
                  )}>Recusar</BtnSecondary>
                </div>}
                {item.status === "open" && <BtnSecondary disabled={saving} onClick={() => void act(
                  () => moderateMarketplaceRequest(item.id, "closed"), "Solicitação encerrada pela Union."
                )}>Encerrar</BtnSecondary>}
              </div>}
              {!platform && <div className="space-y-3">
                {ownOffer ? <p className="text-xs font-bold text-primary">Sua proposta: {statusLabels[ownOffer.status] || ownOffer.status}</p>
                  : composing === item.id ? <form onSubmit={event => submitProposal(event, item.id)} className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-sm font-bold">Enviar proposta à Union World</p>
                    <p className={noteClass}>Seu texto e os valores ficarão sob análise da Union antes de qualquer apresentação ao contratante.</p>
                    <label className={labelClass}>Descrição da solução
                      <textarea className={inputClass + " mt-1 min-h-28 resize-y py-2"} value={description}
                        onChange={event => setDescription(event.target.value)} minLength={20} maxLength={2500} required />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={labelClass}>Valor proposto (R$, opcional)
                        <input type="number" min="0" step="0.01" className={inputClass + " mt-1"} value={amount} onChange={event => setAmount(event.target.value)} />
                      </label>
                      <label className={labelClass}>Prazo estimado (dias, opcional)
                        <input type="number" min="1" max="365" step="1" className={inputClass + " mt-1"} value={days} onChange={event => setDays(event.target.value)} />
                      </label>
                    </div>
                    <div className="flex justify-end gap-2">
                      <BtnSecondary onClick={() => setComposing(null)}>Cancelar</BtnSecondary>
                      <BtnPrimary type="submit" disabled={saving}>{saving ? "Enviando..." : "Enviar à Union"}</BtnPrimary>
                    </div>
                  </form> : <BtnPrimary onClick={() => { setComposing(item.id); setDescription(""); setAmount(""); setDays(""); }}>
                    Enviar proposta à Union
                  </BtnPrimary>}
              </div>}
            </article>;
          })}
          {total > pageSize && <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <p className={noteClass}>{total} solicitações · Página {page} de {pages}</p>
            <div className="flex gap-2">
              <BtnSecondary disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</BtnSecondary>
              <BtnSecondary disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Próxima</BtnSecondary>
            </div>
          </div>}
        </div>
      : <div className="divide-y divide-border">
          {proposals.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma proposta recebida.</p>}
          {proposals.map(item => {
            const request = requests.find(r => r.id === item.request_id);
            return <article key={item.id} className="space-y-2 py-4 first:pt-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{request?.title || "Solicitação " + item.request_id.slice(0, 8)}</p>
                  {platform && <p className={noteClass}>Empresa: {stores.find(store => store.organization_id === item.organization_id)?.display_name || "Empresa " + item.organization_id.slice(0, 8)}</p>}
                </div>
                <span className="rounded-md border border-border bg-muted px-2 py-1 text-[11px] font-bold">{statusLabels[item.status] || item.status}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.description}</p>
              <p className="text-xs font-bold text-foreground">
                {item.amount == null ? "Valor sob consulta" : item.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                {item.estimated_days ? " · Estimativa: " + item.estimated_days + " dias" : ""}
              </p>
              {platform && <div className="flex flex-wrap justify-end gap-2">
                {item.status === "submitted" && <>
                  <BtnPrimary disabled={saving} onClick={() => void act(
                    () => moderateMarketplaceProposal(item.id, "presented"), "Proposta encaminhada ao contratante pela Union."
                  )}>Encaminhar ao contratante</BtnPrimary>
                  <BtnSecondary disabled={saving} onClick={() => void act(
                    () => moderateMarketplaceProposal(item.id, "rejected"), "Proposta recusada pela Union."
                  )}>Recusar</BtnSecondary>
                </>}
                {item.status === "presented" && <BtnSecondary disabled={saving} onClick={() => void act(
                  () => moderateMarketplaceProposal(item.id, "withdrawn"), "Proposta retirada pela Union."
                )}>Retirar proposta</BtnSecondary>}
                {item.status === "accepted" && <>
                  <BtnPrimary disabled={saving} onClick={() => void act(
                    () => moderateMarketplaceProposal(item.id, "confirmed"), "Atendimento confirmado pela Union. Solicitação encerrada."
                  )}>Confirmar intermediação</BtnPrimary>
                  <BtnSecondary disabled={saving} onClick={() => void act(
                    () => moderateMarketplaceProposal(item.id, "withdrawn"), "Proposta retirada pela Union."
                  )}>Retirar proposta</BtnSecondary>
                </>}
              </div>}
              {!platform && <p className={noteClass}>Qualquer encaminhamento e confirmação será realizado pela Union World. O contato do contratante permanece reservado.</p>}
            </article>;
          })}
        </div>}
    </>}
  </Section>;
}
