import { useEffect, useState } from "react";
import {
  ArrowLeft, ArrowRight, BadgeCheck, Check, ChevronRight, ClipboardCheck,
  Copy, MapPin, Package, Search, ShieldCheck, Store, Wrench,
} from "lucide-react";
import {
  searchPublicMarketplaceListings,
  type MarketplaceCategory, type MarketplaceListing, type MarketplaceStore,
} from "../infrastructure/marketplace.repository";

type DetailProps = {
  listing: MarketplaceListing;
  vendor: MarketplaceStore | null;
  category: MarketplaceCategory | null;
  stores: MarketplaceStore[];
  onBack: () => void;
  onOpenStore: (store: MarketplaceStore) => void;
  onOpenListing: (listing: MarketplaceListing) => void;
  onRequestService: (listing: MarketplaceListing) => void;
  onBrowseKind: (kind: "service" | "product") => void;
};

function formatPrice(price: number | null) {
  return price == null
    ? "Consulte o valor"
    : price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pricingDescription(listing: MarketplaceListing) {
  if (listing.price_type === "quote") return "Orçamento personalizado";
  if (listing.price_type === "appointment") return "Agendamento sob confirmação";
  return "Preço anunciado";
}

function MarketplaceDetailBody({ listing, vendor, category, stores, onBack, onOpenStore, onOpenListing, onRequestService, onBrowseKind }: DetailProps) {
  const isService = listing.source_kind === "service";
  const label = isService ? "Serviço" : "Produto";
  const [related, setRelated] = useState<MarketplaceListing[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(true);
  const [shareResult, setShareResult] = useState("");
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const oldTitle = document.title;
    document.title = listing.title + " | Union Marketplace";
    return () => { document.title = oldTitle; };
  }, [listing.title]);

  useEffect(() => {
    setImageFailed(false);
    setShareResult("");
    setRelated([]);
    setRelatedLoading(true);
    let active = true;
    void searchPublicMarketplaceListings({
      kind: listing.source_kind,
      categoryId: listing.category_id || undefined,
      pageSize: 8,
    }, stores).then(result => {
      if (active) setRelated(result.listings.filter(item => item.id !== listing.id).slice(0, 4));
    }).catch(() => {
      if (active) setRelated([]);
    }).finally(() => {
      if (active) setRelatedLoading(false);
    });
    return () => { active = false; };
  }, [listing.id, listing.category_id, listing.source_kind, stores]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + window.location.pathname);
      setShareResult("Link copiado!");
    } catch {
      setShareResult("Não foi possível copiar o link neste navegador.");
    }
  };

  return <div className="space-y-6">
    <nav aria-label="Navegação do anúncio" className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#74829a]">
      <button type="button" className="hover:text-[#1032dc]" onClick={onBack}>Marketplace</button>
      <ChevronRight size={14} />
      <button type="button" className="hover:text-[#1032dc]" onClick={() => onBrowseKind(listing.source_kind)}>
        {isService ? "Serviços" : "Produtos"}
      </button>
      <ChevronRight size={14} />
      <span className="max-w-[230px] truncate text-[#263852]" aria-current="page">{listing.title}</span>
    </nav>

    <div className="flex flex-wrap items-center justify-between gap-3">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-[#52627d] hover:text-[#1032dc]">
        <ArrowLeft size={17} /> Voltar aos anúncios
      </button>
      <button onClick={() => void copyLink()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#dce2ed] bg-white px-4 text-xs font-bold text-[#445672] hover:bg-[#f0f3ff]">
        {shareResult === "Link copiado!" ? <Check size={16} /> : <Copy size={16} />} Compartilhar anúncio
      </button>
    </div>
    {shareResult && <p role="status" className="text-right text-xs font-semibold text-[#52627d]">{shareResult}</p>}

    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)_320px]">
      <section className="min-w-0 overflow-hidden rounded-xl border border-[#e0e5ee] bg-white">
        <div className="relative flex aspect-[5/4] items-center justify-center bg-[#f5f7fb]">
          {listing.cover_image_url && !imageFailed
            ? <img src={listing.cover_image_url} alt={listing.title} onError={() => setImageFailed(true)}
                className="h-full w-full object-contain" />
            : isService
              ? <Wrench size={92} strokeWidth={1} className="text-[#9aa8c3]" />
              : <Package size={92} strokeWidth={1} className="text-[#9aa8c3]" />}
        </div>
        <div className="flex items-center gap-2 border-t border-[#e8ecf3] px-4 py-3 text-xs font-medium text-[#738198]">
          <Search size={15} />
          {listing.cover_image_url && !imageFailed ? "Imagem de divulgação fornecida pela empresa" : "Imagem de divulgação não disponível"}
        </div>
      </section>

      <section className="min-w-0 space-y-5 rounded-xl border border-[#e0e5ee] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-[#edf1ff] px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-[#1032dc]">{label}</span>
          {category && <span className="rounded-md border border-[#e1e6ef] px-2.5 py-1 text-[11px] font-semibold text-[#6b7a91]">{category.name}</span>}
        </div>
        <h1 className="break-words text-2xl font-black leading-tight text-[#172945] sm:text-[28px]">{listing.title}</h1>

        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#61738e]">
          <BadgeCheck size={17} className="text-[#1032dc]" />
          Anúncio aprovado
        </div>
        {vendor && <button className="flex w-full items-center gap-3 rounded-lg border border-[#e4e8ef] p-3 text-left transition hover:border-[#acbae4] hover:bg-[#fbfcff]"
          onClick={() => onOpenStore(vendor)}>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#edf1ff]">
            {vendor.logo_url ? <img src={vendor.logo_url} alt="" className="h-full w-full object-cover" />
              : <Store size={22} className="text-[#1032dc]" />}
          </div>
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-sm text-[#172945]">{vendor.display_name}</strong>
            <span className="mt-1 flex items-center gap-1 text-xs text-[#728199]">
              <MapPin size={13} />{[vendor.city, vendor.state].filter(Boolean).join(" · ") || "Localização não informada"}
            </span>
          </span>
          <ChevronRight size={17} className="shrink-0 text-[#63748e]" />
        </button>}

        <div className="border-t border-[#e8ecf3] pt-5">
          <h2 className="mb-3 text-sm font-black text-[#1c2e47]">{isService ? "Sobre este serviço" : "Sobre este produto"}</h2>
          <p className="whitespace-pre-wrap break-words text-sm leading-7 text-[#52647f]">
            {listing.description.trim() || (isService
              ? "A empresa ainda não adicionou uma descrição comercial para este serviço."
              : "A empresa ainda não adicionou uma descrição comercial para este produto.")}
          </p>
        </div>
        <div className="border-t border-[#e8ecf3] pt-5">
          <h2 className="mb-3 text-sm font-black text-[#1c2e47]">Informações do anúncio</h2>
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[#738199]">Categoria</span>
              <span className="font-bold text-[#344762]">{category?.name || "Não informada"}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[#738199]">Modalidade</span>
              <span className="font-bold text-[#344762]">{pricingDescription(listing)}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[#738199]">Responsável</span>
              <span className="max-w-[70%] text-right font-bold text-[#344762]">{vendor?.display_name || "Empresa participante"}</span>
            </div>
          </div>
        </div>
      </section>

      <aside className="space-y-4 rounded-xl border border-[#e0e5ee] bg-white p-5 lg:sticky lg:top-32">
        <p className="text-xs font-semibold text-[#76849b]">{pricingDescription(listing)}</p>
        <p className="break-words text-2xl font-black leading-tight text-[#142847]">
          {listing.price_type === "quote" ? "Sob orçamento" : formatPrice(listing.price)}
        </p>
        {isService ? <>
          <div className="flex gap-2 rounded-lg bg-[#f4f6ff] p-3 text-xs leading-5 text-[#526491]">
            <ClipboardCheck size={18} className="mt-0.5 shrink-0 text-[#1032dc]" />
            Envie sua necessidade para solicitar {listing.price_type === "appointment" ? "um agendamento" : "um orçamento"} referente a este serviço.
          </div>
          <button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#1032dc] px-4 py-3 text-sm font-black text-white hover:bg-[#0b2ab6]"
            onClick={() => onRequestService(listing)}>
            {listing.price_type === "appointment" ? "Solicitar agendamento" : listing.price_type === "quote" ? "Solicitar orçamento" : "Solicitar serviço"}
            <ArrowRight size={17} />
          </button>
          <p className="text-xs leading-5 text-[#8995a7]">
            O envio da solicitação não confirma preço nem agenda. A negociação com a empresa será disponibilizada em outra etapa.
          </p>
        </> : <>
          <div className="rounded-lg bg-[#f4f6ff] p-3 text-xs leading-6 text-[#5c6b87]">
            As compras online ainda não estão disponíveis no Marketplace. Você pode conhecer a loja que publicou o produto.
          </div>
          {vendor && <button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#1032dc] px-4 py-3 text-sm font-black text-white hover:bg-[#0b2ab6]"
            onClick={() => onOpenStore(vendor)}>
            Conhecer a loja <ArrowRight size={17} />
          </button>}
        </>}
        <div className="flex items-start gap-2 border-t border-[#e8ecf3] pt-4 text-xs leading-5 text-[#7b8aa0]">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#1032dc]" />
          Publicado por uma loja habilitada e com anúncio aprovado no Marketplace.
        </div>
      </aside>
    </div>

    {(related.length > 0 || relatedLoading) && <section className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-black text-[#182947]">{isService ? "Outros serviços disponíveis" : "Outros produtos disponíveis"}</h2>
        <button onClick={() => onBrowseKind(listing.source_kind)} className="inline-flex items-center gap-1 text-xs font-black text-[#1032dc]">
          Ver todos <ArrowRight size={15} />
        </button>
      </div>
      {relatedLoading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
        {Array.from({ length: 4 }, (_, idx) => <div key={idx} className="min-h-48 animate-pulse rounded-xl border border-[#e3e8f0] bg-white" />)}
      </div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {related.map(item => <button key={item.id} onClick={() => onOpenListing(item)}
          className="overflow-hidden rounded-xl border border-[#e2e7ef] bg-white text-left transition hover:border-[#aebbe3] hover:shadow-sm">
          <div className="flex aspect-[5/3] items-center justify-center overflow-hidden bg-[#f5f7fb]">
            {item.cover_image_url ? <img src={item.cover_image_url} alt="" loading="lazy" className="h-full w-full object-contain" />
              : item.source_kind === "service" ? <Wrench size={39} className="text-[#9ba9c0]" /> : <Package size={39} className="text-[#9ba9c0]" />}
          </div>
          <div className="space-y-2 border-t border-[#e8ecf3] p-3">
            <h3 className="line-clamp-2 min-h-10 text-sm font-bold text-[#1d2d48]">{item.title}</h3>
            <p className="text-sm font-black text-[#162e55]">{item.price_type === "quote" ? "Sob orçamento" : formatPrice(item.price)}</p>
            <p className="flex items-center gap-1 text-xs font-bold text-[#1032dc]">Ver detalhes <ChevronRight size={13} /></p>
          </div>
        </button>)}
      </div>}
    </section>}
  </div>;
}

export function MarketplaceServiceDetailPage(props: DetailProps) {
  return <MarketplaceDetailBody {...props} />;
}

export function MarketplaceProductDetailPage(props: DetailProps) {
  return <MarketplaceDetailBody {...props} />;
}
