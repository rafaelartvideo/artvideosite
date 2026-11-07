import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers3, Plus, Save, Search, Trash2 } from "lucide-react";
import { AdminButton, AdminIconButton } from "@/shared/ui/admin/AdminLayout";
import { FInput } from "@/shared/ui/admin/AdminFormControls";
import { cn, formatCurrency, formatNumber } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { productConditionLabel } from "../domain/product-condition";
import { ProductAdminThumb } from "@/shared/ui/admin/AdminMedia";
import {
  listProductVariations, replaceProductVariations,
  type ProductVariationInput,
} from "../infrastructure/product-variations.repository";

type Candidate = {
  id: string;
  name: string;
  sku?: string | null;
  price?: number | null;
  product_condition?: string | null;
  cover_media_id?: string | null;
  inventory?: { quantity?: number | null; unit?: string | null; conversion_factor?: number | null } | null;
};

export function ProductVariationsEditor({
  organizationId, productId, products, canEdit, onEditProduct,
}: {
  organizationId: string;
  productId?: string | null;
  products: Candidate[];
  canEdit: boolean;
  onEditProduct?: (productId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ProductVariationInput[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: ["products", "variation-family", organizationId, productId],
    queryFn: () => listProductVariations(organizationId, productId!),
    enabled: Boolean(organizationId && productId),
    staleTime: 20_000,
  });
  const rows = query.data || [];
  const parent = rows.find(item => item.is_parent);
  const isChild = Boolean(parent && parent.product_id !== productId);
  const original = useMemo(() => rows.filter(item => !item.is_parent)
    .map(item => ({ product_id: item.product_id, label: item.variation_label })), [rows]);
  const [originalKey, setOriginalKey] = useState("");
  // Trocar entre dois itens sem variações não pode reaproveitar um rascunho anterior.
  useEffect(() => {
    setDraft([]);
    setOriginalKey("");
    setSearch("");
    setError("");
    setMessage("");
  }, [productId]);
  const key = JSON.stringify(original);
  useEffect(() => {
    if (originalKey === key) return;
    setDraft(original);
    setOriginalKey(key);
    setError("");
    setMessage("");
  }, [key, originalKey, original]);

  const chosen = new Set(draft.map(item => item.product_id));
  const candidates = products.filter(product => product.id !== productId
    && !chosen.has(product.id)
    && [product.name, product.sku].some(value =>
      String(value || "").toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"))))
    .slice(0, 10);
  const changed = JSON.stringify(draft) !== JSON.stringify(original);

  const save = async () => {
    if (!productId || !canEdit || saving || isChild) return;
    if (draft.some(item => !item.label.trim() || item.label.trim().length > 100)) {
      setError("Identifique cada variação. Ex.: Cor: Azul, Voltagem: 220 V ou Tamanho: M.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await replaceProductVariations(organizationId, productId, draft.map(item => ({
        product_id: item.product_id, label: item.label.trim(),
      })));
      await queryClient.invalidateQueries({ queryKey: ["products", "variation-family", organizationId] });
      setMessage("Variações atualizadas. Cada item conserva seu estoque, preço e histórico.");
    } catch (cause) {
      setError(systemErrorMessage(cause, "Não foi possível salvar as variações."));
    } finally {
      setSaving(false);
    }
  };

  return <section className="min-w-0 space-y-3" aria-label="Variações do produto">
    <div className="flex items-start gap-2">
      <Layers3 size={18} className="mt-0.5 shrink-0 text-primary"/>
      <div>
        <h3 className="text-sm font-bold text-foreground">Variações do produto</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Agrupe produtos que variam por cor, tamanho, voltagem ou modelo.
          Cada variação é um item independente, com SKU, preço, saldo e movimentações próprios.
        </p>
      </div>
    </div>
    {!productId ? <p className="text-xs text-muted-foreground">
      Salve o novo item antes de vincular suas variações já cadastradas.
    </p> : query.isPending ? <p className="text-xs text-muted-foreground">Carregando variações...</p>
      : query.isError ? <p role="alert" className="text-xs text-destructive">
        {systemErrorMessage(query.error, "Não foi possível carregar as variações.")}
      </p> : isChild ? <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground">
          Este item é uma variação de <strong className="text-foreground">{parent?.name}</strong>.
          As alterações do grupo são feitas no produto principal.
        </p>
        {canEdit && parent && onEditProduct && <AdminButton variant="secondary" size="sm"
          onClick={() => onEditProduct(parent.product_id)}>Editar produto principal</AdminButton>}
      </div> : <>
        <div className="grid gap-2 sm:grid-cols-2">
          {draft.length === 0 && <p className="text-xs text-muted-foreground sm:col-span-2">
            Nenhuma variação vinculada ainda.
          </p>}
          {draft.map((item, index) => {
            const product = products.find(entry => entry.id === item.product_id);
            const qty = Number(product?.inventory?.quantity || 0);
            const factor = Math.max(1, Number(product?.inventory?.conversion_factor || 1));
            const unit = product?.inventory?.unit === "cx" ? "cx" : "un";
            return <div key={item.product_id} className="space-y-2 border-b border-border py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <ProductAdminThumb mediaId={product?.cover_media_id || null} name={product?.name || "Produto"}/>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">{product?.name || "Produto não disponível"}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {product?.sku || "Sem SKU"} · {productConditionLabel(product?.product_condition)} · {product?.price == null ? "Sem preço" : formatCurrency(product.price)}
                    {" · "}{formatNumber(unit === "cx" ? qty / factor : qty)} {unit}
                  </p>
                </div>
                {canEdit && onEditProduct && <AdminButton variant="tertiary" size="sm" disabled={saving}
                  onClick={() => onEditProduct(item.product_id)}>Editar</AdminButton>}
                {canEdit && <AdminIconButton ariaLabel="Remover variação" title="Remover variação"
                  disabled={saving} variant="danger"
                  onClick={() => { setDraft(current => current.filter(entry => entry.product_id !== item.product_id)); setMessage(""); }}>
                  <Trash2 size={15}/>
                </AdminIconButton>}
              </div>
              <FInput label="Identificação da variação" value={item.label} disabled={!canEdit || saving}
                placeholder="Ex.: Cor: Azul ou Voltagem: 220 V"
                onChange={(event: any) => setDraft(current => current.map((entry,j) =>
                  j === index ? { ...entry, label: event.target.value } : entry))}/>
            </div>;
          })}
        </div>
        {canEdit && draft.length < 30 && <div className="relative space-y-2">
          <div className="relative">
            <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
            <input type="search" aria-label="Buscar produto para adicionar como variação"
              className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground"
              placeholder="Buscar outro produto já cadastrado pelo nome ou SKU"
              value={search} onChange={event => setSearch(event.target.value)} disabled={saving}/>
          </div>
          {search.trim().length >= 2 && <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-border bg-card p-1">
            {candidates.length === 0 ? <p className="p-2 text-xs text-muted-foreground">Nenhum item encontrado.</p>
              : candidates.map(product => <button key={product.id} type="button"
                  className={cn("flex w-full items-center gap-2 rounded-md p-2 text-left text-xs text-foreground hover:bg-muted")}
                  onClick={() => { setDraft(current => [...current, { product_id: product.id, label: "" }]); setSearch(""); setMessage(""); }}>
                  <Plus size={15} className="shrink-0 text-primary"/> {product.name} · {product.sku || "Sem SKU"}
                </button>)}
          </div>}
        </div>}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        {message && <p className="text-xs text-emerald-700 dark:text-emerald-300">{message}</p>}
        {canEdit && <div className="flex justify-end">
          <AdminButton size="sm" disabled={saving || !changed} loading={saving} onClick={() => void save()}>
            <Save size={15} /> Salvar variações
          </AdminButton>
        </div>}
      </>}
  </section>;
}
