import { AlertCircle, ChevronRight, Clock, Package } from "lucide-react";
import { useProductDetailBySlug } from "@/lib/hooks";
import { publicMediaUrl } from "@/features/public-catalog/infrastructure/public-media";
import type { PublicPage } from "@/features/public-shell/domain/navigation";
import { WhatsAppAction } from "@/features/public-shell/presentation/PublicShell";
import { PublicButton as Btn, PublicHeading as H2, SectionLabel } from "@/features/public-shell/presentation/PublicUi";

export function ProductDetailPage({ slug, setPage }: { slug: string | null; setPage: (page: PublicPage) => void }) {
  const { detail, loading, error } = useProductDetailBySlug(slug);
  const imageUrl = publicMediaUrl(detail?.media);

  if (loading) return <div className="min-h-[55vh] flex items-center justify-center text-[#5a6a82] text-sm"><Clock size={20} className="animate-spin mr-2 text-[#0057e7]" /> Carregando produto...</div>;
  if (error) return <section className="py-20 bg-[#f5f7fa]"><div className="max-w-xl mx-auto px-4 text-center"><AlertCircle size={34} className="mx-auto mb-4 text-red-500" /><H2 className="mb-3">Não foi possível carregar este produto</H2><p className="text-sm text-[#5a6a82] mb-6">{error}</p><Btn onClick={() => setPage("loja")}>Voltar para a loja</Btn></div></section>;
  if (!detail) return <section className="py-20 bg-[#f5f7fa]"><div className="max-w-xl mx-auto px-4 text-center"><Package size={34} className="mx-auto mb-4 text-[#0057e7]" /><H2 className="mb-3">Produto não encontrado</H2><p className="text-sm text-[#5a6a82] mb-6">O produto solicitado não existe ou não está disponível no momento.</p><Btn onClick={() => setPage("loja")}>Ver produtos disponíveis</Btn></div></section>;

  const { product, brand } = detail;
  const priceLabel = product.price != null ? `R$ ${Number(product.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Consulte o valor";

  return (
    <>
      <div className="bg-white border-b border-[#0d1b2e]/10"><div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-2 text-xs text-[#5a6a82]"><button onClick={() => setPage("home")} className="hover:text-[#0057e7]">Início</button><ChevronRight size={12} /><button onClick={() => setPage("loja")} className="hover:text-[#0057e7]">Loja</button><ChevronRight size={12} /><span className="font-medium text-[#0d1b2e] truncate">{product.name}</span></div></div>
      <section className="bg-[#f5f7fa] py-12 sm:py-16"><div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-10 items-start"><div className="rounded-2xl overflow-hidden border border-[#0d1b2e]/10 bg-white p-3"><div className="bg-[#f5f7fa] rounded-xl overflow-hidden h-[420px]">{imageUrl ? <img src={imageUrl} alt={product.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[#5a6a82]"><Package size={40} /></div>}</div></div><div><SectionLabel>Produto</SectionLabel><h1 className="text-4xl sm:text-5xl font-black text-[#0d1b2e] leading-tight mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{product.name}</h1>{brand?.name && <p className="text-sm text-[#5a6a82] mb-3">Marca: {brand.name}</p>}<p className="text-3xl font-black text-[#0057e7] mb-6">{priceLabel}</p>{product.short_description && <p className="text-[#5a6a82] leading-relaxed mb-6">{product.short_description}</p>}<div className="flex flex-wrap gap-3"><Btn variant="primary" className="px-6 py-3 text-base" onClick={() => setPage("orcamento")}>Solicitar orçamento</Btn><WhatsAppAction className="px-6 py-3 text-base" /></div></div></div></section>
      {(product.description || product.sku) && <section className="py-14 bg-white"><div className="max-w-5xl mx-auto px-4 sm:px-6"><SectionLabel>Detalhes</SectionLabel><H2 className="mb-5">Informações do produto</H2>{product.sku && <p className="text-sm text-[#5a6a82] mb-4"><span className="font-bold text-[#0d1b2e]">SKU:</span> {product.sku}</p>}{product.description && <p className="text-sm text-[#5a6a82] leading-relaxed whitespace-pre-line">{product.description}</p>}</div></section>}
      <section className="py-20 bg-[#0057e7]"><div className="max-w-3xl mx-auto px-4 text-center"><h2 className="text-3xl sm:text-5xl font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Quer saber mais sobre este produto?</h2><div className="flex flex-wrap justify-center gap-4"><Btn className="bg-white text-[#0057e7] hover:bg-[#f0f6ff]" onClick={() => setPage("orcamento")}>Solicitar orçamento</Btn><WhatsAppAction /></div></div></section>
    </>
  );
}

