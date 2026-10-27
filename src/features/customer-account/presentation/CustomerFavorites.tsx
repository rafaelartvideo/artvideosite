import { useNavigate } from "react-router";
import { Heart, Package } from "lucide-react";
import { useProducts } from "@/features/public-catalog/application/usePublicCatalog";
import { ProductCard } from "@/features/public-catalog/presentation/PublicCatalogCards";
import { useSiteFavorites } from "./SiteProductFavoriteButton";

export function CustomerFavorites() {
  const navigate = useNavigate();
  const { products, loading } = useProducts();
  const { favoriteIds, loading: loadingFavorites } = useSiteFavorites();
  const favorites = products.filter(product => favoriteIds.includes(product.id));
  return <section className="space-y-5">
    {(loading || loadingFavorites) ? <div role="status" className="flex min-h-40 items-center justify-center text-sm text-[#73849a]">Carregando favoritos...</div> :
      favorites.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {favorites.map(product => <ProductCard key={product.id} product={product} onSelectProduct={slug=>navigate("/loja/"+encodeURIComponent(slug))}/>)}
      </div> : <div className="rounded-xl border border-[#e1e9f2] bg-white px-5 py-12 text-center">
        <Heart size={29} className="mx-auto text-[#a1b1c7]"/>
        <p className="mt-3 text-sm font-semibold text-[#263c57]">Você ainda não adicionou favoritos.</p>
        <p className="mt-1 text-xs text-[#768ba3]">Toque no coração dos produtos que você gostou.</p>
        <button type="button" onClick={() => navigate("/loja")} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--art-primary)] px-4 text-xs font-semibold text-white"><Package size={16}/> Explorar produtos</button>
      </div>}
  </section>;
}
