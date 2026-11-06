import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2, ArrowLeftRight } from "lucide-react";
import { AdminButton, AdminIconButton } from "@/shared/ui/admin/AdminLayout";
import { ProductAdminThumb } from "@/shared/ui/admin/AdminMedia";
import { formatCurrency, formatNumber } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { listProductSimilarIds, replaceProductSimilarIds } from "../infrastructure/products.repository";
import type { CompatibilityCandidate } from "./ProductManualCompatibilityEditor";

export function ProductSimilarProductsEditor({
  organizationId, productId, products, canEdit,
}: {
  organizationId: string;
  productId?: string | null;
  products: CompatibilityCandidate[];
  canEdit: boolean;
}) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["products", "similar-products", organizationId, productId],
    queryFn: () => listProductSimilarIds(organizationId, productId!),
    enabled: Boolean(organizationId && productId),
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [loaded, setLoaded] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const key = organizationId + ":" + (productId || "");
  useEffect(() => {
    if (!query.isSuccess) return;
    setSelected(query.data);
    setLoaded(key);
    setSearch("");
    setError("");
    setSuccess("");
  }, [key, query.data, query.isSuccess]);
  const ready = query.isSuccess && loaded === key;
  const changed = ready && (selected.length !== query.data.length || selected.some(id => !query.data.includes(id)));
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const available = useMemo(() => term.length < 2 ? [] : products.filter(p =>
    p.id !== productId && !selected.includes(p.id) &&
    [p.name, p.sku, p.manufacturer_code, p.barcode].some(v =>
      String(v || "").toLocaleLowerCase("pt-BR").includes(term))
  ).slice(0,12), [products, selected, productId, term]);

  const save = async () => {
    if (!productId || saving || !changed) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      await replaceProductSimilarIds(organizationId, productId, selected);
      await client.invalidateQueries({ queryKey: ["products", "similar-products", organizationId] });
      setSuccess("Produtos similares atualizados.");
    } catch (cause) {
      setError(systemErrorMessage(cause, "Não foi possível salvar os produtos similares."));
    } finally {
      setSaving(false);
    }
  };
  return <section className="min-w-0 space-y-3" aria-label="Produtos similares">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><ArrowLeftRight size={16} className="text-primary"/>Produtos similares</h3>
        <p className="text-xs text-muted-foreground">Alternativas comerciais de mesma finalidade, como controles originais e genéricos. Confirme a substituição antes de vincular.</p>
      </div>
      {ready && <span className="text-xs text-muted-foreground">{selected.length} {selected.length === 1 ? "similar" : "similares"}</span>}
    </div>
    {!productId ? <p className="text-xs text-muted-foreground">Salve o item para relacionar alternativas já cadastradas.</p>
      : query.isError ? <p role="alert" className="text-sm text-destructive">{systemErrorMessage(query.error)}</p>
      : !ready ? <p className="text-xs text-muted-foreground">Carregando similares...</p> : <>
        {selected.length > 0 ? <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {selected.map(id => {
            const item = products.find(p => p.id === id);
            const unit = item?.inventory?.unit === "cx" ? "cx" : "un";
            const factor = unit === "cx" ? Math.max(1,Number(item?.inventory?.conversion_factor || 1)) : 1;
            const quantity = Number(item?.inventory?.quantity || 0)/factor;
            return <div key={id} className="flex min-w-0 items-center gap-3 px-3 py-2.5">
              {item && <ProductAdminThumb mediaId={item.cover_media_id} name={item.name}/>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{item?.name || "Produto indisponível"}</p>
                <p className="truncate text-xs text-muted-foreground">{item?.sku || "Sem SKU"} · {item?.price == null ? "Sem preço" : formatCurrency(item.price)} · {formatNumber(quantity)} {unit}</p>
              </div>
              {canEdit && <AdminIconButton ariaLabel="Remover similar" title="Remover similar" variant="danger" disabled={saving}
                onClick={() => setSelected(prev => prev.filter(x => x!==id))}><Trash2 size={15}/></AdminIconButton>}
            </div>;
          })}
        </div> : <p className="text-xs text-muted-foreground">Nenhum similar vinculado.</p>}
        {canEdit && selected.length < 60 && <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-3 text-muted-foreground"/>
          <input type="search" value={search} onChange={e=>setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground"
            placeholder="Adicionar similar por nome, SKU, MPN ou GTIN" aria-label="Buscar produto similar"/>
          {term.length>=2 && <div className="mt-1 max-h-48 divide-y divide-border overflow-auto rounded-lg border border-border">
            {available.length ? available.map(p => <button type="button" key={p.id}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={()=>{setSelected(v=>[...v,p.id]);setSearch("");}}>
              <Plus size={15} className="text-primary"/><span className="min-w-0 flex-1 truncate">{p.name}</span><span className="text-xs text-muted-foreground">{p.sku || "Sem SKU"}</span>
            </button>) : <p className="p-3 text-xs text-muted-foreground">Nenhum produto encontrado.</p>}
          </div>}
        </div>}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        {success && <p className="text-xs text-emerald-600">{success}</p>}
        {canEdit && changed && <div className="flex justify-end"><AdminButton loading={saving} disabled={saving} size="sm" onClick={()=>void save()}>Salvar similares</AdminButton></div>}
      </>}
  </section>;
}
