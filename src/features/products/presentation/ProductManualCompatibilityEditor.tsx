import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Plus, Save, Search, Trash2 } from "lucide-react";
import { AdminButton, AdminIconButton } from "@/shared/ui/admin/AdminLayout";
import { ProductAdminThumb } from "@/shared/ui/admin/AdminMedia";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { formatCurrency, formatNumber } from "@/shared/domain/formatters";
import {
  listProductCompatibilityIds,
  replaceProductCompatibilities,
} from "../infrastructure/products.repository";

export type CompatibilityCandidate = {
  id: string;
  name: string;
  sku?: string | null;
  manufacturer_code?: string | null;
  barcode?: string | null;
  price?: number | null;
  cover_media_id?: string | null;
  is_active?: boolean;
  inventory?: {
    quantity?: number | null;
    unit?: string | null;
    conversion_factor?: number | null;
  } | null;
};

function displayCandidateStock(candidate: CompatibilityCandidate) {
  const unit = candidate.inventory?.unit === "cx" ? "cx" : "un";
  const factor = Math.max(1, Number(candidate.inventory?.conversion_factor || 1));
  const quantity = Number(candidate.inventory?.quantity || 0) / (unit === "cx" ? factor : 1);
  return `${formatNumber(quantity)} ${unit}`;
}

/** Os vínculos manuais complementam a detecção por código, sem substituí-la. */
export function ProductManualCompatibilityEditor({
  organizationId, productId, products, canEdit,
}: {
  organizationId: string;
  productId?: string | null;
  products: CompatibilityCandidate[];
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string[]>([]);
  const [loadedKey, setLoadedKey] = useState("");
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const key = `${organizationId}:${productId || ""}`;

  const manualLinks = useQuery({
    queryKey: ["products", "manual-compatibilities", organizationId, productId],
    queryFn: () => listProductCompatibilityIds(organizationId, productId!),
    enabled: Boolean(organizationId && productId),
    staleTime: 20_000,
  });

  useEffect(() => {
    if (!manualLinks.isSuccess || loadedKey === key) return;
    setDraft(manualLinks.data || []);
    setLoadedKey(key);
    setSearch("");
    setShowSearch(false);
    setError("");
    setMessage("");
  }, [key, loadedKey, manualLinks.isSuccess, manualLinks.data]);

  const current = manualLinks.data || [];
  const ready = Boolean(productId && manualLinks.isSuccess && loadedKey === key);
  const selected = useMemo(() => new Set(draft), [draft]);
  const changed = ready && (
    selected.size !== new Set(current).size || draft.some(id => !current.includes(id))
  );
  const searchText = search.trim().toLocaleLowerCase("pt-BR");
  const candidates = useMemo(() => {
    if (searchText.length < 2) return [];
    return products.filter(item => item.id !== productId && !selected.has(item.id)
      && [item.name, item.sku, item.manufacturer_code, item.barcode]
        .some(value => String(value || "").toLocaleLowerCase("pt-BR").includes(searchText)))
      .slice(0, 12);
  }, [products, productId, selected, searchText]);

  const save = async () => {
    if (!productId || !canEdit || !ready || !changed || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await replaceProductCompatibilities(organizationId, productId, draft);
      await queryClient.invalidateQueries({
        queryKey: ["products", "manual-compatibilities", organizationId, productId],
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["products", "automatic-compatibilities"] }),
        queryClient.invalidateQueries({ queryKey: ["pdv", "compatible-products"] }),
        queryClient.invalidateQueries({ queryKey: ["orders", "auto-compatible"] }),
      ]);
      setMessage("Compatibilidades manuais salvas. As correspondências automáticas continuam funcionando.");
    } catch (cause) {
      setError(systemErrorMessage(cause, "Não foi possível salvar as compatibilidades manuais."));
    } finally {
      setSaving(false);
    }
  };

  return <div className="space-y-3 border-t border-border pt-3" aria-label="Vínculos manuais de produtos compatíveis">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <Link2 size={15} className="shrink-0 text-primary" aria-hidden="true"/>
        <h4 className="text-xs font-bold text-foreground">
          Compatibilidades manuais {ready && draft.length > 0 ? `(${draft.length})` : ""}
        </h4>
      </div>
      {canEdit && ready && draft.length < 60 && <AdminButton
        size="sm" variant="secondary" disabled={saving}
        onClick={() => { setShowSearch(currentValue => !currentValue); setError(""); }}>
        <Plus size={15}/> Adicionar manualmente
      </AdminButton>}
    </div>
    {!productId
      ? <p className="text-xs text-muted-foreground">Salve o novo item primeiro para relacioná-lo manualmente a outros produtos.</p>
      : manualLinks.isPending || !ready
        ? manualLinks.isError
          ? <p role="alert" className="text-xs text-destructive">{systemErrorMessage(manualLinks.error, "Falha ao carregar vínculos manuais.")}</p>
          : <p className="text-xs text-muted-foreground">Carregando vínculos manuais...</p>
        : <>
          {draft.length === 0 && <p className="text-xs text-muted-foreground">
            Nenhum vínculo manual. Os compatíveis encontrados pelos códigos aparecem automaticamente acima.
          </p>}
          {draft.length > 0 && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {draft.map(id => {
              const product = products.find(item => item.id === id);
              return <div key={id}
                className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2">
                {product && <ProductAdminThumb mediaId={product.cover_media_id} name={product.name}/>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {product?.name || "Produto não disponível no catálogo"}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {product?.sku || "Sem SKU"}
                    {product ? ` · ${product.price == null ? "Sem preço" : formatCurrency(product.price)}` : ""}
                  </p>
                </div>
                {canEdit && <AdminIconButton title="Remover vínculo manual"
                  ariaLabel={`Remover vínculo manual com ${product?.name || id}`}
                  variant="danger" disabled={saving}
                  onClick={() => { setDraft(currentDraft => currentDraft.filter(entry => entry !== id)); setMessage(""); }}>
                  <Trash2 size={15}/>
                </AdminIconButton>}
              </div>;
            })}
          </div>}
          {canEdit && showSearch && <div className="space-y-1.5">
            <div className="relative">
              <Search size={15} aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
              <input type="search" aria-label="Buscar produto para adicionar como compatível"
                className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground"
                placeholder="Buscar item por nome, SKU, MPN ou GTIN"
                value={search} disabled={saving || draft.length >= 60}
                onChange={event => setSearch(event.target.value)}/>
            </div>
            {searchText.length >= 2 && <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border bg-card p-1">
              {candidates.length === 0
                ? <p className="p-2 text-xs text-muted-foreground">Nenhum outro produto encontrado.</p>
                : candidates.map(item => <button type="button" key={item.id}
                  className="flex w-full min-w-0 items-center gap-2 rounded-md p-2 text-left hover:bg-muted"
                  disabled={saving || draft.length >= 60}
                  onClick={() => { setDraft(currentDraft => [...currentDraft, item.id]); setSearch(""); setMessage(""); }}>
                  <Plus size={15} className="shrink-0 text-primary"/>
                  <ProductAdminThumb mediaId={item.cover_media_id} name={item.name}/>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-foreground">{item.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {item.sku || "Sem SKU"} · {item.price == null ? "Sem preço" : formatCurrency(item.price)}
                      {" · "}{displayCandidateStock(item)}
                      {item.is_active === false ? " · Inativo" : ""}
                    </span>
                  </span>
                </button>)}
            </div>}
          </div>}
          {draft.length >= 60 && <p className="text-xs text-amber-700 dark:text-amber-300">Limite de 60 vínculos manuais por item.</p>}
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          {message && <p className="text-xs text-emerald-700 dark:text-emerald-300">{message}</p>}
          {canEdit && changed && <div className="flex justify-end">
            <AdminButton size="sm" loading={saving} disabled={saving} onClick={() => void save()}>
              <Save size={15}/> Salvar vínculos manuais
            </AdminButton>
          </div>}
        </>}
  </div>;
}
