import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, Grid2X2, Heart, List, Minus, Package, Plus,
  Search, ShoppingBag, ShoppingCart, Trash2, X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { formatCurrency, formatNumber } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminDialog, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { EmptyState, LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { SalesProductDetailsDialog } from "./SalesProductDetailsDialog";
import type { PdvProduct } from "@/features/pdv/infrastructure/pdv.repository";
import { searchSalesProducts, listSalesProductRelations } from "../infrastructure/sales.repository";
import { SalesCheckoutDialog } from "./SalesCheckoutDialog";

type CartLine = { product: PdvProduct; quantity: number };
type ProductSort = "name" | "price_low" | "price_high" | "stock";

function availableQuantity(product: PdvProduct) {
  const quantity = Math.max(0, Number(product.quantity) || 0);
  const factor = Math.max(1, Number(product.conversion_factor) || 1);
  return product.unit === "cx" ? Math.floor(quantity / factor) : quantity;
}

function useDebouncedSearch(value: string) {
  const [result, setResult] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setResult(value), 260);
    return () => window.clearTimeout(id);
  }, [value]);
  return result;
}

function readCart(key: string): CartLine[] {
  if (!key || typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(key) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((line): line is CartLine =>
      line && typeof line === "object"
      && typeof line.product?.product_id === "string"
      && typeof line.product?.name === "string"
      && Number.isSafeInteger(line.quantity) && line.quantity > 0 && line.quantity <= 9999,
    ).slice(0, 80);
  } catch {
    return [];
  }
}

function readFavorites(key: string): string[] {
  if (!key || typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").slice(0, 250) : [];
  } catch {
    return [];
  }
}

function SalesProductPhoto({
  mediaId, name, className = "h-full w-full",
}: { mediaId: string | null; name: string; className?: string }) {
  const { url } = useMediaUrl(mediaId);
  return <div className={"flex items-center justify-center overflow-hidden bg-muted/30 " + className}>
    {url
      ? <img src={url} alt={name} loading="lazy" className="h-full max-h-full w-full object-contain p-2.5" />
      : <Package size={33} className="text-muted-foreground/50" aria-label="Produto sem foto" />}
  </div>;
}

/** Vitrine e venda comercial próprias: PDV não participa da conclusão. */
export function TabSales() {
  const { activeOrganizationId, user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const organizationId = activeOrganizationId || "";
  const canView = hasPermission("sales.view");
  const canSell = hasPermission("sales.create");
  const cartStorageKey = organizationId && user?.id ? "union-sales-cart:v1:" + organizationId + ":" + user.id : "";
  const favoritesStorageKey = organizationId && user?.id ? "union-sales-favorites:v1:" + organizationId + ":" + user.id : "";
  const cartRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedSearch(search);
  const [sort, setSort] = useState<ProductSort>("name");
  const [display, setDisplay] = useState<"grid" | "list">("grid");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => readFavorites(favoritesStorageKey));
  const [cart, setCart] = useState<CartLine[]>(() => readCart(cartStorageKey));
  const [selected, setSelected] = useState<PdvProduct | null>(null);
  const [checkoutIntent, setCheckoutIntent] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!cartStorageKey) return;
    try {
      if (cart.length) window.sessionStorage.setItem(cartStorageKey, JSON.stringify(cart));
      else window.sessionStorage.removeItem(cartStorageKey);
    } catch {
      // O bloqueio de armazenamento do navegador não impede uma venda em andamento.
    }
  }, [cartStorageKey, cart]);

  useEffect(() => {
    if (!favoritesStorageKey) return;
    try { window.localStorage.setItem(favoritesStorageKey, JSON.stringify(favorites)); }
    catch { /* favoritos continuam disponíveis nesta sessão */ }
  }, [favoritesStorageKey, favorites]);

  const productsQuery = useQuery({
    queryKey: ["sales", organizationId, "products", debouncedSearch],
    queryFn: () => searchSalesProducts(organizationId, debouncedSearch.trim(), 80),
    enabled: Boolean(organizationId && canView && (!debouncedSearch.trim() || debouncedSearch.trim().length >= 2)),
    staleTime: 20_000,
  });

  const relatedQuery = useQuery({
    queryKey: ["sales", organizationId, "relations", selected?.product_id || ""],
    queryFn: () => listSalesProductRelations(organizationId, [selected!.product_id]),
    enabled: Boolean(organizationId && canView && selected?.product_id),
    staleTime: 30_000,
  });

  const products = useMemo(() => {
    const list = (productsQuery.data || []).filter(product =>
      (!onlyAvailable || availableQuantity(product) > 0)
      && (!onlyFavorites || favorites.includes(product.product_id)),
    );
    return [...list].sort((a, b) => {
      if (sort === "price_low") return Number(a.price ?? Infinity) - Number(b.price ?? Infinity);
      if (sort === "price_high") return Number(b.price ?? -1) - Number(a.price ?? -1);
      if (sort === "stock") return availableQuantity(b) - availableQuantity(a);
      return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
    });
  }, [productsQuery.data, onlyAvailable, onlyFavorites, favorites, sort]);

  const cartQuantity = cart.reduce((total, line) => total + line.quantity, 0);
  const cartTotal = cart.reduce((total, line) => total + Number(line.product.price || 0) * line.quantity, 0);

  const addProduct = (product: PdvProduct, quantity = 1) => {
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return;
    if (!canSell) return;
    if (product.price == null || !Number.isFinite(Number(product.price)) || Number(product.price) <= 0) {
      setToast({ type: "error", msg: "Defina o preço de venda deste produto no Estoque antes de vender." });
      return;
    }
    const max = availableQuantity(product);
    const current = cart.find(line => line.product.product_id === product.product_id)?.quantity || 0;
    if (max < current + quantity) {
      setToast({ type: "error", msg: "Não há mais unidades disponíveis para adicionar ao carrinho." });
      return;
    }
    setCart(previous => {
      const found = previous.find(line => line.product.product_id === product.product_id);
      return found
        ? previous.map(line => line.product.product_id === product.product_id
          ? { ...line, product, quantity: Math.min(max, line.quantity + quantity) } : line)
        : [...previous, { product, quantity }];
    });
    setToast(null);
  };

  const setQuantity = (productId: string, quantity: number) => {
    const existing = cart.find(line => line.product.product_id === productId);
    if (!existing) return;
    if (quantity <= 0) {
      setCart(previous => previous.filter(line => line.product.product_id !== productId));
      return;
    }
    if (!Number.isSafeInteger(quantity) || quantity > availableQuantity(existing.product)) {
      setToast({ type: "error", msg: "Quantidade maior que o estoque disponível." });
      return;
    }
    setCart(previous => previous.map(line => line.product.product_id === productId ? { ...line, quantity } : line));
  };

  const toggleFavorite = (productId: string) => setFavorites(previous =>
    previous.includes(productId) ? previous.filter(id => id !== productId) : [...previous, productId],
  );

  const addExactCode = () => {
    const code = search.trim().toLocaleLowerCase("pt-BR");
    const exact = productsQuery.data?.find(product =>
      product.sku?.toLocaleLowerCase("pt-BR") === code || product.barcode?.toLocaleLowerCase("pt-BR") === code,
    );
    if (exact) addProduct(exact);
  };

  return <div className="min-w-0 space-y-4 pb-20 md:pb-6">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader title="Vendas" subtitle="Escolha produtos na vitrine e conclua a venda no próprio módulo, com acompanhamento no Financeiro." />
    {checkoutIntent && <SalesCheckoutDialog
      key={organizationId + ":" + (user?.id || "")}
      open
      items={cart}
      onClose={() => setCheckoutIntent(false)}
      onCompleted={sale => {
        setCart([]);
        setToast({ msg: "Pedido comercial #" + sale.order_number + " registrado com sucesso.", type: "success" });
        void queryClient.invalidateQueries({ queryKey: ["sales", organizationId] });
        void queryClient.invalidateQueries({ queryKey: ["inventory"] });
        void queryClient.invalidateQueries({ queryKey: ["finance"] });
      }}
    />}

    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,350px)]">
      <section className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-foreground">Vitrine de produtos</h2>
            <p className="text-xs text-muted-foreground">Produtos ativos da empresa · até 80 resultados por pesquisa</p>
          </div>
          <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
            <button type="button" onClick={() => setDisplay("grid")} aria-label="Ver produtos em grade"
              aria-pressed={display === "grid"} className={"rounded-md p-2 " + (display === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground")}>
              <Grid2X2 size={17} />
            </button>
            <button type="button" onClick={() => setDisplay("list")} aria-label="Ver produtos em lista"
              aria-pressed={display === "list"} className={"rounded-md p-2 " + (display === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground")}>
              <List size={17} />
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="relative">
            <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addExactCode(); } }}
              placeholder="Buscar nome, SKU, GTIN ou código relacionado"
              aria-label="Buscar produtos para venda"
              className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-10 text-sm text-foreground outline-none focus:border-primary"
            />
            {search && <button type="button" onClick={() => setSearch("")} aria-label="Limpar busca"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X size={16} /></button>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" aria-pressed={onlyAvailable} onClick={() => setOnlyAvailable(value => !value)}
              className={"rounded-full border px-3 py-1.5 text-xs font-semibold " + (onlyAvailable ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
              Disponíveis
            </button>
            <button type="button" aria-pressed={onlyFavorites} onClick={() => setOnlyFavorites(value => !value)}
              className={"inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold " + (onlyFavorites ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
              <Heart size={13} /> Favoritos
            </button>
            <label className="ml-auto flex items-center gap-2 text-xs font-medium text-muted-foreground">
              Ordenar
              <select value={sort} onChange={event => setSort(event.target.value as ProductSort)}
                className="h-8 max-w-40 rounded-md border border-border bg-background px-2 text-xs text-foreground">
                <option value="name">Nome A–Z</option>
                <option value="price_low">Menor preço</option>
                <option value="price_high">Maior preço</option>
                <option value="stock">Mais estoque</option>
              </select>
            </label>
          </div>
        </div>

        {!canView ? <EmptyState icon={ShoppingBag} title="Sem permissão para visualizar Vendas"
          message="Solicite acesso ao módulo Vendas ao gestor da empresa." />
          : debouncedSearch.trim().length === 1 ? <p className="p-5 text-sm text-muted-foreground">Digite pelo menos dois caracteres para buscar.</p>
          : productsQuery.isPending ? <LoadingState text="Carregando vitrine..." />
          : productsQuery.error ? <div role="alert" className="rounded-xl border border-destructive/30 bg-card p-5 text-sm text-destructive">
            {systemErrorMessage(productsQuery.error, "Não foi possível carregar o catálogo.")}
          </div>
          : products.length === 0 ? <EmptyState icon={Package} title="Nenhum produto encontrado"
              message="Tente outra pesquisa ou altere os filtros. Cadastros são gerenciados no Estoque." />
          : <div className={display === "grid"
              ? "grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4"
              : "space-y-2"}>
              {products.map(product => {
                const available = availableQuantity(product);
                const isFavorite = favorites.includes(product.product_id);
                const canAdd = canSell && available > 0 && product.price != null && Number(product.price) > 0;
                const cartCount = cart.find(line => line.product.product_id === product.product_id)?.quantity || 0;
                return <article key={product.product_id}
                  className={"min-w-0 overflow-hidden rounded-xl border border-border bg-card " + (display === "list" ? "flex items-center gap-2 p-2" : "flex flex-col")}>
                  <button type="button" onClick={() => setSelected(product)} aria-label={"Ver detalhes de " + product.name}
                    className={"relative shrink-0 overflow-hidden rounded-lg " + (display === "list" ? "h-20 w-20" : "aspect-[4/3] w-full")}>
                    <SalesProductPhoto mediaId={product.cover_media_id} name={product.name} />
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col gap-2 p-2.5">
                    <div className="flex min-w-0 items-start gap-1">
                      <button type="button" onClick={() => setSelected(product)}
                        className="min-w-0 flex-1 text-left text-sm font-bold leading-5 text-foreground hover:text-primary line-clamp-2">
                        {product.name}
                      </button>
                      <button type="button" aria-label={isFavorite ? "Remover favorito" : "Favoritar produto"}
                        aria-pressed={isFavorite} onClick={() => toggleFavorite(product.product_id)}
                        className={"shrink-0 rounded-md p-1 " + (isFavorite ? "text-red-500" : "text-muted-foreground")}>
                        <Heart size={17} fill={isFavorite ? "currentColor" : "none"} />
                      </button>
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">{product.sku || product.barcode || "Sem código"}</p>
                    <p className="text-base font-bold text-foreground">{product.price == null ? "Sem preço" : formatCurrency(product.price)}</p>
                    <p className={"text-xs font-medium " + (available > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-destructive")}>
                      {available > 0 ? formatNumber(available) + " disponíveis" : "Sem estoque"}
                    </p>
                    <AdminButton size="sm" disabled={!canAdd || cartCount >= available} className="mt-auto w-full justify-center"
                      onClick={() => addProduct(product)}><Plus size={14} /> Adicionar</AdminButton>
                  </div>
                </article>;
              })}
            </div>}
      </section>

      <aside ref={cartRef} className="min-w-0 rounded-xl border border-border bg-card xl:sticky xl:top-4">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
            <ShoppingCart size={18} /> Carrinho <span className="text-xs font-medium text-muted-foreground">({cartQuantity})</span>
          </h2>
          {cart.length > 0 && <button type="button" onClick={() => setCart([])}
            className="flex items-center gap-1 text-xs font-semibold text-destructive"><Trash2 size={14} /> Limpar</button>}
        </div>
        <div className="max-h-[min(48vh,520px)] space-y-3 overflow-y-auto p-3">
          {cart.length === 0 ? <div className="py-10 text-center">
            <ShoppingBag size={28} className="mx-auto text-muted-foreground/50" />
            <p className="mt-3 text-sm font-semibold text-foreground">Carrinho vazio</p>
            <p className="mt-1 text-xs text-muted-foreground">Adicione produtos pela vitrine.</p>
          </div> : cart.map(line => <div key={line.product.product_id} className="rounded-lg border border-border p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-semibold text-foreground">{line.product.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatCurrency(line.product.price || 0)} / {line.product.unit || "un"}</p>
              </div>
              <button type="button" onClick={() => setQuantity(line.product.product_id, 0)}
                aria-label={"Remover " + line.product.name} className="text-destructive"><Trash2 size={15} /></button>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex h-8 items-center rounded-md border border-border">
                <button type="button" aria-label={"Diminuir " + line.product.name}
                  onClick={() => setQuantity(line.product.product_id, line.quantity - 1)}
                  className="flex h-full w-8 items-center justify-center"><Minus size={14} /></button>
                <span className="w-8 text-center text-xs font-bold tabular-nums">{line.quantity}</span>
                <button type="button" aria-label={"Aumentar " + line.product.name}
                  onClick={() => setQuantity(line.product.product_id, line.quantity + 1)}
                  className="flex h-full w-8 items-center justify-center"><Plus size={14} /></button>
              </div>
              <span className="text-sm font-bold tabular-nums text-foreground">{formatCurrency((line.product.price || 0) * line.quantity)}</span>
            </div>
          </div>)}
        </div>
        <div className="space-y-3 border-t border-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted-foreground">Total estimado</span>
            <strong className="text-xl tabular-nums text-foreground">{formatCurrency(cartTotal)}</strong>
          </div>
          <AdminButton className="w-full justify-center" disabled={!canSell || cart.length === 0}
            onClick={() => setCheckoutIntent(true)}><CheckCircle2 size={16} /> Finalizar venda</AdminButton>
          <p className="text-[11px] leading-4 text-muted-foreground">
            A venda é confirmada no próprio módulo Vendas. O carrinho fica salvo neste navegador para esta conta e empresa.
          </p>
        </div>
      </aside>
    </div>

    {cartQuantity > 0 && <button type="button" onClick={() => cartRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
      className="fixed inset-x-4 bottom-4 z-30 flex h-12 items-center justify-between rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-lg xl:hidden"
      aria-label="Abrir carrinho de vendas">
      <span className="flex items-center gap-2"><ShoppingCart size={17} /> {cartQuantity} {cartQuantity === 1 ? "item" : "itens"}</span>
      <span>{formatCurrency(cartTotal)}</span>
    </button>}

    {selected && <SalesProductDetailsDialog
      key={selected.product_id}
      organizationId={organizationId}
      product={selected}
      cartQuantity={cart.find(line => line.product.product_id === selected.product_id)?.quantity || 0}
      canSell={canSell}
      onAdd={addProduct}
      onClose={() => setSelected(null)}
      relatedProducts={relatedQuery.data || []}
      relatedLoading={relatedQuery.isPending}
      relatedError={relatedQuery.isError}
    />}
  </div>;
}
