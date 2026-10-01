import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Barcode,
  CheckCircle2,
  CreditCard,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingCart,
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
};

type CheckoutPayment = {
  paymentMethodId: string;
  amount: string;
  tenderedAmount: string;
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

function paymentTypeLabel(type: string) {
  if (type === "cash") return "Dinheiro";
  if (type === "pix") return "PIX";
  if (type === "debit_card") return "Débito";
  if (type === "credit_card") return "Crédito";
  if (type === "boleto") return "Boleto";
  if (type === "transfer") return "Transferência";
  return "Outro";
}

function currencyNumber(value: string) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
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

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [cart, setCart] = useState<CartItem[]>([]);
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

  const productsQuery = useQuery({
    queryKey: queryKeys.pdv.products(organizationId || "none", debouncedSearch),
    queryFn: () => searchPdvProducts(organizationId, debouncedSearch, 30),
    enabled: Boolean(organizationId && canSell),
  });

  const customersQuery = useQuery({
    queryKey: queryKeys.pdv.customers(organizationId || "none", debouncedCustomerSearch),
    queryFn: () => searchPdvCustomers(organizationId, debouncedCustomerSearch, 20),
    enabled: Boolean(organizationId && canSell && checkoutOpen && !selectedCustomer),
  });

  const products = productsQuery.data || [];
  const settings = bootstrap.settings;
  const allowNegativeStock = settings?.allow_negative_stock === true;
  const paymentMethods = (bootstrap.payment_methods || []).filter(method => method.available_for_pdv);
  const usablePaymentMethods = paymentMethods.filter(method => method.method_type !== "cash" || Boolean(bootstrap.open_session));

  useEffect(() => {
    if (!productsQuery.error) return;
    setToast({ msg: systemErrorMessage(productsQuery.error, "Não foi possível buscar produtos."), type: "error" });
  }, [productsQuery.error]);

  useEffect(() => {
    if (!customersQuery.error) return;
    setToast({ msg: systemErrorMessage(customersQuery.error, "Não foi possível buscar clientes."), type: "error" });
  }, [customersQuery.error]);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.product.price || 0) * item.quantity, 0),
    [cart],
  );
  const discountValue = currencyNumber(discount);
  const surchargeValue = currencyNumber(surcharge);
  const total = Math.max(0, subtotal - discountValue + surchargeValue);

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
      amount: subtotal.toFixed(2),
      tenderedAmount: preferred.method_type === "cash" ? subtotal.toFixed(2) : "",
    }]);
    setCheckoutOpen(true);
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
    if (discountValue > subtotal) return "O desconto não pode ser maior que o subtotal.";
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
        return "O valor recebido em dinheiro não pode ser menor que o valor aplicado.";
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

        <Section title="Produtos encontrados" flush>
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
        </Section>
      </div>

      <Section
        title="Carrinho"
        description={`${cart.length} produto${cart.length === 1 ? "" : "s"} diferente${cart.length === 1 ? "" : "s"}`}
        actions={cart.length > 0 ? <AdminIconButton ariaLabel="Limpar carrinho" title="Limpar carrinho" variant="danger" onClick={() => setCart([])}><Trash2 size={15} /></AdminIconButton> : undefined}
        flush
        className="h-fit xl:sticky xl:top-0"
      >

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
          <AdminButton
            className="mt-4 w-full"
            size="lg"
            disabled={cart.length === 0 || usablePaymentMethods.length === 0}
            onClick={openCheckout}
          >
            <WalletCards size={16} /> Ir para pagamento
          </AdminButton>
          {usablePaymentMethods.length === 0 && <p className="mt-2 text-center text-[10px] font-semibold text-amber-700">Nenhuma forma de pagamento está pronta para uso.</p>}
        </div>
      </Section>
    </div>

    <AdminDialog
      open={checkoutOpen}
      onClose={() => {
        if (finalizeMutation.isPending) return;
        setCheckoutOpen(false);
      }}
      title="Finalizar venda"
      description="Cliente, ajustes e pagamentos são gravados junto com estoque e Financeiro em uma única operação."
      className="max-w-5xl"
      footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-[#5a6a82]">
          {checkoutInvalidReason
            ? <span className="font-semibold text-amber-700">{checkoutInvalidReason}</span>
            : <span className="font-semibold text-emerald-700">Venda pronta para finalizar.</span>}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <AdminButton variant="secondary" onClick={() => setCheckoutOpen(false)} disabled={finalizeMutation.isPending}>Cancelar</AdminButton>
          <AdminButton
            onClick={() => finalizeMutation.mutate()}
            loading={finalizeMutation.isPending}
            loadingText="Finalizando..."
            disabled={Boolean(checkoutInvalidReason)}
          >
            <CheckCircle2 size={15} /> Finalizar venda
          </AdminButton>
        </div>
      </div>}
    >
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="min-w-0 space-y-5">
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-black text-[#0d1b2e]"><UserRound size={15} /> Cliente</h3>
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#7a8aa0]">{settings?.allow_sale_without_customer ? "Opcional" : "Obrigatório"}</span>
            </div>

            {selectedCustomer ? <div className="rounded-xl border border-primary/15 bg-primary-soft p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#0d1b2e]">{selectedCustomer.name}</p>
                  <p className="mt-1 text-[10px] text-[#5a6a82]">{selectedCustomer.document || selectedCustomer.whatsapp || selectedCustomer.phone || "Sem documento ou telefone"}</p>
                </div>
                <AdminButton variant="ghost" size="sm" onClick={() => setSelectedCustomer(null)}>Trocar</AdminButton>
              </div>
            </div> : <>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
                <input
                  value={customerSearch}
                  onChange={event => setCustomerSearch(event.target.value)}
                  placeholder="Nome, CPF/CNPJ ou telefone"
                  className={cn(INPUT, "pl-9")}
                />
              </div>
              <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-[#0d1b2e]/8">
                {customersQuery.isPending ? <p className="p-3 text-xs text-[#5a6a82]">Buscando clientes...</p> : (customersQuery.data || []).length === 0 ? <p className="p-3 text-xs text-[#5a6a82]">Nenhum cliente encontrado.</p> : (customersQuery.data || []).map(customer => <button
                  key={customer.id}
                  type="button"
                  onClick={() => {
                    setSelectedCustomer(customer);
                    setCustomerSearch("");
                  }}
                  className="flex w-full items-center justify-between gap-3 border-b border-[#0d1b2e]/5 px-3 py-2.5 text-left last:border-b-0 hover:bg-[#f8fafc]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold text-[#0d1b2e]">{customer.name}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-[#7a8aa0]">{customer.document || customer.whatsapp || customer.phone || "Sem documento ou telefone"}</span>
                  </span>
                  <Plus size={13} className="shrink-0 text-primary" />
                </button>)}
              </div>
            </>}
          </section>

          <section className="border-t border-[#0d1b2e]/8 pt-4">
            <h3 className="mb-3 text-sm font-black text-[#0d1b2e]">Ajustes da venda</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <FCurrencyInput label="Desconto" value={discount} onChange={(event: any) => setDiscount(event.target.value)} />
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

          <section className="rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] p-4">
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between gap-3 text-[#5a6a82]"><span>Subtotal</span><strong className="text-[#0d1b2e]">{formatCurrency(subtotal)}</strong></div>
              {discountValue > 0 && <div className="flex items-center justify-between gap-3 text-emerald-700"><span>Desconto</span><strong>- {formatCurrency(discountValue)}</strong></div>}
              {surchargeValue > 0 && <div className="flex items-center justify-between gap-3 text-amber-700"><span>Acréscimo</span><strong>+ {formatCurrency(surchargeValue)}</strong></div>}
              <div className="flex items-center justify-between gap-3 border-t border-[#0d1b2e]/8 pt-2 text-sm"><span className="font-black text-[#0d1b2e]">Total</span><strong className="text-xl text-[#0d1b2e]">{formatCurrency(total)}</strong></div>
            </div>
          </section>
        </div>

        <div className="min-w-0 space-y-4 lg:border-l lg:border-[#0d1b2e]/8 lg:pl-5">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-black text-[#0d1b2e]"><CreditCard size={15} /> Formas de pagamento</h3>
            <p className="mt-1 text-[10px] leading-4 text-[#5a6a82]">É possível dividir a venda em mais de uma forma de pagamento.</p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {paymentMethods.map(method => {
              const selected = payments.some(payment => payment.paymentMethodId === method.id);
              const cashClosed = method.method_type === "cash" && !bootstrap.open_session;
              const disabled = selected || cashClosed || !method.available_for_pdv;
              return <button
                key={method.id}
                type="button"
                disabled={disabled}
                onClick={() => addPaymentMethod(method)}
                className={cn(
                  "rounded-xl border p-3 text-left transition",
                  selected ? "border-primary/30 bg-primary-soft text-primary" : "border-[#0d1b2e]/10 bg-white hover:border-primary/30 hover:bg-primary-soft/40",
                  disabled && !selected && "cursor-default opacity-45",
                )}
              >
                <p className="truncate text-xs font-black">{method.name}</p>
                <p className="mt-1 truncate text-[9px] text-[#7a8aa0]">{cashClosed ? "Abra o caixa" : method.financial_account_name || paymentTypeLabel(method.method_type)}</p>
              </button>;
            })}
          </div>

          <div className="space-y-3">
            {selectedPayments.map(({ payment, method }) => method && <div key={payment.paymentMethodId} className="rounded-xl border border-[#0d1b2e]/10 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-[#0d1b2e]">{method.name}</p>
                  <p className="mt-0.5 truncate text-[9px] text-[#7a8aa0]">{method.financial_account_name || paymentTypeLabel(method.method_type)}{method.creates_future_settlement ? " · liquidação futura" : ""}</p>
                </div>
                <AdminIconButton ariaLabel={"Remover " + method.name} title="Remover" variant="danger" onClick={() => removePayment(method.id)}><Trash2 size={13} /></AdminIconButton>
              </div>
              <div className={cn("mt-3 grid gap-3", method.method_type === "cash" ? "sm:grid-cols-2" : "grid-cols-1")}>
                <div>
                  <FCurrencyInput label="Valor aplicado" value={payment.amount} onChange={(event: any) => updatePayment(method.id, { amount: event.target.value })} />
                  <button type="button" onClick={() => fillRemaining(method.id)} className="mt-1 text-[9px] font-bold text-primary hover:underline">Preencher restante</button>
                </div>
                {method.method_type === "cash" && <FCurrencyInput label="Valor recebido" value={payment.tenderedAmount} onChange={(event: any) => updatePayment(method.id, { tenderedAmount: event.target.value })} />}
              </div>
              {method.method_type === "cash" && currencyNumber(payment.tenderedAmount) >= currencyNumber(payment.amount) && currencyNumber(payment.amount) > 0 && <p className="mt-2 text-right text-[10px] font-bold text-emerald-700">Troco: {formatCurrency(Math.max(0, currencyNumber(payment.tenderedAmount) - currencyNumber(payment.amount)))}</p>}
            </div>)}
          </div>

          <div className="rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] p-4">
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between gap-3 text-[#5a6a82]"><span>Total da venda</span><strong className="text-[#0d1b2e]">{formatCurrency(total)}</strong></div>
              <div className="flex items-center justify-between gap-3 text-[#5a6a82]"><span>Pagamentos</span><strong className="text-[#0d1b2e]">{formatCurrency(paymentTotal)}</strong></div>
              <div className={cn("flex items-center justify-between gap-3 border-t border-[#0d1b2e]/8 pt-2", Math.abs(remaining) < 0.01 ? "text-emerald-700" : "text-amber-700")}>
                <span className="font-black">{remaining > 0 ? "Restante" : remaining < 0 ? "Excedente" : "Fechado"}</span>
                <strong>{formatCurrency(Math.abs(remaining))}</strong>
              </div>
              {changeTotal > 0 && <div className="flex items-center justify-between gap-3 text-primary"><span>Troco</span><strong>{formatCurrency(changeTotal)}</strong></div>}
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
          <p className="mt-2 text-3xl font-black text-[#0d1b2e]">{formatCurrency(saleResult.total_amount)}</p>
          <p className="mt-1 text-xs text-[#5a6a82]">{new Date(saleResult.sold_at).toLocaleString("pt-BR")}</p>
        </div>
        <div className="rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] p-4 text-xs">
          <div className="flex items-center justify-between gap-3"><span className="text-[#5a6a82]">Subtotal</span><strong>{formatCurrency(saleResult.subtotal)}</strong></div>
          {Number(saleResult.discount_amount || 0) > 0 && <div className="mt-2 flex items-center justify-between gap-3 text-emerald-700"><span>Desconto</span><strong>- {formatCurrency(saleResult.discount_amount)}</strong></div>}
          {Number(saleResult.surcharge_amount || 0) > 0 && <div className="mt-2 flex items-center justify-between gap-3 text-amber-700"><span>Acréscimo</span><strong>+ {formatCurrency(saleResult.surcharge_amount)}</strong></div>}
          {Number(saleResult.change_amount || 0) > 0 && <div className="mt-2 flex items-center justify-between gap-3 text-primary"><span>Troco</span><strong>{formatCurrency(saleResult.change_amount)}</strong></div>}
          {saleResult.customer_name && <div className="mt-3 border-t border-[#0d1b2e]/8 pt-3"><span className="text-[#5a6a82]">Cliente</span><strong className="ml-2 text-[#0d1b2e]">{saleResult.customer_name}</strong></div>}
        </div>
        <p className="text-center text-[10px] leading-4 text-[#7a8aa0]">Estoque e Financeiro foram atualizados na mesma transação da venda.</p>
      </div>}
    </AdminDialog>
  </div>;
}
