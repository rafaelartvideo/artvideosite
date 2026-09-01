import { useProducts } from "@/features/public-catalog/application/usePublicCatalog";
import { ProductCard } from "@/features/public-catalog/presentation/PublicCatalogCards";
import type { PublicPage } from "@/features/public-shell/domain/navigation";
import { SectionLabel } from "@/features/public-shell/presentation/PublicUi";

export function StorePage({ setPage, onSelectProduct }: { setPage: (page: PublicPage) => void; onSelectProduct: (slug: string) => void }) {
  const { products, loading } = useProducts();

  return (
    <>
      <section className="bg-[#0d1b2e] py-14 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <SectionLabel light>Loja Artvideo</SectionLabel>
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            Produtos e eletrônicos para sua casa e seu trabalho
          </h1>
          <p className="text-white/70 text-lg mb-8 max-w-2xl mx-auto">Confira os produtos disponíveis em nossa loja com atendimento técnico e suporte especializado.</p>
        </div>
      </section>

      <section className="py-12 bg-[#f5f7fa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {loading ? (
            <div className="text-center py-20 text-[#5a6a82]">Carregando produtos...</div>
          ) : products.length === 0 ? (
            <div className="text-center py-20 text-[#5a6a82]">Nenhum produto disponível no momento.</div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} onSelectProduct={onSelectProduct} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

