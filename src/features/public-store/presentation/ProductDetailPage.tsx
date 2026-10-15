import { AlertCircle, ArrowRight, ChevronRight, Clock3, FileText, Package, ShieldCheck } from "lucide-react";
import { useProductDetailBySlug } from "@/features/public-catalog/application/usePublicCatalog";
import { publicMediaUrl } from "@/features/public-catalog/infrastructure/public-media";
import type { PublicPage } from "@/features/public-shell/domain/navigation";
import { WhatsAppAction } from "@/features/public-shell/presentation/PublicShell";
import { PublicButton, PublicHeading } from "@/features/public-shell/presentation/PublicUi";
import { formatCurrency } from "@/shared/domain/formatters";

export function ProductDetailPage({ slug, setPage }: { slug: string | null; setPage: (page: PublicPage) => void }) {
  const { detail, loading, error } = useProductDetailBySlug(slug);
  const imageUrl = publicMediaUrl(detail?.media);

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center gap-2 text-sm text-[#5d6c83]"><Clock3 size={19} className="animate-spin text-[var(--art-primary)]"/> Carregando produto...</div>;
  if (error || !detail) return <section className="min-h-[55vh] bg-[#f8fbff] py-20"><div className="mx-auto max-w-lg px-4 text-center">
    {error ? <AlertCircle size={36} className="mx-auto mb-4 text-red-500"/> : <Package size={36} className="mx-auto mb-4 text-[var(--art-primary)]"/>}
    <PublicHeading>{error ? "Não foi possível carregar este produto" : "Produto não encontrado"}</PublicHeading>
    <p className="mt-3 mb-6 text-[14px] text-[#5d6c83]">{error || "O produto solicitado não está disponível no momento."}</p>
    <PublicButton onClick={() => setPage("loja")}>Ver produtos disponíveis</PublicButton>
  </div></section>;

  const { product, brand } = detail;
  const priceLabel = product.price != null ? formatCurrency(product.price) : "Consulte o valor";
  const hasComparePrice = product.price != null && product.compare_at_price != null &&
    Number(product.compare_at_price) > Number(product.price);

  return <div className="bg-white">
    <nav aria-label="Localização na navegação" className="border-b border-[#e8edf4] bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-hidden px-4 py-3 text-[12px] text-[#68768c] sm:px-6 lg:px-8">
        <button type="button" onClick={() => setPage("home")} className="shrink-0 transition-colors hover:text-[var(--art-primary)]">Início</button>
        <ChevronRight size={14} className="shrink-0"/>
        <button type="button" onClick={() => setPage("loja")} className="shrink-0 transition-colors hover:text-[var(--art-primary)]">Loja</button>
        <ChevronRight size={14} className="shrink-0"/>
        <span className="truncate font-semibold text-[#173252]">{product.name}</span>
      </div>
    </nav>

    <section className="bg-[#f8fbff] py-10 sm:py-14">
      <div className="mx-auto grid max-w-7xl items-start gap-7 px-4 sm:px-6 lg:grid-cols-2 lg:gap-12 lg:px-8">
        <div className="flex aspect-[5/4] min-h-[280px] items-center justify-center overflow-hidden rounded-[9px] border border-[#e3eaf4] bg-white p-5 shadow-sm sm:p-9">
          {imageUrl ? <img src={imageUrl} alt={product.name} className="h-full max-h-[450px] w-full object-contain"/> :
            <div className="flex h-full w-full items-center justify-center rounded-md bg-gradient-to-br from-white via-[#f1f7ff] to-[#dbeaff]"><Package size={84} strokeWidth={1.25} className="text-[#a6c0e4]"/></div>}
        </div>
        <div className="py-2">
          <p className="mb-3 inline-flex items-center gap-2 text-[12px] font-bold text-[var(--art-primary)]"><Package size={17}/> Produto Artvideo</p>
          <h1 className="text-[31px] font-extrabold leading-[1.2] tracking-[-.035em] text-[#0b1d37] sm:text-[42px]" style={{ fontFamily: "'Poppins', 'Inter', sans-serif" }}>{product.name}</h1>
          {brand?.name && <p className="mt-3 text-[13px] font-medium text-[#66768d]">Marca: <span className="font-bold text-[#203e62]">{brand.name}</span></p>}
          <div className="mt-6 border-y border-[#e0e9f4] py-5">
            {hasComparePrice && <p className="text-[13px] text-[#8290a3] line-through">{formatCurrency(product.compare_at_price)}</p>}
            <p className="text-[29px] font-extrabold tracking-[-.035em] text-[var(--art-primary)]">{priceLabel}</p>
            {product.short_description && <p className="mt-3 whitespace-pre-line text-[14px] leading-[1.7] text-[#5d6d83]">{product.short_description}</p>}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <PublicButton onClick={() => setPage("orcamento")} className="gap-2"><FileText size={17}/> Solicitar orçamento <ArrowRight size={16}/></PublicButton>
            <WhatsAppAction className="!min-h-11"/>
          </div>
          <p className="mt-5 flex items-start gap-2 text-[12px] leading-5 text-[#6a7990]"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-[var(--art-primary)]"/> Confirme disponibilidade e condições com nossa equipe.</p>
        </div>
      </div>
    </section>

    {(product.description || product.sku) && <section className="bg-white py-11 sm:py-14">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <PublicHeading>Informações do produto</PublicHeading>
        <div className="mt-5 rounded-[8px] border border-[#e6edf6] bg-white p-5 sm:p-7">
          {product.sku && <p className="mb-4 text-[13px] text-[#64748b]"><span className="font-bold text-[#0b1d37]">Código:</span> {product.sku}</p>}
          {product.description && <p className="whitespace-pre-line text-[14px] leading-[1.85] text-[#53637a]">{product.description}</p>}
        </div>
      </div>
    </section>}

    <section className="bg-[var(--art-primary)] text-white">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center lg:px-8">
        <div>
          <h2 className="text-[23px] font-extrabold tracking-[-.03em]">Quer saber mais sobre este produto?</h2>
          <p className="mt-1 text-[13px] text-white/85">Fale com a Artvideo para esclarecer suas dúvidas.</p>
        </div>
        <PublicButton onClick={() => setPage("contato")} className="gap-2 !bg-white !text-[var(--art-primary)] hover:!bg-blue-50">Falar com a equipe <ArrowRight size={16}/></PublicButton>
      </div>
    </section>
  </div>;
}
