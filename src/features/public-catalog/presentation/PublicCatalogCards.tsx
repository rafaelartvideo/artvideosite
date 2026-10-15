import { ArrowRight, Package, ShoppingCart } from "lucide-react";
import { formatCurrency } from "@/shared/domain/formatters";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { useSiteSettings } from "@/features/public-shell/application/useSiteSettings";
import { homeServiceDisplay, publicIcon } from "@/features/public-shell/domain/site-appearance";

export function BrandCard({ brand }: { brand: any }) {
  const { url: logoUrl } = useMediaUrl(brand.logo_media_id);
  return <div className="flex h-16 items-center justify-center overflow-hidden rounded-md border border-[#e1e8f0] bg-[#f5f7fa] p-2 transition-colors hover:border-blue-200">
    {logoUrl ? <img src={logoUrl} alt={brand.name} loading="lazy" className="max-h-11 max-w-[90%] object-contain" /> : <span className="text-center text-xs font-extrabold text-slate-600">{brand.name}</span>}
  </div>;
}

export function ProductCard({ product, onSelectProduct }: { product: any; onSelectProduct: (slug: string) => void }) {
  const { url: imageUrl } = useMediaUrl(product.cover_media_id);
  return <article className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-lg">
    <button type="button" onClick={() => onSelectProduct(product.slug)} className="flex h-48 w-full items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50 p-3">
      {imageUrl ? <img src={imageUrl} alt={product.name} loading="lazy" className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"/> : <Package size={42} strokeWidth={1.4} className="text-slate-300"/>}
    </button>
    <div className="flex flex-1 flex-col p-4">
      <h3 className="mb-3 line-clamp-2 min-h-10 text-sm font-bold leading-snug text-[var(--art-dark)]">{product.name}</h3>
      <span className="mb-4 text-lg font-black text-[var(--art-primary)]">{product.price != null ? formatCurrency(product.price) : "Consulte o valor"}</span>
      <button type="button" onClick={() => onSelectProduct(product.slug)} className="mt-auto inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--art-primary)] px-4 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90"><ShoppingCart size={15}/> Ver produto</button>
    </div>
  </article>;
}

export function ServiceCard({ service, onSelectService }: { service: any; onSelectService: (slug: string) => void }) {
  const { settings } = useSiteSettings();
  const appearance = homeServiceDisplay(settings.home_service_display)[service.id];
  const Icon = publicIcon(appearance?.icon || service.public_icon || "wrench");
  const { url: imageUrl } = useMediaUrl(service.cover_media_id);
  const basePrice = service.base_price == null ? null : formatCurrency(service.base_price);
  const priceLabel = service.price_mode === "HIDDEN" ? null
    : service.price_mode === "FIXED" && basePrice ? basePrice
    : service.price_mode === "STARTING_FROM" && basePrice ? `A partir de ${basePrice}`
    : "Consulte o valor";
  return <article className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:border-blue-200 hover:shadow-lg">
    <button type="button" onClick={() => onSelectService(service.slug)} className="relative flex h-44 items-center justify-center overflow-hidden bg-gradient-to-br from-[#d9ebff] via-slate-100 to-blue-100">
      {imageUrl ? <img src={imageUrl} alt={service.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"/> : <Icon size={44} strokeWidth={1.3} className="text-[var(--art-primary)]/50"/>}
    </button>
    <div className="flex flex-1 flex-col gap-2 p-4">
      <div className="flex items-center gap-2 text-xs font-bold text-[var(--art-primary)]"><Icon size={17} /> Serviço</div>
      <h3 className="text-sm font-bold text-[var(--art-dark)]">{service.title}</h3>
      {service.short_description && <p className="line-clamp-3 flex-1 text-xs leading-relaxed text-slate-600">{service.short_description}</p>}
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
        {priceLabel && <span className="text-xs font-semibold text-slate-600">{priceLabel}</span>}
        <button onClick={() => onSelectService(service.slug)} className="ml-auto flex items-center gap-1 text-xs font-bold text-[var(--art-primary)]">Ver detalhes <ArrowRight size={14}/></button>
      </div>
    </div>
  </article>;
}
