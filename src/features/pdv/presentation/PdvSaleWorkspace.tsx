import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Barcode, Minus, Package, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { cn, formatCurrency, formatNumber } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminCard, AdminIconButton, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { AdminSearchPanel } from "@/shared/ui/admin/AdminSearchPanel";
import { EmptyState, LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { ProductAdminThumb } from "@/shared/ui/admin/AdminMedia";
import { searchPdvProducts, type PdvBootstrap, type PdvProduct } from "../infrastructure/pdv.repository";

type CartItem = {
  product: PdvProduct;
  quantity: number;
};

function useDebouncedValue(value: string, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}

function availableQuantity(product: PdvProduct) {
  const quantity = Number(product.quantity || 0);
  const factor = Math.max(1, Number(product.conversion_factor || 1));
  if (product.unit === "cx") return Math.floor(quantity / factor);
  return quantity;
}

export function PdvSaleWorkspace({
  bootstrap,
  onBack,
}: {
  bootstrap: PdvBootstrap;
  onBack: () => void;
}) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const organizationId = activeOrganizationId || "";
  const canSell = hasPermission("pdv.sales.create");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const productsQuery = useQuery({
    queryKey: queryKeys.pdv.products(organizationId || "none", debouncedSearch),
    queryFn: () => searchPdvProducts(organizationId, debouncedSearch, 30),
    enabled: Boolean(organizationId && canSell),
  });

  const products = productsQuery.data || [];
  const settings = bootstrap.settings;
  const allowNegativeStock = settings?.allow_negative_stock === true;

  useEffect(() => {
    if (!productsQuery.error) return;
    setToast({ msg: systemErrorMessage(productsQuery.error, "Não foi possível buscar produtos."), type: "error" });
  }, [productsQuery.error]);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.product.price || 0) * item.quantity, 0),
    [cart],
  );

  const addProduct = (product: PdvProduct) => {
    if (product.price == null) {
      setToast({ msg: "Este produto não possui preço de venda definido.", type: "error" });
      return;
    }

    const available = availableQuantity(product);
    const current = cart.find(item => item.product.product_id === product.product_id)?.quantity || 0;
    const nextQuantity = current + 1;
    if (!allowNegativeStock && nextQuantity > available) {
      setToast({ msg: "Estoque insuficiente para adicionar mais unidades deste produto.", type: "error" });
      return;
    }

    setCart(currentCart => {
      const existing = currentCart.find(item => item.product.product_id === product.product_id);
      if (existing) {
        return currentCart.map(item =>
          item.product.product_id === product.product_id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [...currentCart, { product, quantity: 1 }];
    });
  };

  const setQuantity = (productId: string, nextQuantity: number) => {
    if (nextQuantity <= 0) {
      setCart(current => current.filter(item => item.product.product_id !== productId));
      return;
    }

    const item = cart.find(entry => entry.product.product_id === productId);
    if (!item) return;
    if (!allowNegativeStock && nextQuantity > availableQuantity(item.product)) {
      setToast({ msg: "A quantidade informada ultrapassa o estoque disponível.", type: "error" });
      return;
    }

    setCart(current => current.map(entry =>
      entry.product.product_id === productId ? { ...entry, quantity: nextQuantity } : entry,
    ));
  };

  const handleSearchEnter = () => {
    const normalized = search.trim();
    if (!normalized) return;

    const exactBarcode = products.find(product => product.barcode === normalized);
    if (exactBarcode) {
      addProduct(exactBarcode);
      setSearch("");
      return;
    }

    const exactSku = products.find(product => product.sku?.toLocaleLowerCase("pt-BR") === normalized.toLocaleLowerCase("pt-BR"));
    if (exactSku) {
      addProduct(exactSku);
      setSearch("");
      return;
    }

    if (products.length === 1) {
      addProduct(products[0]);
      setSearch("");
    }
  };

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    <PageHeader
      title="Nova venda"
      subtitle="Busque pelo nome, SKU ou leia o código de barras para montar o carrinho."
      actions={<AdminButton variant="secondary" onClick={onBack}><ArrowLeft size={15} /> Voltar ao PDV</AdminButton>}
    />

    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(330px,0.7fr)]">
      <div className="min-w-0 space-y-4">
        <AdminSearchPanel title="Buscar produtos">
          <div className="relative">
            <Barcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
            <input
              autoFocus
              value={search}
              onChange={event => setSearch(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSearchEnter();
                }
              }}
              placeholder="Nome, SKU ou código de barras"
              className={cn(INPUT, "h-[46px] w-full pl-10 text-sm")}
            />
          </div>
          <p className="mt-2 text-[10px] leading-4 text-[#5a6a82]">Leitores USB/Bluetooth que digitam o código e enviam Enter funcionam diretamente neste campo.</p>
        </AdminSearchPanel>

        <AdminCard className="overflow-hidden">
          {productsQuery.isPending ? <LoadingState text="Buscando produtos..." /> : products.length === 0 ? (
            <EmptyState
              icon={Search}
              title={search ? "Nenhum produto encontrado" : "Nenhum produto disponível"}
              message={search ? "Tente outro nome, SKU ou código de barras." : "Cadastre e ative produtos antes de iniciar uma venda."}
            />
          ) : <div className="divide-y divide-[#0d1b2e]/8">
            {products.map(product => {
              const available = availableQuantity(product);
              const noStock = available <= 0;
              return <button
                key={product.product_id}
                type="button"
                onClick={() => addProduct(product)}
                className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-primary-soft/45 sm:p-4"
              >
                <ProductAdminThumb mediaId={product.cover_media_id} name={product.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-[#0d1b2e]">{product.name}</p>
                  <p className="mt-1 truncate text-[10px] font-semibold text-[#7a8aa0]">{product.sku || "Sem SKU"}{product.barcode ? " · " + product.barcode : ""}</p>
                  <p className={cn("mt-1 text-[10px] font-bold", noStock ? "text-red-600" : "text-[#5a6a82]")}>
                    Estoque: {formatNumber(available)} {product.unit || "un"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-black text-[#0d1b2e]">{product.price == null ? "Sem preço" : formatCurrency(product.price)}</p>
                  <span className="mt-2 inline-flex h-7 items-center rounded-lg bg-primary px-2.5 text-[10px] font-black text-white"><Plus size={12} className="mr-1" /> Adicionar</span>
                </div>
              </button>;
            })}
          </div>}
        </AdminCard>
      </div>

      <AdminCard className="h-fit overflow-hidden xl:sticky xl:top-0">
        <div className="border-b border-[#0d1b2e]/8 px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-black text-[#0d1b2e]"><ShoppingCart size={17} /> Carrinho</h2>
              <p className="mt-1 text-xs text-[#5a6a82]">{cart.length} produto{cart.length === 1 ? "" : "s"} diferente{cart.length === 1 ? "" : "s"}</p>
            </div>
            {cart.length > 0 && <AdminIconButton ariaLabel="Limpar carrinho" title="Limpar carrinho" variant="danger" onClick={() => setCart([])}><Trash2 size={15} /></AdminIconButton>}
          </div>
        </div>

        {cart.length === 0 ? <div className="p-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary"><Package size={20} /></div>
          <p className="mt-3 text-sm font-black text-[#0d1b2e]">Carrinho vazio</p>
          <p className="mt-1 text-xs leading-5 text-[#5a6a82]">Adicione produtos pela busca ou pelo leitor de código de barras.</p>
        </div> : <div className="divide-y divide-[#0d1b2e]/8">
          {cart.map(item => <div key={item.product.product_id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[#0d1b2e]">{item.product.name}</p>
                <p className="mt-1 text-[10px] text-[#7a8aa0]">{formatCurrency(item.product.price || 0)} / {item.product.unit || "un"}</p>
              </div>
              <AdminIconButton ariaLabel="Remover produto" title="Remover" variant="danger" onClick={() => setQuantity(item.product.product_id, 0)}><Trash2 size={14} /></AdminIconButton>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex items-center overflow-hidden rounded-lg border border-[#0d1b2e]/12">
                <button type="button" onClick={() => setQuantity(item.product.product_id, item.quantity - 1)} className="flex h-8 w-8 items-center justify-center text-[#5a6a82] hover:bg-[#f5f7fa]"><Minus size={13} /></button>
                <span className="min-w-10 border-x border-[#0d1b2e]/10 px-2 text-center text-xs font-black text-[#0d1b2e]">{item.quantity}</span>
                <button type="button" onClick={() => setQuantity(item.product.product_id, item.quantity + 1)} className="flex h-8 w-8 items-center justify-center text-primary hover:bg-primary-soft"><Plus size={13} /></button>
              </div>
              <p className="text-sm font-black text-[#0d1b2e]">{formatCurrency(Number(item.product.price || 0) * item.quantity)}</p>
            </div>
          </div>)}
        </div>}

        <div className="border-t border-[#0d1b2e]/8 bg-[#f8fafc] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold text-[#5a6a82]">Subtotal</span>
            <span className="text-xl font-black text-[#0d1b2e]">{formatCurrency(subtotal)}</span>
          </div>
          <div className="mt-4 rounded-xl border border-primary/15 bg-white p-3">
            <p className="text-xs font-black text-[#0d1b2e]">Próxima etapa: pagamento</p>
            <p className="mt-1 text-[10px] leading-4 text-[#5a6a82]">Vamos ligar cliente, desconto, múltiplas formas de pagamento, baixa de estoque e lançamento financeiro numa única finalização para não deixar venda pela metade.</p>
          </div>
        </div>
      </AdminCard>
    </div>
  </div>;
}
