import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, CreditCard, FileText, Search, ShoppingBag, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import type { PdvProduct, PdvCustomer } from "@/features/pdv/infrastructure/pdv.repository";
import {
  createCommercialSale, loadSalesCheckoutOptions, searchSalesCustomers,
  type CommercialSaleResult,
} from "../infrastructure/sales.repository";

type CartLine = { product: PdvProduct; quantity: number };

function currencyInput(value: string) {
  const text = value.trim().replace(/^R\$\s*/, "").replace(/\s/g, "");
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const numeric = Number(normalized || "0");
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : Number.NaN;
}

function todayLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** Checkout comercial: não abre, registra nem consulta sessões de caixa do PDV. */
export function SalesCheckoutDialog({
  open, items, onClose, onCompleted,
}: {
  open: boolean;
  items: CartLine[];
  onClose: () => void;
  onCompleted: (sale: CommercialSaleResult) => void;
}) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const organizationId = activeOrganizationId || "";
  const [customerSearch, setCustomerSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [customer, setCustomer] = useState<PdvCustomer | null>(null);
  const [mode, setMode] = useState<"paid" | "pending">("paid");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [dueDate, setDueDate] = useState(todayLocal);
  const [discountText, setDiscountText] = useState("");
  const [notes, setNotes] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [result, setResult] = useState<CommercialSaleResult | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const canDiscount = hasPermission("sales.discount");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(customerSearch), 250);
    return () => window.clearTimeout(timer);
  }, [customerSearch]);

  const customersQuery = useQuery({
    queryKey: ["sales", organizationId, "customers", debouncedSearch],
    queryFn: () => searchSalesCustomers(organizationId, debouncedSearch),
    enabled: Boolean(open && organizationId && !customer && (debouncedSearch.length === 0 || debouncedSearch.length >= 2)),
    staleTime: 30_000,
  });
  const optionsQuery = useQuery({
    queryKey: ["sales", organizationId, "payment-options"],
    queryFn: () => loadSalesCheckoutOptions(organizationId),
    enabled: Boolean(open && organizationId),
    staleTime: 30_000,
  });

  const subtotal = useMemo(() => items.reduce((sum, line) =>
    sum + Number(line.product.price || 0) * line.quantity, 0), [items]);
  const discount = currencyInput(discountText);
  const total = Math.round((subtotal - (Number.isFinite(discount) ? discount : 0)) * 100) / 100;
  const methods = optionsQuery.data?.payment_methods || [];
  const selectedMethod = methods.find(method => method.id === paymentMethodId);

  const invalidReason = (() => {
    if (!organizationId) return "Selecione a empresa.";
    if (!items.length) return "Adicione pelo menos um produto.";
    if (items.some(line => !line.product.product_id || line.quantity <= 0 || !Number.isSafeInteger(line.quantity))) {
      return "Carrinho contém produtos ou quantidades inválidos.";
    }
    if (!Number.isFinite(discount) || discount < 0 || discount >= subtotal) return "Informe um desconto inferior ao subtotal.";
    if (discount > 0 && !canDiscount) return "Você não possui permissão para aplicar desconto.";
    if (!optionsQuery.data) return "Carregando formas de pagamento...";
    if (mode === "paid" && (!selectedMethod || !paymentConfirmed)) {
      return !selectedMethod ? "Selecione a forma de pagamento recebida." : "Confirme que o pagamento foi realmente recebido.";
    }
    if (mode === "pending" && !customer) return "Selecione um cliente para receber posteriormente.";
    if (mode === "pending" && (!dueDate || dueDate < todayLocal())) return "Informe uma data de vencimento válida.";
    return null;
  })();

  const mutation = useMutation({
    mutationFn: () => createCommercialSale(organizationId, {
      idempotencyKey,
      customerId: customer?.id || null,
      customerName: customer?.name || null,
      customerDocument: customer?.document || null,
      discount,
      paid: mode === "paid",
      paymentMethodId: mode === "paid" ? paymentMethodId : null,
      dueDate: mode === "pending" ? dueDate : null,
      notes: notes.trim(),
      items: items.map(line => ({ productId: line.product.product_id, quantity: line.quantity })),
    }),
    onSuccess: sale => {
      setResult(sale);
      setErrorText(null);
      onCompleted(sale);
    },
    onError: error => setErrorText(systemErrorMessage(error, "Não foi possível confirmar a venda comercial.")),
  });

  const submit = () => {
    setErrorText(null);
    if (invalidReason || mutation.isPending) {
      setErrorText(invalidReason);
      return;
    }
    mutation.mutate();
  };
  const close = () => { if (!mutation.isPending) onClose(); };

  const footer = result ? <div className="flex w-full justify-end">
    <AdminButton onClick={close}>Concluir</AdminButton>
  </div> : <div className="flex w-full flex-wrap justify-end gap-2">
    <AdminButton variant="secondary" disabled={mutation.isPending} onClick={close}>Cancelar</AdminButton>
    <AdminButton disabled={Boolean(invalidReason) || mutation.isPending} loading={mutation.isPending}
      loadingText="Confirmando..." onClick={submit}>
      <CheckCircle2 size={16} /> {mode === "paid" ? "Confirmar venda" : "Criar pedido"}
    </AdminButton>
  </div>;

  return <AdminDialog open={open} onClose={close}
    title={result ? "Venda registrada" : "Finalizar venda"}
    description={result ? "Registro comercial criado com sucesso." : "Confira os produtos, escolha o cliente e defina como será o recebimento."}
    className="w-[calc(100vw-1.25rem)] max-w-4xl"
    bodyClassName="max-h-[min(72dvh,680px)] overflow-y-auto"
    footer={footer}>
    {result ? <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
      <CheckCircle2 size={48} className="text-emerald-600" />
      <h3 className="text-lg font-bold text-foreground">Pedido comercial #{result.order_number}</h3>
      <p className="text-sm text-muted-foreground">
        {result.payment_status === "paid"
          ? "Pagamento registrado no Financeiro. Estoque atualizado."
          : "Pedido registrado com pagamento pendente no Financeiro. Estoque comprometido."}
      </p>
      <strong className="text-2xl tabular-nums text-foreground">{formatCurrency(result.total_amount)}</strong>
    </div> : <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(270px,0.82fr)]">
      <div className="min-w-0 space-y-4">
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><UserRound size={16} /> Cliente</h3>
          {customer ? <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{customer.name}</p>
              {customer.document && <p className="text-xs text-muted-foreground">{customer.document}</p>}</div>
            <button type="button" className="text-xs font-semibold text-primary" onClick={() => { setCustomer(null); setCustomerSearch(""); }}>Alterar</button>
          </div> : <>
            <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
              <input value={customerSearch} onChange={event => setCustomerSearch(event.target.value)}
                placeholder="Buscar cliente por nome, CPF ou WhatsApp"
                aria-label="Pesquisar cliente"
                className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"/></div>
            <div className="max-h-32 overflow-y-auto rounded-lg border border-border bg-card">
              {customersQuery.isPending ? <LoadingState text="Buscando clientes..." /> : customersQuery.error
                ? <p role="alert" className="p-3 text-xs text-destructive">{systemErrorMessage(customersQuery.error,"Não foi possível buscar clientes.")}</p>
                : (customersQuery.data || []).length ? (customersQuery.data || []).map(entry =>
                  <button type="button" key={entry.id} onClick={() => setCustomer(entry)}
                    className="block w-full border-b border-border px-3 py-2 text-left hover:bg-muted/30">
                    <span className="block truncate text-sm font-semibold">{entry.name}</span>
                    <span className="text-xs text-muted-foreground">{entry.document || entry.whatsapp || "Cliente cadastrado"}</span>
                  </button>)
                : <p className="p-3 text-xs text-muted-foreground">Nenhum cliente encontrado.</p>}
            </div>
            {mode === "paid" && <p className="text-xs text-muted-foreground">Cliente opcional para venda com pagamento recebido.</p>}
          </>}
        </section>

        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><CreditCard size={16} /> Recebimento</h3>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" aria-pressed={mode==="paid"} onClick={() => setMode("paid")}
              className={"rounded-lg border p-3 text-left text-sm font-semibold " +
                (mode==="paid"?"border-primary bg-primary/5 text-primary":"border-border text-foreground")}>
              Recebido agora
              <span className="mt-1 block text-xs font-normal text-muted-foreground">Registrar pagamento</span>
            </button>
            <button type="button" aria-pressed={mode==="pending"} onClick={() => setMode("pending")}
              className={"rounded-lg border p-3 text-left text-sm font-semibold " +
                (mode==="pending"?"border-primary bg-primary/5 text-primary":"border-border text-foreground")}>
              Receber depois
              <span className="mt-1 block text-xs font-normal text-muted-foreground">Gerar contas a receber</span>
            </button>
          </div>
          {mode === "paid" ? <>
            <label className="block text-xs font-semibold text-muted-foreground">Forma de pagamento</label>
            <select value={paymentMethodId} onChange={event => { setPaymentMethodId(event.target.value); setPaymentConfirmed(false); }}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
              <option value="">Selecione...</option>
              {methods.map(method => <option value={method.id} key={method.id}>{method.name} · {method.account_name}</option>)}
            </select>
            {optionsQuery.error && <p role="alert" className="text-xs text-destructive">{systemErrorMessage(optionsQuery.error,"Não foi possível carregar os pagamentos.")}</p>}
            {selectedMethod && <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-sm">
              <input type="checkbox" checked={paymentConfirmed} onChange={event => setPaymentConfirmed(event.target.checked)}
                className="mt-0.5 accent-primary" />
              <span>Confirmo que o pagamento foi recebido por {selectedMethod.name}.</span>
            </label>}
            <p className="text-xs leading-5 text-muted-foreground">
              Este registro não gera cobrança automática, link PIX ou transação em maquininha.
              Confirme apenas valores efetivamente recebidos.
            </p>
          </> : <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><CalendarDays size={14}/> Vencimento</label>
            <input type="date" value={dueDate} min={todayLocal()} onChange={event => setDueDate(event.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            <p className="text-xs leading-5 text-muted-foreground">O pedido ficará com pagamento pendente. A quantidade será baixada do saldo disponível ao confirmar.</p>
          </div>}
        </section>

        <section className="space-y-2">
          <label className="block text-xs font-semibold text-muted-foreground">Observações (opcional)</label>
          <textarea rows={2} value={notes} onChange={event => setNotes(event.target.value)}
            maxLength={1000} placeholder="Combinação com o cliente, retirada, entrega..."
            className="w-full resize-y rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary" />
        </section>
      </div>

      <div className="min-w-0 space-y-4">
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border p-3 text-sm font-semibold"><ShoppingBag size={16}/> Resumo da venda</div>
          <div className="max-h-52 space-y-3 overflow-y-auto p-3">
            {items.map(line => <div key={line.product.product_id} className="flex justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="line-clamp-2 font-medium">{line.product.name}</p>
                <p className="text-xs text-muted-foreground">{line.quantity} × {formatCurrency(line.product.price || 0)}</p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(Number(line.product.price || 0)*line.quantity)}</span>
            </div>)}
          </div>
          <div className="space-y-3 border-t border-border p-3">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="sales-discount" className="text-sm text-muted-foreground">Desconto (R$)</label>
              <input id="sales-discount" inputMode="decimal" placeholder="0,00" value={discountText}
                onChange={event => setDiscountText(event.target.value)} disabled={!canDiscount}
                className="h-9 w-28 rounded-lg border border-border bg-background px-2 text-right text-sm disabled:opacity-60" />
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <strong>Total</strong><strong className="text-xl tabular-nums">{formatCurrency(Math.max(0,total))}</strong>
            </div>
          </div>
        </section>
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <FileText size={17} className="shrink-0 text-muted-foreground"/>
          <p className="text-xs leading-5 text-muted-foreground">
            A confirmação gera um pedido comercial independente e registra a operação no Estoque e no Financeiro, sem abrir o caixa PDV.
          </p>
        </div>
      </div>
      {errorText && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive lg:col-span-2">{errorText}</p>}
    </div>}
  </AdminDialog>;
}
