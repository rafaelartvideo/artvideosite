import { ChevronRight, Package } from "lucide-react";
import { publicMediaUrl } from "../infrastructure/public-media";

export function BrandCard({ brand }: { brand: any }) {
  const logoUrl = publicMediaUrl(brand.logo_media);
  return <div className="bg-[#f5f7fa] border border-[#0d1b2e]/10 rounded-lg h-14 flex items-center justify-center hover:border-[#0057e7]/40 transition-colors group">{logoUrl ? <img src={logoUrl} alt={brand.name} className="max-h-10 max-w-[90%] object-contain" /> : <span className="text-xs font-bold text-[#5a6a82]">{brand.name}</span>}</div>;
}

export function ProductCard({ product, onSelectProduct }: { product: any; onSelectProduct: (slug: string) => void }) {
  const imageUrl = publicMediaUrl(product.cover_media);
  return (
    <div className="bg-white rounded-xl overflow-hidden border border-[#0d1b2e]/10 shadow-sm hover:shadow-md transition-shadow group">
      <div className="bg-[#f5f7fa] h-44 overflow-hidden">{imageUrl ? <img src={imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" /> : <div className="w-full h-full flex items-center justify-center text-[#5a6a82]"><Package size={32} /></div>}</div>
      <div className="p-4">
        <span className="text-xs font-bold text-[#0057e7] uppercase tracking-wide">Produto</span>
        <h3 className="font-semibold text-[#0d1b2e] mt-1 mb-3 text-sm leading-snug">{product.name}</h3>
        <div className="flex items-center justify-between">
          <span className="text-lg font-black text-[#0d1b2e]">{product.price != null ? `R$ ${Number(product.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Consulte"}</span>
          <button type="button" onClick={() => onSelectProduct(product.slug)} className="inline-flex items-center justify-center gap-2 font-semibold rounded-md px-3 py-1.5 text-xs border-2 border-[#0057e7] text-[#0057e7] hover:bg-[#0057e7] hover:text-white active:scale-[0.98] transition-all">Ver produto</button>
        </div>
      </div>
    </div>
  );
}

export function ServiceCard({ service, onSelectService }: { service: any; onSelectService: (slug: string) => void }) {
  const imageUrl = publicMediaUrl(service.cover_media);
  const cardPrice = service.price_mode === "HIDDEN" ? null : service.price_mode === "STARTING_FROM" && service.base_price ? `A partir de R$ ${Number(service.base_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : service.price_mode === "FIXED" && service.base_price ? `R$ ${Number(service.base_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Consulte o valor";
  return (
    <div className="bg-white rounded-xl overflow-hidden border border-[#0d1b2e]/10 shadow-sm hover:shadow-md hover:border-[#0057e7]/30 transition-all group">
      <div className="h-40 overflow-hidden bg-[#e8eef8]">{imageUrl ? <img src={imageUrl} alt={service.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" /> : <div className="w-full h-full flex items-center justify-center text-[#5a6a82]"><Package size={32} /></div>}</div>
      <div className="p-4 flex flex-col gap-2">
        <span className="text-xs font-bold text-[#0057e7] uppercase tracking-wide">Serviço</span>
        <h3 className="font-bold text-[#0d1b2e] text-sm leading-snug">{service.title}</h3>
        <p className="text-xs text-[#5a6a82] leading-relaxed flex-1">{service.short_description || service.description}</p>
        <div className="flex items-center justify-between pt-2 border-t border-[#0d1b2e]/8 mt-1">
          {cardPrice && <span className="text-xs font-semibold text-[#5a6a82]">{cardPrice}</span>}
          <button onClick={() => onSelectService(service.slug)} className="flex items-center gap-1 text-xs font-bold text-[#0057e7] hover:gap-2 transition-all">Ver detalhes <ChevronRight size={13} /></button>
        </div>
      </div>
    </div>
  );
}
