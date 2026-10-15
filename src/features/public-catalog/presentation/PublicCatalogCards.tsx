import { ArrowRight, Package, ShoppingCart } from "lucide-react";
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

export function ProductCard({ product, onSelectProduct }: { product: any; onSelectProduct: (slug: string) => void }) {
  const { url: imageUrl } = useMediaUrl(product.cover_media_id);
  return <article className="group flex min-w-0 flex-col overflow-hidden rounded-[7px] border border-[#e6ecf4] bg-white p-4 shadow-[0_2px_12px_rgba(12,36,71,.03)] transition-all duration-200 hover:-translate-y-1 hover:border-[#bad5fb] hover:shadow-[0_14px_30px_rgba(16,53,96,.13)]">
    <button type="button" aria-label={`Ver produto ${product.name}`} onClick={() => onSelectProduct(product.slug)}
      className="flex h-[190px] w-full items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-white via-[#fbfdff] to-[#f1f6ff] p-3 focus-visible:outline-2 focus-visible:outline-[var(--art-primary)]">
      {imageUrl ? <img src={imageUrl} alt={product.name} loading="lazy" className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"/>
        : <Package size={49} strokeWidth={1.35} className="text-[#b2c8e5] transition-transform group-hover:scale-110"/>}
    </button>
    <h3 className="mt-3 line-clamp-2 min-h-[42px] text-[13px] font-extrabold leading-[1.43] tracking-[-.025em] text-[#0c1a32]">{product.name}</h3>
    <p className="mt-2 mb-3 text-[20px] font-extrabold leading-6 tracking-[-.03em] text-[var(--art-primary)]">{product.price != null ? formatCurrency(product.price) : "Consulte o valor"}</p>
    <button type="button" onClick={() => onSelectProduct(product.slug)}
      className="mt-auto inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[5px] bg-[var(--art-primary)] px-3 py-2 text-[12px] font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-lg hover:shadow-blue-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--art-primary)] active:translate-y-0">
      <ShoppingCart size={17} strokeWidth={1.8}/> Ver produto
    </button>
  </article>;
}

export function ServiceCard({ service, onSelectService }: { service: any; onSelectService: (slug: string) => void }) {
  const { settings } = useSiteSettings();
  const appearance = homeServiceDisplay(settings.home_service_display)[service.id];
  const Icon = publicIcon(appearance?.icon || service.public_icon || inferredServiceIcon(service.title));
  const { url: imageUrl } = useMediaUrl(appearance?.media_id || service.cover_media_id);
  const basePrice = service.base_price == null ? null : formatCurrency(service.base_price);
  const priceLabel = service.price_mode === "HIDDEN" ? null :
    service.price_mode === "FIXED" && basePrice ? basePrice :
    service.price_mode === "STARTING_FROM" && basePrice ? `A partir de ${basePrice}` : "Consulte o valor";

  return <article className="group overflow-hidden rounded-[7px] border border-[#e3ebf6] bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg">
    <button type="button" aria-label={`Ver detalhes de ${service.title}`} onClick={() => onSelectService(service.slug)} className="relative isolate flex h-[204px] w-full flex-col justify-between overflow-hidden p-5 text-left focus-visible:outline-2 focus-visible:outline-[var(--art-primary)]">
      {imageUrl ? <img src={imageUrl} alt="" loading="lazy" className="absolute inset-y-0 right-0 -z-20 h-full w-[59%] object-cover transition-transform duration-500 group-hover:scale-105"/>
        : <div className="absolute inset-y-0 right-0 -z-20 w-[63%] bg-gradient-to-br from-white via-blue-50 to-blue-200"/>}
      <div className="pointer-events-none absolute inset-0 -z-10" style={{ background: "linear-gradient(90deg, white 0%, white 26%, rgba(255,255,255,.97) 46%, rgba(255,255,255,.68) 66%, rgba(255,255,255,0) 91%)" }}/>
      <Icon size={32} strokeWidth={2} className="text-[var(--art-primary)] transition-transform group-hover:scale-110"/>
      <div className="relative max-w-[67%]">
        <h3 className="line-clamp-2 text-[14px] font-extrabold leading-[1.36] text-[#0b1d37]">{service.title}</h3>
        <p className="mt-2 line-clamp-3 text-[12px] leading-[1.45] text-[#5c6c81]">{service.short_description || service.description || "Saiba mais sobre este serviço."}</p>
      </div>
    </button>
    <div className="flex items-center justify-between gap-2 border-t border-[#edf1f6] px-4 py-2.5">
      <span className="text-[12px] font-semibold text-[#596b84]">{priceLabel || " "}</span>
      <button type="button" onClick={() => onSelectService(service.slug)} className="inline-flex items-center gap-1 text-[12px] font-bold text-[var(--art-primary)] transition-all hover:gap-2 hover:text-blue-800">Ver detalhes <ArrowRight size={14}/></button>
    </div>
  </article>;
}
