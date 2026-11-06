import { useQuery } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import { CompatibleProductCarousel } from "./CompatibleProductCarousel";
import { listProductCodeCompatibilities } from "../infrastructure/products.repository";

/** A correspondência é calculada ao consultar: produtos cadastrados depois entram automaticamente. */
export function ProductAutoCompatibilityPreview({
  organizationId,productId,
}: {
  organizationId: string;
  productId?: string | null;
}) {
  const query = useQuery({
    queryKey: ["products", "automatic-compatibilities",organizationId,productId],
    queryFn: () => listProductCodeCompatibilities(organizationId,productId!),
    enabled: Boolean(organizationId && productId),
    staleTime: 15_000,
  });
  return <section className="space-y-2.5 rounded-xl border border-border bg-muted/10 p-3 sm:p-4">
    <div className="flex items-start gap-2">
      <Link2 size={17} className="mt-0.5 shrink-0 text-primary" aria-hidden="true"/>
      <div>
        <h3 className="text-sm font-bold text-foreground">Produtos compatíveis automaticamente</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Os códigos relacionados são comparados com os códigos dos demais produtos da empresa.
          Quando um item com código correspondente for cadastrado, aparecerá automaticamente como alternativa.
          Não é necessário vincular manualmente.
        </p>
      </div>
    </div>
    {!productId
      ? <p className="text-xs text-muted-foreground">Salve o novo item para consultar as compatibilidades identificadas.</p>
      : query.isPending
        ? <p className="text-xs text-muted-foreground">Verificando códigos relacionados...</p>
        : query.isError
          ? <p role="alert" className="text-xs text-destructive">Não foi possível consultar compatibilidades.</p>
          : query.data?.length
            ? <CompatibleProductCarousel products={query.data.map(item => ({
                id: item.product_id,name: item.name,sku: item.sku,price: item.price,
                coverMediaId: item.cover_media_id,stock: item.stock,unit: item.unit,
              }))}/>
            : <p className="text-xs text-muted-foreground">
                Nenhum outro produto compatível identificado até agora. Novos cadastros com códigos correspondentes serão reconhecidos automaticamente.
              </p>}
  </section>;
}
