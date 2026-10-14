import { useEffect, useState } from "react";
import { CalendarDays, ClipboardList, MapPin } from "lucide-react";
import { Section, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { loadMarketplaceOpportunities, type MarketplaceRequestLead } from "../infrastructure/marketplace-requests.repository";
import type { MarketplaceCategory } from "../infrastructure/marketplace.repository";

export function MarketplaceRequestsPanel({ categories, enabled }: {
  categories: MarketplaceCategory[];
  enabled: boolean;
}) {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<MarketplaceRequestLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true);
    setError("");
    void loadMarketplaceOpportunities(page, pageSize).then(result => {
      if (!active) return;
      setItems(result.requests);
      setTotal(result.total);
      const pages = Math.max(1, Math.ceil(result.total / pageSize));
      if (page > pages) setPage(pages);
    }).catch(() => {
      if (active) setError("Não foi possível consultar as solicitações.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [page, revision, enabled]);

  return <Section title="Solicitações de serviços"
    description="Oportunidades publicadas por contratantes. Empresas habilitadas visualizam solicitações abertas da mesma UF; a Union pode visualizar todas. Os contatos pessoais permanecem privados."
    actions={<BtnSecondary onClick={() => setRevision(v => v + 1)} disabled={loading}>Atualizar</BtnSecondary>}>
    {!enabled ? <p className="text-sm text-muted-foreground">Você não tem permissão para consultar as solicitações.</p>
      : loading ? <div className="min-h-48"><LoadingState text="Carregando solicitações..." /></div>
      : error ? <p role="alert" className="text-sm text-destructive">{error}</p>
      : items.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma solicitação aberta para sua região neste momento.</p>
      : <div className="divide-y divide-border">
        {items.map(item => <article key={item.id} className="space-y-2 py-4 first:pt-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground">{item.title}</p>
              <p className="mt-1 text-xs font-semibold text-primary">{categories.find(category => category.id === item.category_id)?.name || "Serviço geral"}</p>
            </div>
            <span className="rounded-md border border-border bg-muted px-2 py-1 text-[11px] font-bold text-foreground">Aberta</span>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{item.description}</p>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><MapPin size={13} /> {item.city} · {item.state}</span>
            {item.preferred_date && <span className="flex items-center gap-1"><CalendarDays size={13} /> Preferência: {item.preferred_date.split("-").reverse().join("/")}</span>}
            <span className="flex items-center gap-1"><ClipboardList size={13} /> Publicada em {new Date(item.created_at).toLocaleDateString("pt-BR")}</span>
          </div>
        </article>)}
        {totalPages > 1 && <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <span className="text-xs text-muted-foreground">{total} solicitações · Página {page} de {totalPages}</span>
          <div className="flex gap-2">
            <BtnSecondary disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</BtnSecondary>
            <BtnSecondary disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima</BtnSecondary>
          </div>
        </div>}
      </div>}
  </Section>;
}
