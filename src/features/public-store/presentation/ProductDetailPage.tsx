import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle, ArrowLeft, BadgeCheck, ChevronLeft, ChevronRight, Clock3,
  CreditCard, Image as ImageIcon, LockKeyhole, MapPin, MessageCircle, Minus,
  Package, Plus, ShieldCheck, ShoppingCart, Star, Truck, X,
} from "lucide-react";
import { useProductDetailBySlug } from "@/features/public-catalog/application/usePublicCatalog";
import { publicMediaUrl } from "@/features/public-catalog/infrastructure/public-media";
import { getStoreProductExtras, quoteStoreShipping, startStoreCheckout, submitStoreReview, type ShippingOption } from "@/features/public-store/infrastructure/storefront.repository";
import { useSiteSettings } from "@/features/public-shell/application/useSiteSettings";
import type { PublicPage } from "@/features/public-shell/domain/navigation";
import { PublicHeading, PublicButton } from "@/features/public-shell/presentation/PublicUi";
import { formatCurrency } from "@/shared/domain/formatters";
import { getWhatsAppNumber } from "@/features/public-shell/application/site-settings";

type CheckoutFields = {
  buyer_name: string; buyer_email: string; buyer_phone: string;
  street: string; number: string; complement: string;
  district: string; city: string; state: string;
};
const blankFields: CheckoutFields = {
  buyer_name: "", buyer_email: "", buyer_phone: "", street: "", number: "",
  complement: "", district: "", city: "", state: "",
};
const inputClass = "min-h-11 w-full rounded-[6px] border border-[#dce5f1] bg-white px-3 py-2.5 text-[13px] text-[#0b1d37] outline-none transition-all placeholder:text-[#92a0b3] focus:border-[var(--art-primary)] focus:ring-2 focus:ring-blue-200";
const reviewStars = (rating: number) => Array.from({ length: 5 }, (_, i) =>
  <Star key={i} size={17} fill={i < Math.round(rating) ? "currentColor" : "none"}
    className={i < Math.round(rating) ? "text-[#f59e0b]" : "text-[#cbd5e1]"} strokeWidth={1.8}/>);

function ProductImage({ src, alt, className = "" }: { src?: string | null; alt: string; className?: string }) {
  return src ? <img src={src} alt={alt} className={`h-full w-full object-contain ${className}`}/> :
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-white via-[#f6faff] to-[#e4effe]">
      <ImageIcon size={65} strokeWidth={1.2} className="text-[#adc3e2]"/>
    </div>;
}

export function ProductDetailPage({ slug, setPage }: { slug: string | null; setPage: (page: PublicPage) => void }) {
  const { detail, loading, error } = useProductDetailBySlug(slug);
  const { settings } = useSiteSettings();
  const productId: string = detail?.product?.id ?? "";
  const extraQuery = useQuery({
    queryKey: ["artvideo-storefront-extra", productId],
    enabled: Boolean(productId),
    queryFn: () => getStoreProductExtras(productId, detail?.media ?? null),
    staleTime: 30_000,
  });
  const [imageIndex, setImageIndex] = useState(0);
  const [qty, setQty] = useState(1);
  const [postalCode, setPostalCode] = useState("");
  const [shipping, setShipping] = useState<{ key: string; options: ShippingOption[] } | null>(null);
  const [selectedShippingId, setSelectedShippingId] = useState("");
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [addressLoading, setAddressLoading] = useState(false);
  const [fields, setFields] = useState<CheckoutFields>(blankFields);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [reviewOrderId, setReviewOrderId] = useState(() => typeof sessionStorage !== "undefined" ? sessionStorage.getItem("artvideo-last-order") || "" : "");
  const [reviewEmail, setReviewEmail] = useState(() => typeof sessionStorage !== "undefined" ? sessionStorage.getItem("artvideo-last-email") || "" : "");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const [reviewSending, setReviewSending] = useState(false);
  const [reviewFeedback, setReviewFeedback] = useState("");
  const purchaseReturn = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("compra") : null;

  useEffect(() => {
    setImageIndex(0); setQty(1); setPostalCode(""); setShipping(null); setSelectedShippingId("");
    setCheckoutOpen(false); setCheckoutError(""); setShippingError(""); setFields(blankFields);
  }, [productId]);

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center gap-2 text-[14px] text-[#5d6c83]"><Clock3 size={20} className="animate-spin text-[var(--art-primary)]"/> Carregando produto...</div>;
  if (error || !detail) return <section className="min-h-[55vh] bg-[#f8fbff] py-20"><div className="mx-auto max-w-lg px-4 text-center">
    <AlertCircle size={34} className="mx-auto mb-4 text-[var(--art-primary)]"/>
    <PublicHeading>{error ? "Não foi possível carregar este produto" : "Produto não encontrado"}</PublicHeading>
    <p className="my-4 text-[14px] text-[#5d6c83]">{error || "O produto não está disponível."}</p>
    <PublicButton onClick={() => setPage("loja")}>Voltar para a loja</PublicButton>
  </div></section>;

  const { product, brand } = detail;
  const extras = extraQuery.data;
  const images = extras?.images.length ? extras.images :
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
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const whatsapp = getWhatsAppNumber(settings);
  const askUrl = whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Olá! Gostaria de tirar uma dúvida sobre o produto ${name}: ${shareUrl}`)}` : "";

  const quoteShipping = async () => {
    setShippingError(""); setShipping(null); setSelectedShippingId("");
    const digits = postalCode.replace(/\D/g, "");
    if (!/^\d{8}$/.test(digits)) { setShippingError("Informe um CEP válido com 8 dígitos."); return; }
    if (!extras?.shippable) { setShippingError("Este produto ainda não possui peso e dimensões cadastrados para calcular o frete."); return; }
    setShippingLoading(true);
    try {
      const result = await quoteStoreShipping(productId, selectedQty, digits);
      if (!result.length) throw new Error("Nenhuma transportadora atende este CEP no momento.");
      setShipping({ key: shipKey, options: result });
      setSelectedShippingId(result[0].id);
    } catch (e) { setShippingError(e instanceof Error ? e.message : "Não foi possível calcular o frete."); }
    finally { setShippingLoading(false); }
  };

  const lookupAddress = async () => {
    const zip = postalCode.replace(/\D/g, "");
    if (!/^\d{8}$/.test(zip)) return;
    setAddressLoading(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${zip}/json/`);
      if (!response.ok) throw new Error("CEP não encontrado.");
      const data = await response.json();
      if (data.erro) throw new Error("CEP não encontrado.");
      setFields(prev => ({ ...prev, street: prev.street || data.logradouro || "",
        district: prev.district || data.bairro || "", city: data.localidade || "", state: data.uf || "" }));
    } catch { /* Endereço pode ser preenchido manualmente. */ }
    finally { setAddressLoading(false); }
  };

  const checkout = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setCheckoutError("");
    if (!canBuy || !selectedOption) { setCheckoutError("Confira o estoque e selecione um frete válido antes de prosseguir."); return; }
    setCheckoutLoading(true);
    try {
      const result = await startStoreCheckout({
        product_id: productId, quantity: selectedQty, postal_code: postalCode.replace(/\D/g, ""),
        shipping_service_id: selectedOption.id, ...fields,
      });
      if (result.orderId) {
        sessionStorage.setItem("artvideo-last-order", result.orderId);
        sessionStorage.setItem("artvideo-last-email", fields.buyer_email);
      }
      window.location.assign(result.url);
    } catch (e) { setCheckoutError(e instanceof Error ? e.message : "Não foi possível iniciar a compra."); }
    finally { setCheckoutLoading(false); }
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
    <nav aria-label="Navegação de produtos" className="border-b border-[#e8edf4]">
      <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-hidden px-4 py-3 text-[12px] text-[#68768c] sm:px-6 lg:px-8">
        <button onClick={() => setPage("home")} className="shrink-0 hover:text-[var(--art-primary)]">Início</button><ChevronRight size={14}/>
        <button onClick={() => setPage("loja")} className="shrink-0 hover:text-[var(--art-primary)]">Loja</button><ChevronRight size={14}/>
        <span className="truncate font-semibold text-[#173252]">{name}</span>
      </div>
    </nav>
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
            <div className="flex items-center gap-3 text-[12px] text-[#53637a]"><BadgeCheck size={19} className="text-[var(--art-primary)]"/> Estoque vinculado ao cadastro do CRM.</div>
          </div>
          {askUrl && <a href={askUrl} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 text-[13px] font-bold text-[var(--art-primary)] hover:underline"><MessageCircle size={18}/> Perguntar sobre este produto</a>}
        </div>

        {/* Caixa de compra */}
        <aside className="rounded-[9px] border border-[#e0e8f2] bg-white p-5 shadow-sm lg:sticky lg:top-[95px]">
          <div className="mb-5 flex items-start gap-2 text-[13px] text-[#45617e]"><Truck size={21} className="shrink-0 text-[var(--art-primary)]"/><span><strong className="block text-[#0b1d37]">Entrega para seu endereço</strong> Calcule o frete e escolha uma transportadora.</span></div>
          <label className="text-[12px] font-bold text-[#2f445f]" htmlFor="product-cep">CEP de entrega</label>
          <form onSubmit={e => { e.preventDefault(); void quoteShipping(); }} className="mt-2 flex gap-2">
            <input id="product-cep" inputMode="numeric" value={postalCode} maxLength={9} onChange={e => { setPostalCode(e.target.value.replace(/[^\d-]/g,"").slice(0,9)); setSelectedShippingId(""); }} placeholder="00000-000" className={inputClass}/>
            <button type="submit" disabled={shippingLoading || !canBuy} className="shrink-0 rounded-md bg-[#e8f1fe] px-3 text-[12px] font-bold text-[var(--art-primary)] transition-colors hover:bg-blue-200 disabled:opacity-50">{shippingLoading ? "..." : "Calcular"}</button>
          </form>
          {shippingError && <p role="alert" className="mt-2 text-[12px] leading-5 text-red-600">{shippingError}</p>}
          {options.length > 0 && <fieldset className="mt-4 space-y-2"><legend className="mb-2 text-[12px] font-bold">Opções de frete</legend>
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
          <button type="button" disabled={!canBuy || !selectedOption} onClick={() => { setCheckoutOpen(true); setCheckoutError(""); void lookupAddress(); }}
            className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[var(--art-primary)] px-4 text-[13px] font-extrabold text-white transition-all hover:-translate-y-0.5 hover:brightness-110 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50">
            <ShoppingCart size={19}/> Comprar agora
          </button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-[#7b8ba1]"><LockKeyhole size={13}/> O pagamento só ocorre no checkout seguro.</p>
          {!canBuy && <p className="mt-2 text-center text-[12px] text-[#9a4851]">Compra online indisponível até confirmar preço e estoque.</p>}
          {canBuy && !selectedOption && <p className="mt-2 text-center text-[12px] text-[#687b95]">Calcule e selecione um frete para continuar.</p>}
        </aside>
      </div>
    </section>

    <section className="border-t border-[#e7eef6] bg-white py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <PublicHeading>Descrição e informações do produto</PublicHeading>
        {product.description ? <p className="mt-5 whitespace-pre-line text-[14px] leading-[1.85] text-[#53637a]">{product.description}</p> :
          <p className="mt-4 text-[13px] text-[#64748b]">A descrição detalhada ainda não foi cadastrada para este produto.</p>}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {brand?.name && <div className="rounded-md border border-[#e6edf6] p-3 text-[12px]"><span className="text-[#718096]">Marca</span><p className="font-bold">{brand.name}</p></div>}
          {product.sku && <div className="rounded-md border border-[#e6edf6] p-3 text-[12px]"><span className="text-[#718096]">Código do produto</span><p className="font-bold">{product.sku}</p></div>}
        </div>
      </div>
    </section>

    <section id="avaliacoes" className="bg-[#f8fbff] py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <PublicHeading>Avaliações e comentários</PublicHeading>
        {extras?.reviewCount ? <div className="mt-5 flex items-center gap-3 rounded-lg border border-[#e5ecf5] bg-white p-5">
          <strong className="text-[35px] text-[#0b1d37]">{extras.rating.toFixed(1)}</strong>
          <div><div className="flex gap-0.5">{reviewStars(extras.rating)}</div><p className="mt-1 text-[12px] text-[#60738c]">{extras.reviewCount} avaliações publicadas</p></div>
        </div> : <div className="mt-5 rounded-lg border border-[#e5ecf5] bg-white p-6 text-[13px] text-[#63748b]">Este produto ainda não tem avaliações publicadas. As avaliações serão exibidas após compras verificadas e moderação.</div>}
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
          <p className="mt-1 text-[12px] leading-5 text-[#64748b]">Para garantir avaliações autênticas, informe o código de um pedido pago e o e-mail usado nele. Sua avaliação passa por moderação.</p>
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
        {askUrl && <div className="mt-7 border-t border-[#e2ebf5] pt-6">
          <h3 className="text-[17px] font-extrabold">Perguntas sobre este produto</h3>
          <p className="mt-2 text-[13px] text-[#64748b]">Tem dúvidas sobre compatibilidade, condições ou características?</p>
          <a className="mt-3 inline-flex items-center gap-2 rounded-md border border-[var(--art-primary)] px-4 py-2.5 text-[12px] font-bold text-[var(--art-primary)] transition-all hover:bg-blue-50" href={askUrl} target="_blank" rel="noopener noreferrer"><MessageCircle size={17}/> Fazer uma pergunta à Artvideo</a>
        </div>}
      </div>
    </section>

    {checkoutOpen && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#07172b]/70 p-3 backdrop-blur-sm" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !checkoutLoading) setCheckoutOpen(false); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="artvideo-checkout-heading" className="flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-[12px] bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#e9eef4] px-5 py-4">
          <div><h2 id="artvideo-checkout-heading" className="text-[18px] font-extrabold text-[#0b1d37]">Finalizar compra</h2>
            <p className="mt-1 text-[12px] text-[#64748b]">Dados de entrega e contato para o pedido</p></div>
          <button type="button" aria-label="Fechar" onClick={() => setCheckoutOpen(false)} disabled={checkoutLoading} className="rounded-md p-2 text-[#64748b] hover:bg-slate-100"><X size={21}/></button>
        </div>
        <form onSubmit={checkout} className="overflow-y-auto px-5 py-5">
          <div className="mb-5 rounded-lg bg-[#f2f7ff] p-4 text-[12px]">
            <strong className="block text-[13px]">{name}</strong><span>Quantidade: {selectedQty} · {selectedOption?.company} {selectedOption?.name}</span>
            <strong className="mt-2 block text-[16px] text-[var(--art-primary)]">Total: {formatCurrency(Number(product.price || 0) * selectedQty + Number(selectedOption?.price || 0))}</strong>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[12px] font-bold sm:col-span-2">Nome completo *<input required maxLength={150} className={`${inputClass} mt-1`} value={fields.buyer_name} onChange={e => setFields({...fields,buyer_name:e.target.value})}/></label>
            <label className="text-[12px] font-bold">E-mail *<input required type="email" className={`${inputClass} mt-1`} value={fields.buyer_email} onChange={e => setFields({...fields,buyer_email:e.target.value})}/></label>
            <label className="text-[12px] font-bold">Telefone/WhatsApp *<input required inputMode="tel" minLength={10} className={`${inputClass} mt-1`} value={fields.buyer_phone} onChange={e => setFields({...fields,buyer_phone:e.target.value})}/></label>
            <p className="flex items-center gap-1 text-[12px] font-bold sm:col-span-2"><MapPin size={16}/> Endereço de entrega {addressLoading && <span className="font-normal text-[#64748b]">(consultando CEP...)</span>}</p>
            <label className="text-[12px] font-bold sm:col-span-2">Rua/Avenida *<input required className={`${inputClass} mt-1`} value={fields.street} onChange={e => setFields({...fields,street:e.target.value})}/></label>
            <label className="text-[12px] font-bold">Número *<input required className={`${inputClass} mt-1`} value={fields.number} onChange={e => setFields({...fields,number:e.target.value})}/></label>
            <label className="text-[12px] font-bold">Complemento<input className={`${inputClass} mt-1`} value={fields.complement} onChange={e => setFields({...fields,complement:e.target.value})}/></label>
            <label className="text-[12px] font-bold sm:col-span-2">Bairro *<input required className={`${inputClass} mt-1`} value={fields.district} onChange={e => setFields({...fields,district:e.target.value})}/></label>
            <label className="text-[12px] font-bold">Cidade *<input required className={`${inputClass} mt-1`} value={fields.city} onChange={e => setFields({...fields,city:e.target.value})}/></label>
            <label className="text-[12px] font-bold">UF *<input required maxLength={2} minLength={2} className={`${inputClass} mt-1`} value={fields.state} onChange={e => setFields({...fields,state:e.target.value.toUpperCase()})}/></label>
          </div>
          {checkoutError && <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-[12px] text-red-700">{checkoutError}</p>}
          <button type="submit" disabled={checkoutLoading || addressLoading} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[var(--art-primary)] text-[13px] font-bold text-white hover:brightness-110 disabled:opacity-50">
            {checkoutLoading ? <><Clock3 className="animate-spin" size={17}/> Criando pagamento...</> : <><CreditCard size={19}/> Ir para pagamento seguro</>}
          </button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-[#8290a4]"><LockKeyhole size={13}/> Nunca solicitamos dados de cartão neste formulário.</p>
        </form>
      </div>
    </div>}
  </div>;
}
