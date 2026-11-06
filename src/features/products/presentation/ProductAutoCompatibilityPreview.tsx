import { useQuery } from "@tanstack/react-query";
import { CircleHelp, Link2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/primitives/popover";
import { CompatibleProductCarousel } from "./CompatibleProductCarousel";
import { ProductManualCompatibilityEditor, type CompatibilityCandidate } from "./ProductManualCompatibilityEditor";
import { listProductCodeCompatibilities } from "../infrastructure/products.repository";

/** Sugestões por código + vínculos manuais; ambas as fontes são reunidas pela RPC. */
export function ProductAutoCompatibilityPreview({
  organizationId, productId, products, canEdit,
}: {
  organizationId: string;
  productId?: string | null;
  products: CompatibilityCandidate[];
  canEdit: boolean;
}) {
  const query = useQuery({
    queryKey: ["products", "automatic-compatibilities", organizationId, productId],
    queryFn: () => listProductCodeCompatibilities(organizationId, productId!),
    enabled: Boolean(organizationId && productId),
    staleTime: 15_000,
  });

  return <section className="min-w-0 space-y-3"
    aria-label="Produtos compatíveis">
    <div className="flex min-w-0 items-center gap-2">
      <Link2 size={17} className="shrink-0 text-primary" aria-hidden="true"/>
      <h3 className="text-sm font-bold text-foreground">Produtos compatíveis</h3>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" aria-label="Como funcionam os produtos compatíveis?"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <CircleHelp size={16} aria-hidden="true"/>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" side="top" sideOffset={6}
          className="z-[350] w-80 max-w-[calc(100vw-2rem)] text-xs leading-relaxed text-popover-foreground">
          Os códigos relacionados são comparados com os códigos dos demais produtos da empresa.
          Quando um item com código correspondente for cadastrado, aparecerá automaticamente como alternativa.
          Você também pode adicionar manualmente produtos compatíveis, mesmo sem códigos iguais.
          As duas formas de compatibilidade funcionam juntas, incluindo no PDV, orçamentos,
          OS e solicitações de peças.
        </PopoverContent>
      </Popover>
    </div>
    {!productId
      ? <p className="text-xs text-muted-foreground">
          Salve o novo item para visualizar as sugestões automáticas e relacionar produtos manualmente.
        </p>
      : query.isPending
        ? <p className="text-xs text-muted-foreground">Verificando produtos compatíveis...</p>
        : query.isError
          ? <p role="alert" className="text-xs text-destructive">Não foi possível consultar compatibilidades.</p>
          : query.data?.length
            ? <CompatibleProductCarousel hideTitle products={query.data.map(item => ({
                id: item.product_id, name: item.name, sku: item.sku, price: item.price,
                coverMediaId: item.cover_media_id, stock: item.stock, unit: item.unit,
              }))}/>
            : <p className="text-xs text-muted-foreground">
                Nenhum produto compatível identificado. Cadastre códigos relacionados ou adicione alternativas manualmente.
              </p>}
    <ProductManualCompatibilityEditor
      organizationId={organizationId}
      productId={productId}
      products={products}
      canEdit={canEdit}
    />
  </section>;
}
