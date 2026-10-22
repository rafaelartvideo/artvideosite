import { PublicBreadcrumb } from "@/features/public-shell/presentation/PublicPageHeader";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { addStoreCartItem } from "../application/store-cart";
import { animateProductToCart } from "../application/cart-animation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle, ArrowLeft, BadgeCheck, ChevronLeft, ChevronRight,
  Image as ImageIcon, LockKeyhole, MessageCircle, Minus,
  Package, Plus, ShieldCheck, ShoppingCart, Star, Truck, X,
} from "lucide-react";
import { useProductDetailBySlug } from "@/features/public-catalog/application/usePublicCatalog";
import { publicMediaUrl } from "@/features/public-catalog/infrastructure/public-media";
import { getStoreProductExtras, loadStorePickupOption, quoteStoreShipping, submitStoreReview, type ShippingOption } from "@/features/public-store/infrastructure/storefront.repository";
import { useSiteSettings } from "@/features/public-shell/application/useSiteSettings";
import type { PublicPage } from "@/features/public-shell/domain/navigation";
import { PublicHeading, PublicButton } from "@/features/public-shell/presentation/PublicUi";
import { formatCurrency } from "@/shared/domain/formatters";
import { getWhatsAppNumber } from "@/features/public-shell/application/site-settings";

const inputClass = "min-h-11 w-full rounded-[6px] border border-[#dce5f1] bg-white px-3 py-2.5 text-[13px] text-[#0b1d37] outline-none transition-all placeholder:text-[#92a0b3] focus:border-[var(--art-primary)] focus:ring-2 focus:ring-blue-200";
const reviewStars = (rating: number) => Array.from({ length: 5 }, (_, i) =>
  <Star key={i} size={17} fill={i < Math.round(rating) ? "currentColor" : "none"}
    className={i < Math.round(rating) ? "text-[#f59e0b]" : "text-[#cbd5e1]"} strokeWidth={1.8}/>);

function ProductImage({ src, alt, className = "" }: { src?: string | null; alt: string; className?: string }) {
  return src ? <img src={src} alt={alt} className={`h-full w-full object-contain transition-opacity duration-150 ease-out ${className}`}/> :
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-white via-[#f6faff] to-[#e4effe]">
      <ImageIcon size={65} strokeWidth={1.2} className="text-[#adc3e2]"/>
    </div>;
}

export function ProductDetailPage({ slug, setPage }: { slug: string | null; setPage: (page: PublicPage) => void }) {
  const { detail, loading, error } = useProductDetailBySlug(slug);
  const navigate = useNavigate();
  const { settings } = useSiteSettings();
  const pickupQuery = useQuery({
    queryKey: ["artvideo-store-pickup"], queryFn: loadStorePickupOption, staleTime: 30_000,
  });
  const productId: string = detail?.product?.id ?? "";
  const extraQuery = useQuery({
    queryKey: ["artvideo-storefront-extra", productId],
    enabled: Boolean(productId),
    queryFn: () => getStoreProductExtras(productId, detail?.media ?? null),
    staleTime: 30_000,
  });
  const [imageIndex, setImageIndex] = useState(0);
  const [readyGallery, setReadyGallery] = useState("");
  // Só exibe a página depois de carregar a galeria e os detalhes do produto.
  const galleryUrls = (extraQuery.data?.images?.length
    ? extraQuery.data.images.slice(0,4).map((image: {url: string}) => image.url)
    : [publicMediaUrl(detail?.media)].filter(Boolean)) as string[];
  const gallerySignature = JSON.stringify([productId, ...galleryUrls]);
  useEffect(() => {
    if (!productId || extraQuery.isPending) return;
    let active = true;
    setReadyGallery("");
    Promise.all(galleryUrls.map(url => new Promise<void>(resolve => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () => resolve();
      image.src = url;
      if (image.complete) resolve();
    }))).then(() => { if (active) setReadyGallery(gallerySignature); });
    return () => { active = false; };
  }, [productId, gallerySignature, extraQuery.isPending]);

  const [qty, setQty] = useState(1);
  const [postalCode, setPostalCode] = useState("");
  const [shipping, setShipping] = useState<{ key: string; options: ShippingOption[] } | null>(null);
  const [selectedShippingId, setSelectedShippingId] = useState("");
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState("");
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [cartFeedback,setCartFeedback]=useState("");
  const [reviewOrderId, setReviewOrderId] = useState(() => typeof sessionStorage !== "undefined" ? sessionStorage.getItem("artvideo-last-order") || "" : "");
  const [reviewEmail, setReviewEmail] = useState(() => typeof sessionStorage !== "undefined" ? sessionStorage.getItem("artvideo-last-email") || "" : "");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const [reviewSending, setReviewSending] = useState(false);
  const [reviewFeedback, setReviewFeedback] = useState("");
  const purchaseReturn = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("compra") : null;

  useEffect(() => {
    setImageIndex(0); setQty(1); setPostalCode(""); setShipping(null); setSelectedShippingId("");
    setShippingError("");
  }, [productId]);

  if (loading || (Boolean(productId) && (extraQuery.isPending || readyGallery !== gallerySignature))) return <section role="status" aria-live="polite" aria-label="Carregando detalhes do produto" className="min-h-[55vh] bg-[#f7faff]">
    <div className="mx-auto max-w-7xl animate-pulse px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 h-4 w-52 rounded-full bg-[#dfe9f5]"/>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
        <div className="space-y-4"><div className="aspect-square max-h-[520px] rounded-2xl bg-gradient-to-br from-[#e6eef9] via-white to-[#dbe9f9]"/><div className="flex gap-3">{[0,1,2,3].map(i=><div key={i} className="h-20 w-20 rounded-xl bg-[#e3edf8]"/>)}</div></div>
        <div className="space-y-5 rounded-2xl bg-white p-6 shadow-sm"><div className="h-4 w-28 rounded-full bg-[#e3edf8]"/><div className="h-8 w-4/5 rounded-lg bg-[#dfe9f5]"/><div className="h-5 w-1/2 rounded-lg bg-[#e3edf8]"/><div className="my-8 h-11 w-2/5 rounded-lg bg-[#dfe9f5]"/><div className="h-12 w-full rounded-lg bg-[#e3edf8]"/><div className="h-12 w-full rounded-lg bg-[#dfe9f5]"/></div>
      </div>
      <span className="sr-only">Carregando produto...</span>
    </div>
  </section>;
  if (error || !detail) return <section className="min-h-[55vh] bg-[#f8fbff] py-20"><div className="mx-auto max-w-lg px-4 text-center">
    <AlertCircle size={34} className="mx-auto mb-4 text-[var(--art-primary)]"/>
    <PublicHeading>{error ? "Não foi possível carregar este produto" : "Produto não encontrado"}</PublicHeading>
    <p className="my-4 text-[14px] text-[#5d6c83]">{error || "O produto não está disponível."}</p>
    <PublicButton onClick={() => setPage("loja")}>Voltar para a loja</PublicButton>
  </div></section>;

  const { product, brand } = detail;
  const extras = extraQuery.data;
  const images = extras?.images.length ? extras.images.slice(0,4) :
    publicMediaUrl(detail.media) ? [{ url: publicMediaUrl(detail.media)!, alt: product.name }] : [];
  const selectedImage = images[Math.min(imageIndex, Math.max(0, images.length - 1))];
  const stock = extras?.stock ?? null;
  const canBuy = typeof stock === "number" && stock > 0 && typeof product.price === "number" && product.price > 0;
  const selectedQty = Math.min(qty, Math.max(1, stock ?? 1));
  const shipKey = `${productId}:${selectedQty}:${postalCode.replace(/\D/g, "")}`;
  const options = shipping?.key === shipKey ? shipping.options : [];
  const selectedOption = options.find(item => item.id === selectedShippingId);
  const comparePrice = product.price != null && product.compare_at_price != null && Number(product.compare_at_price) > Number(product.price)
    ? Number(product.compare_at_price) : null;
  const name = String(product.name);
  const positiveValue = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0;
  const formatCm = (value: unknown) => (Number(value) / 10).toLocaleString("pt-BR", {maximumFractionDigits: 1}) + " cm";
  const specs: { label: string; value: string }[] = [
    {label: "Marca", value: String(brand?.name ?? "")},
    {label: "Modelo", value: String(product.model ?? "")},
    {label: "Referência do fabricante", value: String(product.manufacturer_code ?? "")},
    {label: "Código do produto", value: String(product.sku ?? "")},
    {label: "Código de barras", value: String(product.barcode ?? "")},
    {label: "Peso", value: positiveValue(product.gross_weight_grams) ? (Number(product.gross_weight_grams) / 1000).toLocaleString("pt-BR", {maximumFractionDigits: 3}) + " kg" : ""},
    {label: "Largura", value: positiveValue(product.width_mm) ? formatCm(product.width_mm) : ""},
    {label: "Altura", value: positiveValue(product.height_mm) ? formatCm(product.height_mm) : ""},
    {label: "Profundidade", value: positiveValue(product.length_mm) ? formatCm(product.length_mm) : ""},
  ].filter(item => item.value.trim() !== "");
  const fullDescription = String(product.description ?? "").trim();
  const paragraphs = (fullDescription || String(product.short_description ?? "").trim())
    .split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const whatsapp = getWhatsAppNumber(settings);
  const askUrl = whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Olá! Gostaria de tirar uma dúvida sobre o produto ${name}: ${shareUrl}`)}` : "";

  const quoteShipping = async () => {
    setShippingError(""); setShipping(null); setSelectedShippingId("");
    const digits = postalCode.replace(/\D/g, "");
    if (!/^\d{8}$/.test(digits)) { setShippingError("Informe um CEP válido com 8 dígitos."); return; }
    setShippingLoading(true);
    try {
      const result = await quoteStoreShipping(productId, selectedQty, digits);
      if (!result.length) throw new Error("Ainda não fazemos entregas para este CEP. Tente outro endereço.");
      setShipping({ key: shipKey, options: result });
      setSelectedShippingId(result[0].id);
    } catch (e) { setShippingError(e instanceof Error ? e.message : "Não foi possível calcular o frete."); }
    finally { setShippingLoading(false); }
  };

  const sendReview = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setReviewSending(true); setReviewFeedback("");
    try {
      await submitStoreReview({
        orderId: reviewOrderId.trim(), email: reviewEmail.trim(),
        rating: reviewRating, comment: reviewBody.trim(),
      });
      setReviewBody("");
      setReviewFeedback("Avaliação recebida! Ela será analisada antes de aparecer publicamente.");
    } catch (e) { setReviewFeedback(e instanceof Error ? e.message : "Não foi possível enviar sua avaliação."); }
    finally { setReviewSending(false); }
  };

  return <div className="bg-white text-[#0b1d37]">
    {purchaseReturn && <div role="status" className="border-b border-[#dce9f8] bg-[#eff6ff] px-4 py-3 text-center text-[13px] font-semibold text-[#294c77]">
      {purchaseReturn === "nao-concluida" ?
        "O pagamento não foi concluído. Nenhum pedido é considerado pago sem confirmação do gateway." :
        "Retorno do pagamento recebido. A Artvideo confirmará seu pedido apenas após a verificação pelo provedor."}
    </div>}
    <PublicBreadcrumb items={[{ label: "Início", onClick: () => setPage("home") }, { label: "Loja", onClick: () => setPage("loja") }, { label: name }]}/>
    <section className="bg-[#f8fbff] py-7 sm:py-10">
      <div className="mx-auto grid max-w-7xl items-start gap-7 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(250px,.72fr)] lg:gap-6 lg:px-8">
        {/* Miniaturas verticais e imagem principal */}
        <div className="flex min-w-0 flex-col-reverse gap-3 sm:flex-row">
          {images.length > 1 && <div className="flex shrink-0 flex-row gap-2 overflow-x-auto sm:w-[65px] sm:flex-col sm:overflow-y-auto">
            {images.map((image, i) => <button key={image.url} type="button" onClick={() => setImageIndex(i)}
              aria-label={`Ver imagem ${i + 1}`} aria-pressed={imageIndex === i}
              className={`h-[62px] w-[62px] shrink-0 overflow-hidden rounded-[6px] border-2 bg-white p-1 transition-all hover:border-[var(--art-primary)] ${imageIndex === i ? "border-[var(--art-primary)]" : "border-[#dce6f3]"}`}>
              <ProductImage src={image.url} alt={image.alt}/>
            </button>)}
          </div>}
          <div className="relative min-w-0 flex-1 overflow-hidden rounded-[9px] border border-[#e4eaf3] bg-white shadow-sm">
            <div className="aspect-[1/1] w-full overflow-hidden p-5 sm:p-8"><ProductImage src={selectedImage?.url} alt={selectedImage?.alt || name}/></div>
            {images.length > 1 && <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
              <button type="button" onClick={() => setImageIndex(i => (i + images.length - 1) % images.length)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e2e9f2] bg-white text-[#0b1d37] shadow-sm hover:bg-blue-50" aria-label="Imagem anterior"><ChevronLeft size={19}/></button>
              <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-[#48617e]">{imageIndex+1} / {images.length}</span>
              <button type="button" onClick={() => setImageIndex(i => (i + 1) % images.length)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e2e9f2] bg-white text-[#0b1d37] shadow-sm hover:bg-blue-50" aria-label="Próxima imagem"><ChevronRight size={19}/></button>
            </div>}
          </div>
        </div>

        {/* Informações principais */}
        <div className="min-w-0 py-2">
          <p className="text-[12px] font-bold text-[var(--art-primary)]">{brand?.name || "Eletrônica Artvideo"}</p>
          <h1 className="mt-2 text-[24px] font-extrabold leading-[1.25] tracking-[-.035em] sm:text-[30px]" style={{fontFamily:"'Poppins','Inter',sans-serif"}}>{name}</h1>
          {product.sku && <p className="mt-2 text-[11px] text-[#7c8b9f]">Código: {product.sku}</p>}
          <a href="#avaliacoes" className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#45617f] hover:text-[var(--art-primary)]">
            {extras?.reviewCount ? <><strong className="text-[#0b1d37]">{extras.rating.toFixed(1)}</strong> {reviewStars(extras.rating)} <span>({extras.reviewCount} avaliações)</span></> :
              <span>Ainda sem avaliações de compradores</span>}
          </a>
          <div className="mt-6 border-t border-[#e0e8f2] pt-5">
            {comparePrice != null && <p className="text-[13px] text-[#8290a3] line-through">{formatCurrency(comparePrice)}</p>}
            <p className="text-[32px] font-extrabold leading-tight tracking-[-.04em] text-[var(--art-primary)]">{product.price != null ? formatCurrency(product.price) : "Preço indisponível"}</p>
            <p className="mt-2 text-[12px] text-[#63738b]">Condições e opções de pagamento apresentadas no checkout seguro.</p>
          </div>
          {product.short_description && <p className="mt-5 whitespace-pre-line text-[14px] leading-[1.75] text-[#53637a]">{product.short_description}</p>}
          <div className="mt-6 space-y-3 border-t border-[#e0e8f2] pt-5">
            <div className="flex items-center gap-3 text-[12px] text-[#53637a]"><ShieldCheck size={19} className="text-[var(--art-primary)]"/> Compra processada pelo provedor de pagamento.</div>
            <div className="flex items-center gap-3 text-[12px] text-[#53637a]"><Truck size={19} className="text-[var(--art-primary)]"/> Entrega calculada para o seu CEP.</div>
            <div className="flex items-center gap-3 text-[12px] text-[#53637a]"><BadgeCheck size={19} className="text-[var(--art-primary)]"/> Atendimento e suporte da Eletrônica Artvideo.</div>
          </div>
          {askUrl && <a href={askUrl} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 text-[13px] font-bold text-[var(--art-primary)] hover:underline"><MessageCircle size={18}/> Perguntar sobre este produto</a>}
        </div>

        {/* Caixa de compra */}
        <aside className="rounded-[9px] border border-[#e0e8f2] bg-white p-5 shadow-sm lg:sticky lg:top-[95px]">
          <div className="mb-5 flex items-start gap-2 text-[13px] text-[#45617e]"><Truck size={21} className="shrink-0 text-[var(--art-primary)]"/><span><strong className="block text-[#0b1d37]">Entrega para seu endereço</strong> Digite seu CEP para consultar se entregamos no seu endereço.</span></div>
          {pickupQuery.data && <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-[12px] text-[#3d5c7e]">
            <strong className="block text-[var(--art-primary)]">Retirada gratuita na loja</strong>
            <span className="mt-1 block">Também é possível retirar o pedido em {pickupQuery.data.city}/{pickupQuery.data.state}, após a confirmação de que está pronto.</span>
          </div>}
          <label className="text-[12px] font-bold text-[#2f445f]" htmlFor="product-cep">CEP de entrega</label>
          <form onSubmit={e => { e.preventDefault(); void quoteShipping(); }} className="mt-2 flex gap-2">
            <input id="product-cep" inputMode="numeric" value={postalCode} maxLength={9} onChange={e => { setPostalCode(e.target.value.replace(/[^\d-]/g,"").slice(0,9)); setSelectedShippingId(""); }} placeholder="00000-000" className={inputClass}/>
            <button type="submit" disabled={shippingLoading || !canBuy} className="shrink-0 rounded-md bg-[#e8f1fe] px-3 text-[12px] font-bold text-[var(--art-primary)] transition-colors hover:bg-blue-200 disabled:opacity-50">{shippingLoading ? "..." : "Calcular"}</button>
          </form>
          {shippingError && <p role="alert" className="mt-2 text-[12px] leading-5 text-red-600">{shippingError}</p>}
          {options.length > 0 && <fieldset className="mt-4 space-y-2"><legend className="mb-2 text-[12px] font-bold">Entrega disponível</legend>
            {options.map(option => <label key={option.id} className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 transition-colors hover:bg-blue-50 ${selectedShippingId === option.id ? "border-[var(--art-primary)] bg-[#f4f8ff]" : "border-[#dce7f3]"}`}>
              <input type="radio" name="shipping" checked={selectedShippingId === option.id} onChange={() => setSelectedShippingId(option.id)} className="mt-1 accent-blue-600"/>
              <span className="min-w-0 flex-1 text-[11px] leading-5 text-[#53637a]"><strong className="block text-[12px] text-[#0b1d37]">{option.company} · {option.name}</strong>{option.deliveryDays !== null ? `Até ${option.deliveryDays} dias úteis (estimativa)` : "Prazo sob consulta"}</span>
              <strong className="shrink-0 text-[12px] text-[var(--art-primary)]">{formatCurrency(option.price)}</strong>
            </label>)}
          </fieldset>}
          <div className="mt-5 border-t border-[#edf1f5] pt-4">
            <p className="text-[12px] font-bold text-[#0b1d37]">{extraQuery.isPending ? "Consultando estoque..." : extraQuery.isError ? "Estoque temporariamente indisponível" : stock === 0 ? "Produto esgotado" : stock === null ? "Disponibilidade não confirmada" : `Disponível: ${stock} ${stock === 1 ? "unidade" : "unidades"}`}</p>
            {stock !== null && stock > 0 && <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[12px] text-[#5e718b]">Quantidade</span>
              <div className="flex items-center overflow-hidden rounded-md border border-[#dce6f2]">
                <button type="button" onClick={() => { setQty(q => Math.max(1,q-1)); setSelectedShippingId(""); }} disabled={selectedQty <= 1} aria-label="Diminuir quantidade" className="flex h-9 w-9 items-center justify-center hover:bg-blue-50 disabled:opacity-30"><Minus size={16}/></button>
                <span className="w-9 text-center text-[13px] font-bold">{selectedQty}</span>
                <button type="button" onClick={() => { setQty(q => Math.min(stock, q+1)); setSelectedShippingId(""); }} disabled={selectedQty >= stock} aria-label="Aumentar quantidade" className="flex h-9 w-9 items-center justify-center hover:bg-blue-50 disabled:opacity-30"><Plus size={16}/></button>
              </div>
            </div>}
          </div>
          {canBuy && <div className="mt-4 space-y-1 border-t border-[#edf1f5] pt-4 text-[12px]">
            <div className="flex justify-between gap-2"><span>Produtos</span><span>{formatCurrency(Number(product.price)*selectedQty)}</span></div>
            {selectedOption && <div className="flex justify-between gap-2"><span>Frete</span><span>{formatCurrency(selectedOption.price)}</span></div>}
            {selectedOption && <div className="flex justify-between gap-2 pt-2 text-[14px] font-extrabold"><span>Total</span><span>{formatCurrency(Number(product.price)*selectedQty+selectedOption.price)}</span></div>}
          </div>}
          <button type="button" disabled={!canBuy} onClick={() => navigate("/checkout/" + encodeURIComponent(slug || product.slug) + "?q=" + selectedQty + (postalCode.replace(/\D/g, "").length === 8 ? "&cep=" + postalCode.replace(/\D/g, "") : ""))}
            className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[var(--art-primary)] px-4 text-[13px] font-extrabold text-white transition-all hover:-translate-y-0.5 hover:brightness-110 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50">
            <ShoppingCart size={19}/> Comprar agora
          </button>
          <button type="button" disabled={!canBuy} onClick={event => {if(addStoreCartItem(product.id,selectedQty)){setCartFeedback("");animateProductToCart(event.currentTarget);}else setCartFeedback("Limite de itens do carrinho atingido.");}}
            className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[var(--art-primary)] px-4 text-[13px] font-bold text-[var(--art-primary)] transition-colors hover:bg-blue-50 disabled:opacity-50">
            <Plus size={17}/> Adicionar ao carrinho
          </button>
          {cartFeedback && <p role="status" className="mt-2 text-center text-[12px] font-semibold text-[#486785]">{cartFeedback}</p>}
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-[#7b8ba1]"><LockKeyhole size={13}/> O pagamento só ocorre no checkout seguro.</p>
          {!canBuy && <p className="mt-2 text-center text-[12px] text-[#9a4851]">Compra online indisponível até confirmar preço e estoque.</p>}
          {canBuy && !selectedOption && <p className="mt-2 text-center text-[12px] text-[#687b95]">Você poderá consultar o frete durante a finalização da compra.</p>}
        </aside>
      </div>
    </section>

    <section className="border-t border-[#e7eef6] bg-[#f8fafc] py-10 sm:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-[24px] font-semibold tracking-tight text-[#142943] sm:text-[28px]">Informações sobre o produto</h2>
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(330px,.85fr)]">
          <article className="min-w-0 rounded-xl border border-[#e3eaf2] bg-white p-5 sm:p-7">
            <h3 className="border-b border-[#e8edf3] pb-4 text-[18px] font-semibold text-[#18344f]">Descrição</h3>
            {paragraphs.length ? <div className="mt-5 space-y-4 text-[14px] leading-7 text-[#485d71]">
              {paragraphs.map((paragraph, index) => <p key={index} className="whitespace-pre-line break-words">{paragraph}</p>)}
            </div> : <p className="mt-5 text-[14px] leading-7 text-[#718096]">Ainda não há uma descrição detalhada cadastrada para este produto.</p>}
          </article>
          <aside className="min-w-0 overflow-hidden rounded-xl border border-[#e3eaf2] bg-white">
            <div className="border-b border-[#e8edf3] px-5 py-5 sm:px-6">
              <h3 className="text-[18px] font-semibold text-[#18344f]">Características do produto</h3>
              <p className="mt-1 text-[12px] text-[#75849a]">Informações técnicas cadastradas</p>
            </div>
            {specs.length ? <dl className="text-[13px]">
              {specs.map((item,index)=><div key={item.label} className={`grid grid-cols-[minmax(105px,.85fr)_minmax(0,1.15fr)] gap-x-4 gap-y-1 border-b border-[#edf1f5] px-5 py-3.5 last:border-b-0 sm:px-6 ${index%2===0?"bg-[#f8fafc]":"bg-white"}`}>
                <dt className="text-[#64748b]">{item.label}</dt>
                <dd className="min-w-0 break-words font-medium text-[#203b58]">{item.value}</dd>
              </div>)}
            </dl> : <p className="px-6 py-5 text-[13px] text-[#718096]">Características técnicas ainda não cadastradas.</p>}
          </aside>
        </div>
      </div>
    </section>

    <section id="avaliacoes" className="bg-[#f8fbff] py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <PublicHeading>Avaliações e comentários</PublicHeading>
        {extras?.reviewCount ? <div className="mt-5 flex items-center gap-3 rounded-lg border border-[#e5ecf5] bg-white p-5">
          <strong className="text-[35px] text-[#0b1d37]">{extras.rating.toFixed(1)}</strong>
          <div><div className="flex gap-0.5">{reviewStars(extras.rating)}</div><p className="mt-1 text-[12px] text-[#60738c]">{extras.reviewCount} avaliações publicadas</p></div>
        </div> : <div className="mt-5 rounded-lg border border-[#e5ecf5] bg-white p-6 text-[13px] text-[#63748b]">Este produto ainda não recebeu avaliações. Seja o primeiro cliente a compartilhar sua experiência após a compra.</div>}
        {Boolean(extras?.reviews.length) && <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(showAllReviews ? extras!.reviews : extras!.reviews.slice(0,4)).map(review => <article key={review.id} className="rounded-lg border border-[#e5ecf5] bg-white p-5">
            <div className="flex flex-wrap items-center gap-2"><strong className="text-[13px]">{review.author}</strong>{review.verified_purchase && <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-[10px] font-bold text-green-700"><BadgeCheck size={13}/> Compra verificada</span>}</div>
            <div className="mt-2 flex gap-0.5">{reviewStars(review.rating)}</div>
            <p className="mt-3 whitespace-pre-line text-[13px] leading-[1.7] text-[#53637a]">{review.body}</p>
            <time className="mt-2 block text-[11px] text-[#7b8ba1]">{new Date(review.created_at).toLocaleDateString("pt-BR")}</time>
          </article>)}
        </div>}
        {Boolean(extras?.reviews.length && extras.reviews.length > 4) && <button type="button" onClick={() => setShowAllReviews(v => !v)} className="mt-4 text-[13px] font-bold text-[var(--art-primary)] hover:underline">{showAllReviews ? "Mostrar menos" : "Ver mais avaliações"}</button>}
        <form onSubmit={sendReview} className="mt-7 rounded-lg border border-[#e5ecf5] bg-white p-5">
          <h3 className="text-[16px] font-extrabold text-[#0b1d37]">Avaliar minha compra</h3>
          <p className="mt-1 text-[12px] leading-5 text-[#64748b]">Comprou este produto? Use o código do pedido e seu e-mail para compartilhar sua experiência.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-[12px] font-bold">Código do pedido *
              <input required minLength={36} maxLength={36} className={`${inputClass} mt-1`} value={reviewOrderId} onChange={e => setReviewOrderId(e.target.value)} placeholder="Código UUID do pedido"/>
            </label>
            <label className="text-[12px] font-bold">E-mail da compra *
              <input required type="email" className={`${inputClass} mt-1`} value={reviewEmail} onChange={e => setReviewEmail(e.target.value)} placeholder="email@exemplo.com"/>
            </label>
          </div>
          <fieldset className="mt-4">
            <legend className="text-[12px] font-bold">Sua nota *</legend>
            <div className="mt-1 flex gap-1">{[1,2,3,4,5].map(n =>
              <button key={n} type="button" onClick={() => setReviewRating(n)} aria-label={`${n} ${n === 1 ? "estrela" : "estrelas"}`}
                aria-pressed={reviewRating === n} className="rounded p-1 text-[#f59e0b] transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-[var(--art-primary)]">
                <Star size={25} fill={n <= reviewRating ? "currentColor" : "none"}/>
              </button>)}</div>
          </fieldset>
          <label className="mt-4 block text-[12px] font-bold">Comentário *
            <textarea required minLength={10} maxLength={1500} rows={3} value={reviewBody}
              onChange={e => setReviewBody(e.target.value)} placeholder="Conte como foi sua experiência com o produto..." className={`${inputClass} mt-1 resize-y`}/>
          </label>
          {reviewFeedback && <p role="status" className="mt-3 text-[12px] text-[#46658a]">{reviewFeedback}</p>}
          <button type="submit" disabled={reviewSending} className="mt-4 min-h-10 rounded-md bg-[var(--art-primary)] px-5 text-[12px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-60">
            {reviewSending ? "Enviando..." : "Enviar avaliação"}
          </button>
        </form>

      </div>
    </section>

  </div>;
}
