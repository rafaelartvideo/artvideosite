import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Barcode,
  CheckCircle2,
  CreditCard,
  Keyboard,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Tag,
  Trash2,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { cn, formatCurrency, formatNumber } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  AdminButton,
  AdminDialog,
  AdminIconButton,
  PageHeader,
  Section,
} from "@/shared/ui/admin/AdminLayout";
import { AdminSearchPanel } from "@/shared/ui/admin/AdminSearchPanel";
import { EmptyState, LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FCurrencyInput, FTextarea, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { ProductAdminThumb } from "@/shared/ui/admin/AdminMedia";
import {
  finalizePdvSale,
  searchPdvCustomers,
  searchPdvProducts,
  type PdvBootstrap,
  type PdvCustomer,
  type PdvPaymentMethod,
  type PdvProduct,
  type PdvSaleResult,
} from "../infrastructure/pdv.repository";

type CartItem = {
  product: PdvProduct;
  quantity: number;
  discount: string;
};

type CheckoutPayment = {
  paymentMethodId: string;
  amount: string;
  tenderedAmount: string;
};

function useDebouncedValue(value: string, delay = 320) {
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

function paymentTypeLabel(type: string) {
  if (type === "cash") return "Dinheiro";
  if (type === "pix") return "PIX";
  if (type === "debit_card") return "Débito";
  if (type === "credit_card") return "Crédito";
  if (type === "boleto") return "Boleto";
  if (type === "transfer") return "Transferência";
  return "Outro";
}

function paymentPriority(type: string) {
  if (type === "cash") return 0;
  if (type === "pix") return 1;
  if (type === "debit_card") return 2;
  if (type === "credit_card") return 3;
  if (type === "transfer") return 4;
  if (type === "boleto") return 5;
  return 6;
}

function currencyNumber(value: string | number | null | undefined) {
  let normalized = String(value ?? "").trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (normalized.includes(",")) normalized = normalized.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isEditableTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  return Boolean(element.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"));
}

function quickCashValues(amount: number) {
  const candidates = [10, 20, 50, 100, 200, 500];
  const values = candidates.filter(value => value >= amount).slice(0, 3);
  if (!values.includes(Math.ceil(amount))) values.unshift(Math.ceil(amount));
  return Array.from(new Set(values)).slice(0, 4);
}

export function PdvSaleWorkspace({
  bootstrap,
  onBack,
}: {
  bootstrap: PdvBootstrap;
  onBack: () => void;
}) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const organizationId = activeOrganizationId || "";
  const canSell = hasPermission("pdv.sales.create");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const customerSearchInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCartProductId, setSelectedCartProductId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const debouncedCustomerSearch = useDebouncedValue(customerSearch);
  const [selectedCustomer, setSelectedCustomer] = useState<PdvCustomer | null>(null);
  const [discount, setDiscount] = useState("");
  const [surcharge, setSurcharge] = useState("");
  const [note, setNote] = useState("");
  const [payments, setPayments] = useState<CheckoutPayment[]>([]);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [saleResult, setSaleResult] = useState<PdvSaleResult | null>(null);

  const focusProductSearch = () => {
    window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 0);
  };

  const productsQuery = useQuery({
    queryKey: queryKeys.pdv.products(organizationId || "none", debouncedSearch),
    queryFn: () => searchPdvProducts(organizationId, debouncedSearch, 30),
    enabled: Boolean(
      organizationId
      && canSell
      && (debouncedSearch.trim().length === 0 || debouncedSearch.trim().length >= 2)
    ),
  });

  const customersQuery = useQuery({
    queryKey: queryKeys.pdv.customers(organizationId || "none", debouncedCustomerSearch),
    queryFn: () => searchPdvCustomers(organizationId, debouncedCustomerSearch, 20),
    enabled: Boolean(
      organizationId
      && canSell
      && checkoutOpen
      && !selectedCustomer
      && (debouncedCustomerSearch.trim().length === 0 || debouncedCustomerSearch.trim().length >= 2)
    ),
  });

  const products = productsQuery.data || [];
  const settings = bootstrap.settings;
  const allowNegativeStock = settings?.allow_negative_stock === true;
  const paymentMethods = useMemo(
    () => (bootstrap.payment_methods || [])
      .filter(method => method.available_for_pdv)
      .sort((left, right) => paymentPriority(left.method_type) - paymentPriority(right.method_type) || left.name.localeCompare(right.name, "pt-BR")),
    [bootstrap.payment_methods],
  );
  const usablePaymentMethods = paymentMethods.filter(method => method.method_type !== "cash" || Boolean(bootstrap.open_session));

  useEffect(() => {
    focusProductSearch();
  }, []);

  useEffect(() => {
    if (!productsQuery.error) return;
    setToast({ msg: systemErrorMessage(productsQuery.error, "Não foi possível buscar produtos."), type: "error" });
  }, [productsQuery.error]);

  useEffect(() => {
    if (!customersQuery.error) return;
    setToast({ msg: systemErrorMessage(customersQuery.error, "Não foi possível buscar clientes."), type: "error" });
  }, [customersQuery.error]);

  useEffect(() => {
    if (cart.length === 0) {
      setSelectedCartProductId(null);
      return;
    }
    if (!selectedCartProductId || !cart.some(item => item.product.product_id === selectedCartProductId)) {
      setSelectedCartProductId(cart[cart.length - 1].product.product_id);
    }
  }, [cart, selectedCartProductId]);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.product.price || 0) * item.quantity, 0),
    [cart],
  );
  const itemDiscountTotal = useMemo(
    () => cart.reduce((sum, item) => sum + currencyNumber(item.discount), 0),
    [cart],
  );
  const afterItemDiscounts = Math.max(0, subtotal - itemDiscountTotal);
  const discountValue = currencyNumber(discount);
  const surchargeValue = currencyNumber(surcharge);
  const totalDiscount = itemDiscountTotal + discountValue;
  const total = Math.max(0, subtotal - totalDiscount + surchargeValue);
  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);

  const selectedPayments = payments.map(payment => ({
    payment,
    method: paymentMethods.find(method => method.id === payment.paymentMethodId) || null,
  }));
  const paymentTotal = selectedPayments.reduce((sum, entry) => sum + currencyNumber(entry.payment.amount), 0);
  const remaining = Math.round((total - paymentTotal) * 100) / 100;
  const changeTotal = selectedPayments.reduce((sum, entry) => {
    if (entry.method?.method_type !== "cash") return sum;
    return sum + Math.max(0, currencyNumber(entry.payment.tenderedAmount) - currencyNumber(entry.payment.amount));
  }, 0);

  const addProduct = (product: PdvProduct) => {
    if (product.price == null) {
      setToast({ msg: "Este produto não possui preço de venda definido.", type: "error" });
      focusProductSearch();
      return;
    }

    const available = availableQuantity(product);
    const current = cart.find(item => item.product.product_id === product.product_id)?.quantity || 0;
    const nextQuantity = current + 1;
    if (!allowNegativeStock && nextQuantity > available) {
      setToast({ msg: "Estoque insuficiente para adicionar mais unidades deste produto.", type: "error" });
      focusProductSearch();
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
      return [...currentCart, { product, quantity: 1, discount: "" }];
    });
    setSelectedCartProductId(product.product_id);
    setSearch("");
    focusProductSearch();
  };

  const setQuantity = (productId: string, nextQuantity: number) => {
    if (nextQuantity <= 0) {
      setCart(current => current.filter(item => item.product.product_id !== productId));
      focusProductSearch();
      return;
    }

    const item = cart.find(entry => entry.product.product_id === productId);
    if (!item) return;
    if (!allowNegativeStock && nextQuantity > availableQuantity(item.product)) {
      setToast({ msg: "A quantidade informada ultrapassa o estoque disponível.", type: "error" });
      return;
    }

    setCart(current => current.map(entry => {
      if (entry.product.product_id !== productId) return entry;
      const nextLineSubtotal = Number(entry.product.price || 0) * nextQuantity;
      const currentDiscount = currencyNumber(entry.discount);
      return {
        ...entry,
        quantity: nextQuantity,
        discount: currentDiscount > nextLineSubtotal
          ? nextLineSubtotal.toFixed(2)
          : entry.discount,
      };
    }));
  };

  const setItemDiscount = (productId: string, rawValue: string) => {
    if (rawValue && !/^\d*[.,]?\d{0,2}$/.test(rawValue)) return;
    setCart(current => current.map(item =>
      item.product.product_id === productId ? { ...item, discount: rawValue } : item,
    ));
  };

  const normalizeItemDiscount = (productId: string) => {
    const item = cart.find(entry => entry.product.product_id === productId);
    if (!item) return;
    const lineSubtotal = Number(item.product.price || 0) * item.quantity;
    const value = currencyNumber(item.discount);
    if (value > lineSubtotal) {
      setCart(current => current.map(entry =>
        entry.product.product_id === productId
          ? { ...entry, discount: lineSubtotal.toFixed(2) }
          : entry,
      ));
      setToast({ msg: "O desconto do item foi limitado ao subtotal do produto.", type: "error" });
    } else if (value <= 0) {
      setCart(current => current.map(entry =>
        entry.product.product_id === productId ? { ...entry, discount: "" } : entry,
      ));
    } else {
      setCart(current => current.map(entry =>
        entry.product.product_id === productId ? { ...entry, discount: value.toFixed(2) } : entry,
      ));
    }
  };

  const handleSearchEnter = () => {
    const normalized = search.trim();
    if (!normalized) return;

    const exactBarcode = products.find(product => product.barcode === normalized);
    if (exactBarcode) {
      addProduct(exactBarcode);
      return;
    }

    const exactSku = products.find(product => product.sku?.toLocaleLowerCase("pt-BR") === normalized.toLocaleLowerCase("pt-BR"));
    if (exactSku) {
      addProduct(exactSku);
      return;
    }

    if (products.length === 1) {
      addProduct(products[0]);
      return;
    }

    setToast({ msg: "Selecione um produto da lista ou informe um código exato.", type: "error" });
  };

  const resetCheckout = () => {
    setCustomerSearch("");
    setSelectedCustomer(null);
    setDiscount("");
    setSurcharge("");
    setNote("");
    setPayments([]);
    setIdempotencyKey(crypto.randomUUID());
  };

  const openCheckout = () => {
    if (cart.length === 0) return;
    if (usablePaymentMethods.length === 0) {
      setToast({ msg: "Nenhuma forma de pagamento está pronta para uso no PDV.", type: "error" });
      return;
    }

    const preferred = usablePaymentMethods[0];
    setPayments([{
      paymentMethodId: preferred.id,
      amount: total.toFixed(2),
      tenderedAmount: preferred.method_type === "cash" ? total.toFixed(2) : "",
    }]);
    setCheckoutOpen(true);
  };

  const closeCheckout = () => {
    setCheckoutOpen(false);
    focusProductSearch();
  };

  const addPaymentMethod = (method: PdvPaymentMethod) => {
    if (payments.some(payment => payment.paymentMethodId === method.id)) return;
    const amount = Math.max(0, remaining).toFixed(2);
    setPayments(current => [...current, {
      paymentMethodId: method.id,
      amount,
      tenderedAmount: method.method_type === "cash" ? amount : "",
    }]);
  };

  const updatePayment = (methodId: string, patch: Partial<CheckoutPayment>) => {
    setPayments(current => current.map(payment =>
      payment.paymentMethodId === methodId ? { ...payment, ...patch } : payment,
    ));
  };

  const removePayment = (methodId: string) => {
    setPayments(current => current.filter(payment => payment.paymentMethodId !== methodId));
  };

  const fillRemaining = (methodId: string) => {
    const otherPayments = payments
      .filter(payment => payment.paymentMethodId !== methodId)
      .reduce((sum, payment) => sum + currencyNumber(payment.amount), 0);
    const nextAmount = Math.max(0, total - otherPayments).toFixed(2);
    const method = paymentMethods.find(item => item.id === methodId);
    updatePayment(methodId, {
      amount: nextAmount,
      ...(method?.method_type === "cash" ? { tenderedAmount: nextAmount } : {}),
    });
  };

  const checkoutInvalidReason = (() => {
    if (cart.length === 0) return "O carrinho está vazio.";
    if (itemDiscountTotal > subtotal) return "Há desconto de item maior que o subtotal da venda.";
    if (discountValue > afterItemDiscounts) return "O desconto geral não pode ser maior que o valor após os descontos dos itens.";
    if (total <= 0) return "O total da venda deve ser maior que zero.";
    if (!settings?.allow_sale_without_customer && !selectedCustomer) return "Selecione um cliente.";
    if (payments.length === 0) return "Adicione uma forma de pagamento.";
    if (Math.abs(remaining) >= 0.01) return remaining > 0
      ? `Faltam ${formatCurrency(remaining)} nos pagamentos.`
      : `Os pagamentos excedem o total em ${formatCurrency(Math.abs(remaining))}.`;

    for (const entry of selectedPayments) {
      if (!entry.method) return "Há uma forma de pagamento inválida.";
      const amount = currencyNumber(entry.payment.amount);
      if (amount <= 0) return "Todos os pagamentos precisam ter valor maior que zero.";
      if (entry.method.method_type === "cash" && currencyNumber(entry.payment.tenderedAmount) < amount) {
        return "O valor recebido em dinheiro não pode ser menor que o valor usado na venda.";
      }
    }

    return null;
  })();

  const finalizeMutation = useMutation({
    mutationFn: () => finalizePdvSale(organizationId, {
      idempotencyKey,
      customerId: selectedCustomer?.id || null,
      discountAmount: discountValue,
      surchargeAmount: surchargeValue,
      note: note.trim() || null,
      items: cart.map(item => ({
        productId: item.product.product_id,
        quantity: item.quantity,
        discountAmount: currencyNumber(item.discount),
      })),
      payments: payments.map(payment => ({
        paymentMethodId: payment.paymentMethodId,
        amount: currencyNumber(payment.amount),
        tenderedAmount: paymentMethods.find(method => method.id === payment.paymentMethodId)?.method_type === "cash"
          ? currencyNumber(payment.tenderedAmount)
          : null,
      })),
    }),
    onSuccess: async result => {
      setSaleResult(result);
      setCheckoutOpen(false);
      setCart([]);
      setSelectedCartProductId(null);
      setSearch("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.pdv.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.finance.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.catalog.products() }),
      ]);
    },
    onError: error => {
      setToast({ msg: systemErrorMessage(error, "Não foi possível finalizar a venda."), type: "error" });
    },
  });

  const newSale = () => {
    setSaleResult(null);
    resetCheckout();
    focusProductSearch();
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (saleResult || finalizeMutation.isPending) return;
      const editable = isEditableTarget(event.target);

      if (event.key === "F2") {
        event.preventDefault();
        setCheckoutOpen(false);
        focusProductSearch();
        return;
      }

      if (event.key === "F3" && checkoutOpen) {
        event.preventDefault();
        customerSearchInputRef.current?.focus();
        return;
      }

      if (event.key === "F4") {
        event.preventDefault();
        if (!checkoutOpen) {
          openCheckout();
        } else if (!checkoutInvalidReason) {
          finalizeMutation.mutate();
        }
        return;
      }

      if (event.key === "Escape") {
        if (checkoutOpen) {
          event.preventDefault();
          closeCheckout();
        } else if (!editable) {
          setSearch("");
          focusProductSearch();
        }
        return;
      }

      if (checkoutOpen) {
        if (!editable && event.ctrlKey && event.key === "Enter" && !checkoutInvalidReason) {
          event.preventDefault();
          finalizeMutation.mutate();
          return;
        }
        if (!editable && /^[1-9]$/.test(event.key)) {
          const method = usablePaymentMethods[Number(event.key) - 1];
          if (method) {
            event.preventDefault();
            addPaymentMethod(method);
          }
        }
        return;
      }

      if (!editable && cart.length > 0 && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
        const currentIndex = Math.max(0, cart.findIndex(item => item.product.product_id === selectedCartProductId));
        const nextIndex = event.key === "ArrowUp"
          ? Math.max(0, currentIndex - 1)
          : Math.min(cart.length - 1, currentIndex + 1);
        setSelectedCartProductId(cart[nextIndex].product.product_id);
        return;
      }

      if (!editable && selectedCartProductId && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        setQuantity(selectedCartProductId, 0);
        return;
      }

      if (!editable && selectedCartProductId && (event.key === "+" || event.key === "=" || event.key === "-")) {
        const item = cart.find(entry => entry.product.product_id === selectedCartProductId);
        if (item) {
          event.preventDefault();
          setQuantity(selectedCartProductId, item.quantity + (event.key === "-" ? -1 : 1));
        }
        return;
      }

      if (
        !editable
        && !event.ctrlKey
        && !event.metaKey
        && !event.altKey
        && event.key.length === 1
      ) {
        event.preventDefault();
        setSearch(current => current + event.key);
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    saleResult,
    checkoutOpen,
    checkoutInvalidReason,
    cart,
    selectedCartProductId,
    usablePaymentMethods,
    finalizeMutation.isPending,
  ]);

  return <div className="min-w-0 space-y-4">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    <PageHeader
      title="Nova venda"
      subtitle="Operação rápida de balcão com leitor de código de barras e atalhos de teclado."
      actions={<AdminButton variant="secondary" onClick={onBack}><ArrowLeft size={15} /> Voltar ao PDV</AdminButton>}
    />

    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <CounterMetric label="Itens diferentes" value={String(cart.length)} />
      <CounterMetric label="Quantidade" value={formatNumber(totalQuantity)} />
      <CounterMetric label="Descontos" value={formatCurrency(totalDiscount)} tone={totalDiscount > 0 ? "success" : undefined} />
      <CounterMetric label="Total" value={formatCurrency(total)} emphasis />
    </div>

    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-[#f8fafc] px-3 py-2 text-[10px] font-bold text-muted-foreground">
      <span className="flex items-center gap-1.5 text-foreground"><Keyboard size={13} /> Atalhos</span>
      <Shortcut keys="F2" label="Buscar" />
      <Shortcut keys="↑ ↓" label="Selecionar item" />
      <Shortcut keys="+ −" label="Quantidade" />
      <Shortcut keys="Del" label="Remover" />
      <Shortcut keys="F4" label="Pagamento / finalizar" />
    </div>

    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.82fr)_minmax(460px,1.18fr)]">
      <div className="min-w-0 space-y-3">
        <AdminSearchPanel title="Leitor / buscar produto">
          <div className="relative">
            <Barcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary" />
            <input
              ref={searchInputRef}
              autoFocus
              value={search}
              onChange={event => setSearch(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSearchEnter();
                }
              }}
              placeholder="Leia o código ou digite nome / SKU"
              className={cn(INPUT, "h-[48px] w-full border-primary/20 pl-10 pr-12 text-sm font-bold focus:border-primary")}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-[#0d1b2e]/10 bg-white px-1.5 py-0.5 text-[9px] font-black text-[#7a8aa0]">F2</span>
          </div>
          <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">O leitor continua pronto mesmo depois de mexer no carrinho. Código exato + Enter adiciona direto.</p>
        </AdminSearchPanel>

        <Section title="Produtos encontrados" flush>
          {productsQuery.isPending ? <LoadingState text="Buscando produtos..." /> : products.length === 0 ? (
            <EmptyState
              icon={Search}
              title={search ? "Nenhum produto encontrado" : "Nenhum produto disponível"}
              message={search ? "Tente outro nome, SKU ou código de barras." : "Cadastre e ative produtos antes de iniciar uma venda."}
            />
          ) : <div className="max-h-[54vh] divide-y divide-[#0d1b2e]/7 overflow-y-auto">
            {products.map(product => {
              const available = availableQuantity(product);
              const noStock = available <= 0;
              return <button
                key={product.product_id}
                type="button"
                onClick={() => addProduct(product)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-primary-soft/45"
              >
                <ProductAdminThumb mediaId={product.cover_media_id} name={product.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-black text-foreground">{product.name}</p>
                  <p className="mt-0.5 truncate text-[9px] font-semibold text-[#7a8aa0]">{product.sku || "Sem SKU"}{product.barcode ? " · " + product.barcode : ""}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-black text-foreground">{product.price == null ? "Sem preço" : formatCurrency(product.price)}</p>
                  <p className={cn("mt-0.5 text-[9px] font-bold", noStock ? "text-red-600" : "text-muted-foreground")}>
                    {formatNumber(available)} {product.unit || "un"} em estoque
                  </p>
                </div>
                <Plus size={15} className="shrink-0 text-primary" />
              </button>;
            })}
          </div>}
        </Section>
      </div>

      <Section
        title="Carrinho"
        description={totalQuantity + " unidade" + (totalQuantity === 1 ? "" : "s")}
        actions={cart.length > 0 ? <AdminIconButton ariaLabel="Limpar carrinho" title="Limpar carrinho" variant="danger" onClick={() => {
          setCart([]);
          setSelectedCartProductId(null);
          focusProductSearch();
        }}><Trash2 size={15} /></AdminIconButton> : undefined}
        flush
        className="h-fit xl:sticky xl:top-0"
      >
        {cart.length === 0 ? <div className="p-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary"><Package size={20} /></div>
          <p className="mt-3 text-sm font-black text-foreground">Carrinho vazio</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Leia um código de barras ou escolha um produto na busca.</p>
        </div> : <div className="max-h-[56vh] divide-y divide-[#0d1b2e]/7 overflow-y-auto">
          {cart.map((item, index) => {
            const productId = item.product.product_id;
            const lineSubtotal = Number(item.product.price || 0) * item.quantity;
            const itemDiscount = currencyNumber(item.discount);
            const lineTotal = Math.max(0, lineSubtotal - itemDiscount);
            const selected = selectedCartProductId === productId;
            return <div
              key={productId}
              onClick={() => setSelectedCartProductId(productId)}
              className={cn(
                "relative px-3 py-2.5 transition",
                selected ? "bg-primary-soft/55" : "bg-white hover:bg-[#f8fafc]",
              )}
            >
              {selected && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" />}
              <div className="grid min-w-0 gap-2 sm:grid-cols-[28px_minmax(0,1fr)_auto] sm:items-start">
                <div className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-black",
                  selected ? "bg-primary text-white" : "bg-[#eef1f5] text-muted-foreground",
                )}>{index + 1}</div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-foreground">{item.product.name}</p>
                  <p className="mt-0.5 truncate text-[9px] text-[#7a8aa0]">{item.product.sku || item.product.barcode || "Sem código"} · {formatCurrency(item.product.price || 0)} / {item.product.unit || "un"}</p>
                </div>
                <AdminIconButton ariaLabel="Remover produto" title="Remover" variant="danger" onClick={event => {
                  event.stopPropagation();
                  setQuantity(productId, 0);
                }}><Trash2 size={13} /></AdminIconButton>
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-[118px_minmax(120px,1fr)_130px] sm:items-end">
                <div>
                  <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-[#8a98aa]">Quantidade</p>
                  <div className="flex h-8 items-center overflow-hidden rounded-lg border border-[#0d1b2e]/12 bg-white">
                    <button type="button" onClick={event => {
                      event.stopPropagation();
                      setQuantity(productId, item.quantity - 1);
                    }} className="flex h-full w-8 items-center justify-center text-muted-foreground hover:bg-[#f5f7fa]"><Minus size={12} /></button>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={item.quantity}
                      onClick={event => event.stopPropagation()}
                      onFocus={event => event.currentTarget.select()}
                      onChange={event => {
                        const next = Number(event.target.value);
                        if (Number.isFinite(next) && next > 0) setQuantity(productId, next);
                      }}
                      className="h-full min-w-0 flex-1 border-x border-[#0d1b2e]/10 bg-white px-1 text-center text-xs font-black text-foreground outline-none"
                    />
                    <button type="button" onClick={event => {
                      event.stopPropagation();
                      setQuantity(productId, item.quantity + 1);
                    }} className="flex h-full w-8 items-center justify-center text-primary hover:bg-primary-soft"><Plus size={12} /></button>
                  </div>
                </div>

                <div>
                  <p className="mb-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-[#8a98aa]"><Tag size={10} /> Desconto no item</p>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#7a8aa0]">R$</span>
                    <input
                      inputMode="decimal"
                      value={item.discount}
                      onClick={event => event.stopPropagation()}
                      onChange={event => setItemDiscount(productId, event.target.value)}
                      onBlur={() => normalizeItemDiscount(productId)}
                      placeholder="0,00"
                      className={cn(INPUT, "h-8 w-full pl-8 text-xs")}
                    />
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-[#8a98aa]">Total do item</p>
                  {itemDiscount > 0 && <p className="mt-0.5 text-[9px] text-[#8a98aa] line-through">{formatCurrency(lineSubtotal)}</p>}
                  <p className={cn("mt-0.5 text-base font-black", itemDiscount > 0 ? "text-emerald-700" : "text-foreground")}>{formatCurrency(lineTotal)}</p>
                </div>
              </div>
            </div>;
          })}
        </div>}

        <div className="border-t border-border bg-[#f8fafc] p-3 sm:p-4">
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-3 text-muted-foreground">
              <span>Subtotal</span>
              <strong className="text-foreground">{formatCurrency(subtotal)}</strong>
            </div>
            {itemDiscountTotal > 0 && <div className="flex items-center justify-between gap-3 text-emerald-700">
              <span>Descontos nos itens</span>
              <strong>- {formatCurrency(itemDiscountTotal)}</strong>
            </div>}
            <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
              <span className="font-black text-foreground">Total atual</span>
              <span className="text-2xl font-black text-foreground">{formatCurrency(afterItemDiscounts)}</span>
            </div>
          </div>
          <AdminButton
            className="mt-3 w-full"
            size="lg"
            disabled={cart.length === 0 || usablePaymentMethods.length === 0}
            onClick={openCheckout}
          >
            <WalletCards size={16} /> Pagamento <span className="ml-auto rounded bg-white/15 px-1.5 py-0.5 text-[9px]">F4</span>
          </AdminButton>
          {usablePaymentMethods.length === 0 && <p className="mt-2 text-center text-[10px] font-semibold text-amber-700">Nenhuma forma de pagamento está pronta para uso.</p>}
        </div>
      </Section>
    </div>

    <AdminDialog
      open={checkoutOpen}
      onClose={() => {
        if (finalizeMutation.isPending) return;
        closeCheckout();
      }}
      title="Pagamento"
      description="F3 busca cliente · teclas 1–9 adicionam formas de pagamento · F4 finaliza quando estiver fechado."
      minimizedDescription={`${selectedCustomer?.name || "Sem cliente"} · ${formatCurrency(total)} · ${remaining > 0.009 ? `Restante ${formatCurrency(remaining)}` : changeTotal > 0 ? `Troco ${formatCurrency(changeTotal)}` : "Pagamento fechado"}`}
      className="!max-w-6xl"
      footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground">
          {checkoutInvalidReason
            ? <span className="font-semibold text-amber-700">{checkoutInvalidReason}</span>
            : <span className="font-semibold text-emerald-700">Venda pronta. Pressione F4 para finalizar.</span>}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <AdminButton variant="secondary" onClick={closeCheckout} disabled={finalizeMutation.isPending}>Voltar</AdminButton>
          <AdminButton
            onClick={() => finalizeMutation.mutate()}
            loading={finalizeMutation.isPending}
            loadingText="Finalizando..."
            disabled={Boolean(checkoutInvalidReason)}
          >
            <CheckCircle2 size={15} /> Finalizar venda <span className="ml-1 rounded bg-white/15 px-1.5 py-0.5 text-[9px]">F4</span>
          </AdminButton>
        </div>
      </div>}
    >
      <div className="flex min-w-0 flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 space-y-4 lg:w-[40%] lg:flex-none">
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-black text-foreground"><UserRound size={15} /> Cliente</h3>
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#7a8aa0]">{settings?.allow_sale_without_customer ? "Opcional" : "Obrigatório"}</span>
            </div>

            {selectedCustomer ? <div className="rounded-xl border border-primary/15 bg-primary-soft p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-foreground">{selectedCustomer.name}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{selectedCustomer.document || selectedCustomer.whatsapp || selectedCustomer.phone || "Sem documento ou telefone"}</p>
                </div>
                <AdminButton variant="ghost" size="sm" onClick={() => setSelectedCustomer(null)}>Trocar</AdminButton>
              </div>
            </div> : <>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={customerSearchInputRef}
                  value={customerSearch}
                  onChange={event => setCustomerSearch(event.target.value)}
                  placeholder="Nome, CPF/CNPJ ou telefone"
                  className={cn(INPUT, "pl-9 pr-10")}
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-[#0d1b2e]/10 px-1.5 py-0.5 text-[8px] font-black text-[#7a8aa0]">F3</span>
              </div>
              <div className="mt-2 max-h-36 overflow-y-auto rounded-xl border border-border">
                {customersQuery.isPending ? <p className="p-3 text-xs text-muted-foreground">Buscando clientes...</p> : (customersQuery.data || []).length === 0 ? <p className="p-3 text-xs text-muted-foreground">Nenhum cliente encontrado.</p> : (customersQuery.data || []).map(customer => <button
                  key={customer.id}
                  type="button"
                  onClick={() => {
                    setSelectedCustomer(customer);
                    setCustomerSearch("");
                  }}
                  className="flex w-full items-center justify-between gap-3 border-b border-[#0d1b2e]/5 px-3 py-2 text-left last:border-b-0 hover:bg-[#f8fafc]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold text-foreground">{customer.name}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-[#7a8aa0]">{customer.document || customer.whatsapp || customer.phone || "Sem documento ou telefone"}</span>
                  </span>
                  <Plus size={13} className="shrink-0 text-primary" />
                </button>)}
              </div>
            </>}
          </section>

          <section className="border-t border-border pt-4">
            <h3 className="mb-3 text-sm font-black text-foreground">Ajustes gerais</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <FCurrencyInput label="Desconto geral" value={discount} onChange={(event: any) => setDiscount(event.target.value)} />
              <FCurrencyInput label="Acréscimo" value={surcharge} onChange={(event: any) => setSurcharge(event.target.value)} />
            </div>
            <div className="mt-3">
              <FTextarea
                label="Observação"
                rows={2}
                value={note}
                onChange={(event: any) => setNote(event.target.value)}
                placeholder="Opcional"
              />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-[#f8fafc] p-4">
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between gap-3 text-muted-foreground"><span>Subtotal</span><strong className="text-foreground">{formatCurrency(subtotal)}</strong></div>
              {itemDiscountTotal > 0 && <div className="flex items-center justify-between gap-3 text-emerald-700"><span>Descontos nos itens</span><strong>- {formatCurrency(itemDiscountTotal)}</strong></div>}
              {discountValue > 0 && <div className="flex items-center justify-between gap-3 text-emerald-700"><span>Desconto geral</span><strong>- {formatCurrency(discountValue)}</strong></div>}
              {surchargeValue > 0 && <div className="flex items-center justify-between gap-3 text-amber-700"><span>Acréscimo</span><strong>+ {formatCurrency(surchargeValue)}</strong></div>}
              <div className="flex items-center justify-between gap-3 border-t border-border pt-2 text-sm"><span className="font-black text-foreground">Total</span><strong className="text-2xl text-foreground">{formatCurrency(total)}</strong></div>
            </div>
          </section>
        </div>

        <div className="min-w-0 flex-1 space-y-4 lg:border-l lg:border-border lg:pl-6">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-black text-foreground"><CreditCard size={15} /> Formas de pagamento</h3>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Clique ou use 1–9. É possível dividir a venda entre várias formas.</p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {paymentMethods.map((method, index) => {
              const selected = payments.some(payment => payment.paymentMethodId === method.id);
              const cashClosed = method.method_type === "cash" && !bootstrap.open_session;
              const disabled = cashClosed || !method.available_for_pdv;
              return <button
                key={method.id}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                onClick={() => selected ? removePayment(method.id) : addPaymentMethod(method)}
                className={cn(
                  "relative rounded-xl border p-3 text-left transition",
                  selected ? "border-primary bg-primary-soft text-primary ring-1 ring-primary/20 hover:bg-primary-soft-strong" : "border-[#0d1b2e]/10 bg-white hover:border-primary/30 hover:bg-primary-soft/40",
                  disabled && "cursor-default opacity-45",
                )}
              >
                {index < 9 && <span className="absolute right-2 top-2 rounded border border-current/15 px-1 py-0.5 text-[8px] font-black opacity-70">{index + 1}</span>}
                <p className="truncate pr-5 text-xs font-black">{method.name}</p>
                <p className="mt-1 truncate text-[9px] text-[#7a8aa0]">{cashClosed ? "Abra o caixa" : selected ? "Selecionado · clique para remover" : method.financial_account_name || paymentTypeLabel(method.method_type)}</p>
              </button>;
            })}
          </div>

          <div className="space-y-3">
            {selectedPayments.map(({ payment, method }) => method && <div key={payment.paymentMethodId} className="rounded-xl border border-[#0d1b2e]/10 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-foreground">{method.name}</p>
                  <p className="mt-0.5 truncate text-[9px] text-[#7a8aa0]">{method.financial_account_name || paymentTypeLabel(method.method_type)}{method.creates_future_settlement ? " · liquidação futura" : ""}</p>
                </div>
                <AdminIconButton ariaLabel={"Remover " + method.name} title="Remover" variant="danger" onClick={() => removePayment(method.id)}><Trash2 size={13} /></AdminIconButton>
              </div>

              <div className={cn("mt-3 flex min-w-0 flex-col gap-3", method.method_type === "cash" && "sm:flex-row sm:[&>div]:min-w-0 sm:[&>div]:flex-1")}>
                <div>
                  <FCurrencyInput label="Valor usado na venda" value={payment.amount} onChange={(event: any) => updatePayment(method.id, { amount: event.target.value })} />
                  <button type="button" onClick={() => fillRemaining(method.id)} className="mt-1 text-[9px] font-bold text-primary hover:underline">Usar valor restante</button>
                </div>
                {method.method_type === "cash" && <div>
                  <FCurrencyInput label="Valor recebido do cliente" value={payment.tenderedAmount} onChange={(event: any) => updatePayment(method.id, { tenderedAmount: event.target.value })} />
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <button type="button" onClick={() => updatePayment(method.id, { tenderedAmount: payment.amount })} className="rounded-md border border-[#0d1b2e]/10 px-2 py-1 text-[9px] font-bold text-muted-foreground hover:border-primary/30 hover:text-primary">Exato</button>
                    {quickCashValues(currencyNumber(payment.amount)).map(value => <button
                      key={value}
                      type="button"
                      onClick={() => updatePayment(method.id, { tenderedAmount: value.toFixed(2) })}
                      className="rounded-md border border-[#0d1b2e]/10 px-2 py-1 text-[9px] font-bold text-muted-foreground hover:border-primary/30 hover:text-primary"
                    >{formatCurrency(value)}</button>)}
                  </div>
                </div>}
              </div>

              {method.method_type === "cash" && currencyNumber(payment.tenderedAmount) >= currencyNumber(payment.amount) && currencyNumber(payment.amount) > 0 && <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-800">
                <span className="text-xs font-black uppercase tracking-[0.12em]">Troco</span>
                <strong className="text-2xl font-black">{formatCurrency(Math.max(0, currencyNumber(payment.tenderedAmount) - currencyNumber(payment.amount)))}</strong>
              </div>}
            </div>)}
          </div>

          <div className="sticky bottom-0 rounded-xl border border-border bg-card p-4">
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between gap-3 text-muted-foreground"><span>Pagamentos</span><strong className="text-base text-foreground">{formatCurrency(paymentTotal)}</strong></div>
              <div className={cn("flex items-center justify-between gap-3 border-t border-border pt-2", Math.abs(remaining) < 0.01 ? "text-emerald-700" : "text-amber-700")}>
                <span className="font-black">{remaining > 0 ? "Restante" : remaining < 0 ? "Excedente" : "Pagamento fechado"}</span>
                <strong className="text-base">{formatCurrency(Math.abs(remaining))}</strong>
              </div>
              {changeTotal > 0 && <div className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800"><span className="font-black">Troco</span><strong className="text-xl font-black">{formatCurrency(changeTotal)}</strong></div>}
            </div>
          </div>
        </div>
      </div>
    </AdminDialog>

    <AdminDialog
      open={Boolean(saleResult)}
      onClose={newSale}
      title="Venda concluída"
      description={saleResult ? `Venda #${saleResult.sale_number} registrada com sucesso.` : undefined}
      minimizedDescription={saleResult ? [`Venda #${saleResult.sale_number}`, saleResult.customer_name, formatCurrency(saleResult.total_amount)].filter(Boolean).join(" · ") : undefined}
      className="max-w-lg"
      footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <AdminButton variant="secondary" onClick={onBack}>Voltar ao PDV</AdminButton>
        <AdminButton onClick={newSale}><ShoppingCart size={15} /> Nova venda</AdminButton>
      </div>}
    >
      {saleResult && <div className="space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 size={28} /></div>
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7a8aa0]">Venda #{saleResult.sale_number}</p>
          <p className="mt-2 text-3xl font-black text-foreground">{formatCurrency(saleResult.total_amount)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{new Date(saleResult.sold_at).toLocaleString("pt-BR")}</p>
        </div>
        <div className="rounded-xl border border-border bg-[#f8fafc] p-4 text-xs">
          <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Subtotal</span><strong>{formatCurrency(saleResult.subtotal)}</strong></div>
          {Number(saleResult.discount_amount || 0) > 0 && <div className="mt-2 flex items-center justify-between gap-3 text-emerald-700"><span>Descontos</span><strong>- {formatCurrency(saleResult.discount_amount)}</strong></div>}
          {Number(saleResult.surcharge_amount || 0) > 0 && <div className="mt-2 flex items-center justify-between gap-3 text-amber-700"><span>Acréscimo</span><strong>+ {formatCurrency(saleResult.surcharge_amount)}</strong></div>}
          {Number(saleResult.change_amount || 0) > 0 && <div className="mt-2 flex items-center justify-between gap-3 text-primary"><span>Troco</span><strong>{formatCurrency(saleResult.change_amount)}</strong></div>}
          {saleResult.customer_name && <div className="mt-3 border-t border-border pt-3"><span className="text-muted-foreground">Cliente</span><strong className="ml-2 text-foreground">{saleResult.customer_name}</strong></div>}
        </div>
        <p className="text-center text-[10px] leading-4 text-[#7a8aa0]">Estoque e Financeiro foram atualizados na mesma transação da venda.</p>
      </div>}
    </AdminDialog>
  </div>;
}

function CounterMetric({
  label,
  value,
  tone,
  emphasis = false,
}: {
  label: string;
  value: string;
  tone?: "success";
  emphasis?: boolean;
}) {
  return <div className={cn(
    "rounded-xl border px-3 py-2.5",
    emphasis ? "border-primary bg-primary text-white" : "border-border bg-white",
  )}>
    <p className={cn("text-[9px] font-bold uppercase tracking-wider", emphasis ? "text-white/70" : "text-[#8a98aa]")}>{label}</p>
    <p className={cn(
      "mt-0.5 text-lg font-black",
      emphasis ? "text-white" : tone === "success" ? "text-emerald-700" : "text-foreground",
    )}>{value}</p>
  </div>;
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return <span className="flex items-center gap-1">
    <kbd className="rounded border border-[#0d1b2e]/10 bg-white px-1.5 py-0.5 text-[9px] font-black text-foreground">{keys}</kbd>
    {label}
  </span>;
}
