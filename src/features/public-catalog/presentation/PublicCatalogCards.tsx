import { useState, type MouseEvent } from "react";
import { animateProductToCart } from "@/features/public-store/application/cart-animation";
import { ArrowRight, Package, ShoppingCart, Plus } from "lucide-react";
import { addStoreCartItem } from "@/features/public-store/application/store-cart";
import { formatCurrency } from "@/shared/domain/formatters";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { useSiteSettings } from "@/features/public-shell/application/useSiteSettings";
import { homeServiceDisplay, inferredServiceIcon, publicIcon } from "@/features/public-shell/domain/site-appearance";

export function BrandCard({ brand }: { brand: any }) {
  const { url: logoUrl } = useMediaUrl(brand.logo_media_id);
  return <div className="group flex h-[69px] items-center justify-center overflow-hidden rounded-[6px] border border-[#e6ecf4] bg-gradient-to-b from-[#f9fbfe] to-[#f1f5fa] px-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white hover:shadow-md">
    {logoUrl ? <img src={logoUrl} alt={brand.name} loading="lazy" className="max-h-10 max-w-full object-contain transition-transform duration-200 group-hover:scale-105"/>
      : <span className="break-words text-center text-[12px] font-extrabold tracking-[-.02em] text-[#264268]">{brand.name}</span>}
  </div>;
}

export function ProductCard({ product, onSelectProduct, availableQuantity }: {
  product: any; onSelectProduct: (slug: string) => void; availableQuantity?: number;
}) {
  const { url: imageUrl } = useMediaUrl(product.cover_media_id);
  const [feedback,setFeedback]=useState("");
  const oldPrice = Number(product.compare_at_price);
  const nowPrice = Number(product.price);
  const hasDiscount = Number.isFinite(oldPrice) && oldPrice > nowPrice && nowPrice > 0;
  const discount = hasDiscount ? Math.round((1 - nowPrice / oldPrice) * 100) : 0;
  const soldOut = availableQuantity === 0;
  const addToCart=(event:MouseEvent<HTMLButtonElement>)=>{if(soldOut)return;if(addStoreCartItem(product.id,1)){setFeedback("");animateProductToCart(event.currentTarget);}else setFeedback("Limite do carrinho atingido");};
  return <article className="group flex min-w-0 flex-col overflow-hidden rounded-[7px] border border-[#e6ecf4] bg-white p-4 shadow-[0_2px_12px_rgba(12,36,71,.03)] transition-colors duration-150 hover:border-[#bad5fb] hover:shadow-[0_14px_30px_rgba(16,53,96,.13)]">
    <div className="relative">
      {hasDiscount && <span className="absolute left-2 top-2 z-10 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-extrabold text-emerald-700">{discount}% OFF</span>}
      {soldOut && <span className="absolute right-2 top-2 z-10 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">Esgotado</span>}
    <button type="button" aria-label={`Ver produto ${product.name}`} onClick={() => onSelectProduct(product.slug)}
      className="flex h-[190px] w-full items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-white via-[#fbfdff] to-[#f1f6ff] p-3 focus-visible:outline-2 focus-visible:outline-[var(--art-primary)]">
      {imageUrl ? <img src={imageUrl} alt={product.name} loading="lazy" className="h-full w-full object-contain transition-opacity duration-150"/>
        : <Package size={49} strokeWidth={1.35} className="text-[#b2c8e5] transition-transform group-hover:scale-110"/>}
    </button>
    </div>
    <h3 className="mt-3 line-clamp-2 min-h-[42px] text-[13px] font-extrabold leading-[1.43] tracking-[-.025em] text-[#0c1a32]">{product.name}</h3>
    <div className="mt-2 mb-3">
      {hasDiscount && <p className="text-[12px] text-[#8798ab] line-through">{formatCurrency(oldPrice)}</p>}
      <p className="text-[20px] font-extrabold leading-6 tracking-[-.03em] text-[var(--art-primary)]">{product.price != null ? formatCurrency(product.price) : "Consulte o valor"}</p>
    </div>
    <button type="button" onClick={() => onSelectProduct(product.slug)}
      className="mt-auto inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[5px] bg-[var(--art-primary)] px-3 py-2 text-[12px] font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-lg hover:shadow-blue-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--art-primary)] active:translate-y-0">
      <ShoppingCart size={17} strokeWidth={1.8}/> Ver produto
    </button>
    <button type="button" onClick={addToCart} disabled={soldOut}
      className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md border border-[var(--art-primary)] px-3 text-[12px] font-bold text-[var(--art-primary)] transition-all hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-[var(--art-primary)] disabled:cursor-not-allowed disabled:opacity-50">
      <Plus size={16}/> Adicionar ao carrinho
    </button>
    {feedback && <p role="status" className="mt-2 text-center text-[11px] font-semibold text-[#486785]">{feedback}</p>}
  </article>;
}

export function ServiceCard({ service, onSelectService, variant = "default", categoryName }: {
  service: any;
  onSelectService: (slug: string) => void;
  variant?: "default" | "catalog";
  categoryName?: string;
}) {
  const { settings } = useSiteSettings();
  const appearance = homeServiceDisplay(settings.home_service_display)[service.id];
  const Icon = publicIcon(appearance?.icon || service.public_icon || inferredServiceIcon(service.title));
  const { url: imageUrl } = useMediaUrl(appearance?.media_id || service.cover_media_id);
  const basePrice = service.base_price == null ? null : formatCurrency(service.base_price);
  const priceLabel = service.price_mode === "HIDDEN" ? null :
    service.price_mode === "FIXED" && basePrice ? basePrice :
    service.price_mode === "STARTING_FROM" && basePrice ? `A partir de ${basePrice}` : "Consulte o valor";

  if (variant === "catalog") return <article className="art-service-card group flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#dfe4e9] bg-white transition-colors duration-150 hover:border-[#acc9e6] hover:shadow-[0_12px_28px_rgba(23,43,69,.08)]">
    <button type="button" aria-label={`Ver detalhes de ${service.title}`} onClick={() => onSelectService(service.slug)}
      className="relative isolate block aspect-[16/10] w-full overflow-hidden bg-[#f0f5fa] text-left focus-visible:outline-2 focus-visible:outline-[var(--art-primary)]">
      {imageUrl && <img src={imageUrl} alt="" loading="lazy" className="absolute inset-y-0 right-0 h-full w-[85%] object-cover transition-opacity duration-150"/>}
      <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, white 0%, white 16%, rgba(255,255,255,.97) 30%, rgba(255,255,255,.68) 52%, rgba(255,255,255,0) 91%)" }}/>
      <Icon size={38} strokeWidth={1.3} className="absolute left-6 top-6 text-[var(--art-primary)]"/>
    </button>
    <div className="flex flex-1 flex-col px-5 pb-5 pt-5">
      <p className="mb-2 text-[11px] leading-4 text-[#697684]">{categoryName || "Serviços Artvideo"}</p>
      <button type="button" onClick={() => onSelectService(service.slug)} className="text-left focus-visible:outline-2 focus-visible:outline-[var(--art-primary)]">
        <h3 className="min-h-12 text-[17px] font-semibold leading-6 tracking-[-.025em] text-[#172b45]">{service.title}</h3>
      </button>
      <p className="mt-3 line-clamp-2 text-[13px] leading-5 text-[#697684]">{service.short_description || "Conheça o serviço e solicite seu orçamento."}</p>
      <div className="mt-auto pt-6">
        {priceLabel && <div className="mb-5">
          {service.price_mode === "STARTING_FROM" && basePrice && <p className="mb-1 text-xs text-[#697684]">A partir de</p>}
          <p className={`${basePrice && (service.price_mode === "FIXED" || service.price_mode === "STARTING_FROM") ? "text-[25px] leading-8 tracking-tight" : "text-base leading-8"} font-semibold text-[#172b45]`}>{basePrice && (service.price_mode === "FIXED" || service.price_mode === "STARTING_FROM") ? basePrice : priceLabel}</p>
        </div>}
        <button type="button" onClick={() => onSelectService(service.slug)} className="flex min-h-11 w-full items-center justify-center gap-3 rounded-md bg-[var(--art-primary)] px-4 py-3 text-sm font-medium text-white transition-all hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--art-primary)]">Ver serviço <ArrowRight size={16}/></button>
      </div>
    </div>
  </article>;

  return <article className="art-service-card group flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#e1e5ea] bg-white transition-colors duration-150 hover:border-blue-300 hover:shadow-lg">
    <button type="button" aria-label={`Ver detalhes de ${service.title}`} onClick={() => onSelectService(service.slug)} className="w-full text-left focus-visible:outline-2 focus-visible:outline-[var(--art-primary)]">
      <div className="aspect-[16/10] overflow-hidden bg-[#f0f3f6]">{imageUrl ? <img src={imageUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-opacity duration-150"/> : <div className="flex h-full items-center justify-center"><Icon size={60} strokeWidth={1.2} className="text-[#87a4bf]"/></div>}</div>
      <div className="p-6 pb-3"><h3 className="text-lg font-semibold leading-6 tracking-tight text-[#172b45]">{service.title}</h3><p className="mt-3 line-clamp-3 text-sm leading-6 text-[#64717e]">{service.short_description || service.description || "Conheça o atendimento e solicite seu orçamento."}</p></div>
    </button>
    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 px-6 pb-6 pt-4"><span className="text-sm font-medium text-[#172b45]">{priceLabel || " "}</span><button type="button" onClick={() => onSelectService(service.slug)} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--art-primary)] transition-all hover:gap-3">Saiba mais <ArrowRight size={16}/></button></div>
  </article>;
}
