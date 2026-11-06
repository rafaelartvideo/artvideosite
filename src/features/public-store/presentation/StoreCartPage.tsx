import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, ArrowRight, Minus, Package, Plus, ShoppingBag, ShoppingCart, Trash2, Truck } from "lucide-react";
import { useProducts } from "@/features/public-catalog/application/usePublicCatalog";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { formatCurrency } from "@/shared/domain/formatters";
import { removeStoreCartItem, updateStoreCartQuantity, useStoreCart } from "../application/store-cart";

function CartLine({ product, quantity, onOpen, onImageReady }: { product: any; quantity: number; onOpen: () => void; onImageReady: (key: string) => void }) {
  const { url, loading: mediaLoading } = useMediaUrl(product.cover_media_id);
  const imageKey = product.id + ":" + (product.cover_media_id || "none");
  useEffect(() => {
    if (!product.cover_media_id || (!mediaLoading && !url)) onImageReady(imageKey);
  }, [imageKey, mediaLoading, onImageReady, product.cover_media_id, url]);
  const subtotal = Number(product.price || 0) * quantity;
  return <article className="grid gap-4 border-b border-[#e6edf6] p-4 last:border-0 sm:grid-cols-[100px_1fr_auto] sm:items-center sm:p-5">
    <button type="button" onClick={onOpen} aria-label={"Ver " + product.name}
      className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border border-[#e6edf6] bg-[#f8fbff] p-2">
      {url ? <img src={url} alt={product.name} loading="eager" onLoad={() => onImageReady(imageKey)} onError={() => onImageReady(imageKey)} className="h-full w-full object-contain"/> : <Package size={37} className="text-[#a8bfdc]"/>}
    </button>
    <div className="min-w-0">
      <button type="button" onClick={onOpen} className="text-left text-[14px] font-extrabold leading-6 text-[#10243d] hover:text-[var(--art-primary)]">{product.name}</button>
      <p className="mt-1 text-[14px] font-bold text-[var(--art-primary)]">{product.price != null ? formatCurrency(product.price) : "Preço indisponível"}</p>
      <button type="button" onClick={() => removeStoreCartItem(product.id)} className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#8b5161] hover:underline">
        <Trash2 size={14}/> Remover
      </button>
    </div>
    <div className="flex items-center gap-4 sm:flex-col sm:items-end">
      <div className="flex items-center rounded-lg border border-[#dce6f2] bg-white">
        <button type="button" className="flex h-10 w-10 items-center justify-center hover:bg-blue-50" aria-label={"Diminuir " + product.name}
          onClick={() => updateStoreCartQuantity(product.id, quantity - 1)}><Minus size={16}/></button>
        <span className="w-9 text-center text-sm font-extrabold">{quantity}</span>
        <button type="button" className="flex h-10 w-10 items-center justify-center hover:bg-blue-50 disabled:opacity-30"
          disabled={quantity >= 10} aria-label={"Aumentar " + product.name}
          onClick={() => updateStoreCartQuantity(product.id, quantity + 1)}><Plus size={16}/></button>
      </div>
      <strong className="text-[15px] text-[#10243d]">{formatCurrency(subtotal)}</strong>
    </div>
  </article>;
}

export function StoreCartPage({ onReady }: { onReady: () => void }) {
  const navigate = useNavigate();
  const { items, count } = useStoreCart();
  const { products, loading, error } = useProducts();
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [readyImages, setReadyImages] = useState<Record<string, boolean>>({});
  const [showFixedBar, setShowFixedBar] = useState(true);
  const summaryRef = useRef<HTMLElement>(null);
  const markImageReady = useCallback((key: string) => setReadyImages(previous => previous[key] ? previous : { ...previous, [key]: true }), []);
  useEffect(() => {
    const element = summaryRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setShowFixedBar(!entry.isIntersecting), {
      rootMargin: "0px 0px -96px 0px", threshold: 0.01,
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [loading, items.length]);
  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const unavailable = !loading ? items.filter(i => !productById.has(i.productId)) : [];
  const lines = items.flatMap(item => {
    const product = productById.get(item.productId);
    return product ? [{ product, quantity: item.quantity }] : [];
  });
  const subtotal = lines.reduce((sum, item) => sum + Number(item.product.price || 0) * item.quantity, 0);
  const allImagesReady = lines.every(({ product }) => !product.cover_media_id || readyImages[product.id + ":" + product.cover_media_id]);
  const pageLoading = loading || (!error && !allImagesReady);
  useEffect(() => {
    if (!pageLoading) onReady();
  }, [onReady, pageLoading]);
  const canContinue = items.length > 0 && !pageLoading && !error
    && unavailable.length === 0 && lines.every(item => Number(item.product.price) > 0);

  return <div className={"relative min-h-[65vh] bg-[#f7faff] text-[#10243d] " + (items.length ? "pb-24 lg:pb-0" : "")}>
    <section className="bg-gradient-to-r from-[#081a32] to-[#16416d] py-9 text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-[29px] font-extrabold tracking-[-.035em] sm:text-[37px]">Meu carrinho</h1>
        <p className="mt-2 text-[13px] text-white/75">{count} {count === 1 ? "produto selecionado" : "produtos selecionados"}</p>
      </div>
    </section>
    <div className="mx-auto grid max-w-7xl items-start gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
      <div className="min-w-0 overflow-hidden rounded-xl border border-[#e3ebf5] bg-white shadow-sm">
        {loading ? <div className="min-h-36" aria-hidden="true"/>
          : error ? <p className="p-8 text-sm text-red-600">Não foi possível carregar a loja. Tente novamente.</p>
          : !items.length ? <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
              <ShoppingBag size={45} className="text-[#9bb6d5]"/>
              <h2 className="text-[19px] font-extrabold">Seu carrinho está vazio</h2>
              <p className="max-w-sm text-[13px] text-[#677a91]">Escolha os produtos que deseja comprar na Artvideo.</p>
              <button type="button" onClick={() => navigate("/loja")} className="rounded-lg bg-[var(--art-primary)] px-5 py-3 text-[13px] font-bold text-white hover:brightness-110">Explorar produtos</button>
            </div>
          : <>
            <div className="border-b border-[#e6edf6] px-5 py-4"><h2 className="text-[16px] font-extrabold">Produtos no carrinho</h2></div>
            {lines.map(({ product, quantity }) => <CartLine key={product.id} product={product} quantity={quantity}
              onOpen={() => navigate("/loja/" + encodeURIComponent(product.slug))} onImageReady={markImageReady}/>)}
            {unavailable.length > 0 && <div className="border-t border-red-100 bg-red-50 p-5">
              <p className="text-[13px] font-bold text-red-700">Alguns produtos deixaram de estar disponíveis na loja.</p>
              <button type="button" onClick={() => setShowUnavailable(v => !v)} className="mt-2 text-[12px] text-red-700 underline">{showUnavailable ? "Ocultar itens" : "Ver itens para remover"}</button>
              {showUnavailable && unavailable.map(item => <div key={item.productId} className="mt-2 flex items-center justify-between gap-2 text-xs text-red-800">
                <span>Produto indisponível ({item.quantity} un.)</span>
                <button onClick={() => removeStoreCartItem(item.productId)} className="font-bold underline">Remover</button>
              </div>)}
            </div>}
          </>}
      </div>
      <aside ref={summaryRef} className="rounded-xl border border-[#e3ebf5] bg-white p-5 shadow-sm lg:sticky lg:top-24">
        <h2 className="text-[16px] font-extrabold">Resumo</h2>
        <div className="mt-5 flex items-center justify-between gap-3 text-[13px]"><span>Produtos ({count})</span><strong>{formatCurrency(subtotal)}</strong></div>
        <div className="mt-3 flex items-center justify-between gap-3 text-[13px] text-[#677990]"><span>Entrega</span><span>Calculada na próxima etapa</span></div>
        <div className="mt-5 flex justify-between border-t border-[#e6edf6] pt-4 text-[17px] font-extrabold"><span>Subtotal</span><span className="text-[var(--art-primary)]">{formatCurrency(subtotal)}</span></div>
        <button type="button" disabled={!canContinue} onClick={() => navigate("/checkout/carrinho?checkout_id=" + crypto.randomUUID())}
          className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--art-primary)] px-4 text-[13px] font-extrabold text-white transition-all hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
          Finalizar compra <ArrowRight size={17}/>
        </button>
        <button type="button" onClick={() => navigate("/loja")} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 text-[12px] font-bold text-[#526a86] hover:text-[var(--art-primary)]">
          <ArrowLeft size={16}/> Continuar comprando
        </button>
        <div className="mt-4 flex items-start gap-2 border-t border-[#edf1f7] pt-4 text-[12px] text-[#687b93]"><Truck size={18} className="shrink-0 text-[var(--art-primary)]"/> Entregamos somente nos CEPs atendidos pela Artvideo.</div>
      </aside>
    </div>
    {!!items.length && !pageLoading && showFixedBar && <div aria-label="Resumo fixo do carrinho" className="fixed inset-x-0 bottom-0 z-50 border-t border-[#e0e8f2] bg-white/95 px-4 pb-[calc(10px+env(safe-area-inset-bottom,0px))] pt-3 shadow-[0_-6px_24px_rgba(15,38,73,.1)] backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="min-w-0 flex-1 text-[11px] leading-5 text-[#647791]">
          <div className="grid grid-cols-2 gap-x-3">
            <p className="min-w-0">Produtos <strong className="block text-[12px] text-[#10243d]">{formatCurrency(subtotal)}</strong></p>
            <p className="min-w-0">Frete <strong className="block text-[12px] text-[#10243d]">A calcular</strong></p>
          </div>
          <p className="mt-1.5 border-t border-[#e6edf6] pt-1.5 text-[13px] font-bold text-[#10243d]">Subtotal: {formatCurrency(subtotal)}</p>
        </div>
        <button type="button" disabled={!canContinue} onClick={() => navigate("/checkout/carrinho?checkout_id=" + crypto.randomUUID())}
          className="flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--art-primary)] px-4 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
          Finalizar compra <ArrowRight size={17}/>
        </button>
      </div>
    </div>}
  </div>;
}
