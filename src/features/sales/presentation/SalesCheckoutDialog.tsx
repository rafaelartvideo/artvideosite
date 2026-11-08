import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CalendarDays, CheckCircle2, CreditCard, FileText, Plus, Search, ShoppingBag, Trash2, UserRound,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { SalesQuickCustomerDialog } from "./SalesQuickCustomerDialog";
import { SalesPaymentTermsDialog } from "./SalesPaymentTermsDialog";
import { listSalesPaymentPresets } from "../infrastructure/sales-operations.repository";
import type { PdvProduct, PdvCustomer } from "@/features/pdv/infrastructure/pdv.repository";
import { convertSalesProposal } from "../infrastructure/sales-proposals.repository";
import {
  createCommercialSale, loadSalesCheckoutOptions, searchSalesCustomers,
  type CommercialSaleResult,
} from "../infrastructure/sales.repository";
import {
  parseSalesMoney as toCurrencyNumber,
  salesMoneyText as moneyText,
  localSalesDate as localDate,
  splitSalesInstallments as splitInstallments,
} from "../domain/sales-payment-schedule";

type CartLine = { product: PdvProduct; quantity: number };
type CheckoutMode = "full" | "deposit" | "later";
type ReceivedLine = { key: number; paymentMethodId: string; amountText: string };
const MAX_PAYMENTS = 5;

/** Fluxo comercial: recebimentos informados como já realizados; parcelas futuras vão para Contas a Receber. */
export function SalesCheckoutDialog({
  open, items, onClose, onCompleted, proposal,
}: {
  open: boolean;
  items: CartLine[];
  onClose: () => void;
  onCompleted: (sale: CommercialSaleResult) => void;
  proposal?: { id: string; customer: PdvCustomer; discount: number };
}) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const organizationId = activeOrganizationId || "";
  const [customerSearch, setCustomerSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [customer, setCustomer] = useState<PdvCustomer | null>(proposal?.customer || null);
  const [quickCustomerOpen,setQuickCustomerOpen]=useState(false);
  const [paymentTermsOpen,setPaymentTermsOpen]=useState(false);
  const [mode, setMode] = useState<CheckoutMode>("full");
  const [paymentLines, setPaymentLines] = useState<ReceivedLine[]>([
    { key: 1, paymentMethodId: "", amountText: "" },
  ]);
  const [nextPaymentKey, setNextPaymentKey] = useState(2);
  const [receivedConfirmed, setReceivedConfirmed] = useState(false);
  const [firstDueDate, setFirstDueDate] = useState(() => localDate(30));
  const [installmentCount, setInstallmentCount] = useState(1);
  const [discountText, setDiscountText] = useState(proposal?.discount ? String(proposal.discount).replace(".", ",") : "");
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
  const termsQuery=useQuery({
    queryKey:["sales",organizationId,"payment-presets"],
    queryFn:()=>listSalesPaymentPresets(organizationId),
    enabled:Boolean(open&&organizationId),
    staleTime:30_000,
  });
  const optionsQuery = useQuery({
    queryKey: ["sales", organizationId, "payment-options"],
    queryFn: () => loadSalesCheckoutOptions(organizationId),
    enabled: Boolean(open && organizationId),
    staleTime: 30_000,
  });

  const subtotal = useMemo(() => items.reduce((sum, item) =>
    sum + Number(item.product.price || 0) * item.quantity, 0), [items]);
  const discount = toCurrencyNumber(discountText);
  const total = Math.round((subtotal - (Number.isFinite(discount) ? discount : 0)) * 100) / 100;
  const paymentMethods = optionsQuery.data?.payment_methods || [];
  const activePaymentLines = mode === "later" ? [] : paymentLines;
  const payments = activePaymentLines.map(line => ({
    paymentMethodId: line.paymentMethodId,
    amount: mode === "full" && paymentLines.length === 1 && line.amountText.trim() === ""
      ? total : toCurrencyNumber(line.amountText),
  }));
  const received = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const remaining = Math.round((total - (Number.isFinite(received) ? received : 0)) * 100) / 100;
  const futureCount = mode === "full" ? 0 : installmentCount;
  const futureInstallments = splitInstallments(remaining, futureCount, firstDueDate);
  const isReceived = mode !== "later";

  const changeMode = (next: CheckoutMode) => {
    if (next === mode) return;
    setMode(next);
    setPaymentLines([{ key: nextPaymentKey, paymentMethodId: "", amountText: "" }]);
    setNextPaymentKey(previous => previous + 1);
    setReceivedConfirmed(false);
    setErrorText(null);
  };
  const updatePayment = (key: number, patch: Partial<ReceivedLine>) => {
    setPaymentLines(previous => previous.map(line => line.key === key ? { ...line, ...patch } : line));
    setReceivedConfirmed(false);
    setErrorText(null);
  };
  const addPayment = () => {
    if (paymentLines.length >= MAX_PAYMENTS) return;
    setPaymentLines(previous => {
      if (mode === "full" && previous.length === 1 && previous[0].amountText.trim() === "") {
        const half = Math.floor(total * 100 / 2) / 100;
        return [
          { ...previous[0], amountText: moneyText(half) },
          { key: nextPaymentKey, paymentMethodId: "", amountText: moneyText(total - half) },
        ];
      }
      const entered = previous.reduce((sum, line) => sum + toCurrencyNumber(line.amountText), 0);
      const nextAmount = mode === "full" ? Math.max(0, Math.round((total - entered) * 100) / 100) : 0;
      return [...previous, { key: nextPaymentKey, paymentMethodId: "", amountText: nextAmount > 0 ? moneyText(nextAmount) : "" }];
    });
    setNextPaymentKey(previous => previous + 1);
    setReceivedConfirmed(false);
  };
  const removePayment = (key: number) => {
    setPaymentLines(previous => {
      const next = previous.filter(line => line.key !== key);
      return mode === "full" && next.length === 1
        ? [{ ...next[0], amountText: "" }]
        : next;
    });
    setReceivedConfirmed(false);
  };

  const invalidReason = (() => {
    if (!organizationId) return "Selecione uma empresa.";
    if (!items.length) return "Adicione um produto antes de finalizar.";
    if (items.some(line => !line.product.product_id || !Number.isSafeInteger(line.quantity) || line.quantity < 1))
      return "O carrinho contém um produto ou quantidade inválida.";
    if (!Number.isFinite(discount) || discount < 0 || discount >= subtotal)
      return "Informe um desconto inferior ao subtotal.";
    if (discount > 0 && !canDiscount) return "Você não possui permissão para aplicar desconto.";
    if (!optionsQuery.data) return optionsQuery.error
      ? "Não foi possível consultar a configuração financeira." : "Carregando formas de pagamento...";
    if (!optionsQuery.data.finance_ready) return "Configure uma categoria padrão de recebimentos no Financeiro.";
    if (total <= 0) return "O valor total da venda precisa ser positivo.";
    if ((mode === "deposit" || mode === "later") && !customer)
      return "Selecione um cliente para registrar parcelas futuras.";
    if (mode === "full" && (payments.some(payment => !payment.paymentMethodId || !Number.isFinite(payment.amount) || payment.amount <= 0)
      || Math.abs(received - total) > 0.005))
      return "Informe as formas de pagamento e distribua exatamente o total da venda.";
    if (mode === "deposit" && (payments.some(payment => !payment.paymentMethodId || !Number.isFinite(payment.amount) || payment.amount <= 0)
      || received <= 0 || received >= total))
      return "Informe uma entrada recebida maior que zero e menor que o total.";
    if (payments.length > 5) return "Limite de cinco formas de pagamento.";
    if (new Set(payments.map(payment => payment.paymentMethodId)).size !== payments.length)
      return "Não repita a mesma forma de pagamento.";
    if (payments.some(payment => !paymentMethods.some(method => method.id === payment.paymentMethodId)))
      return "Selecione uma forma de pagamento ativa.";
    if (mode !== "full" && (installmentCount < 1 || installmentCount > 12 ||
      !firstDueDate || firstDueDate < localDate() || firstDueDate > localDate(365)))
      return "Informe de uma a doze parcelas, com primeiro vencimento dentro dos próximos 365 dias.";
    if (mode !== "full" && futureInstallments.length !== installmentCount)
      return "O saldo não permite essa quantidade de parcelas.";
    if (isReceived && !receivedConfirmed)
      return "Confirme que os valores informados já foram realmente recebidos.";
    return null;
  })();

  const mutation = useMutation({
    mutationFn: () => proposal
      ? convertSalesProposal(organizationId,proposal.id,{
          idempotencyKey,
          receivedPayments:payments,
          installmentCount:futureCount,
          firstDueDate:futureCount>0?firstDueDate:null,
        })
      : createCommercialSale(organizationId, {
          idempotencyKey,
          customerId: customer?.id || null,
          discount,
          receivedPayments: payments,
          installmentCount: futureCount,
          firstDueDate: futureCount > 0 ? firstDueDate : null,
          notes: notes.trim(),
          items: items.map(item => ({ productId: item.product.product_id, quantity: item.quantity })),
        }),
    onSuccess: sale => {
      setResult(sale);
      setErrorText(null);
      onCompleted(sale);
    },
    onError: error => setErrorText(systemErrorMessage(error, "Não foi possível registrar a venda comercial.")),
  });

  const submit = () => {
    setErrorText(null);
    if (invalidReason || mutation.isPending) {
      if (invalidReason) setErrorText(invalidReason);
      return;
    }
    mutation.mutate();
  };
  const close = () => { if (!mutation.isPending) onClose(); };

  const footer = result ? <div className="flex w-full justify-end">
    <AdminButton onClick={close}>Ir para Pedidos</AdminButton>
  </div> : <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
    <AdminButton variant="secondary" className="w-full justify-center sm:w-auto"
      disabled={mutation.isPending} onClick={close}>Cancelar</AdminButton>
    <AdminButton className="w-full justify-center sm:w-auto"
      disabled={Boolean(invalidReason) || mutation.isPending}
      loading={mutation.isPending} loadingText="Confirmando..." onClick={submit}>
      <CheckCircle2 size={16}/> {mode === "full" ? "Confirmar venda" : "Criar pedido"}
    </AdminButton>
  </div>;

  return <><AdminDialog open={open} onClose={close}
    title={result ? "Pedido registrado" : proposal ? "Converter proposta em pedido" : "Finalizar venda"}
    description={result
      ? "Venda comercial registrada no Estoque e no Financeiro."
      : "Selecione o cliente, o recebimento e confirme. O saldo e as parcelas são calculados automaticamente."}
    className="w-[calc(100vw-1.25rem)] max-w-4xl"
    bodyClassName="max-h-[min(76dvh,760px)] overflow-y-auto"
    footer={footer}>
    {result ? <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
      <CheckCircle2 size={48} className="text-emerald-600"/>
      <h3 className="text-lg font-bold text-foreground">Pedido comercial #{result.order_number}</h3>
      <p className="text-sm text-muted-foreground">
        {result.payment_status === "paid" ? "Total recebido e registrado no Financeiro."
          : result.payment_status === "partial" ? "Entrada registrada e parcelas lançadas em Contas a Receber."
          : "Parcelas lançadas em Contas a Receber."} Estoque atualizado.
      </p>
      <strong className="text-2xl tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(result.total_amount)}</strong>
    </div> : <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(270px,0.82fr)] lg:gap-5">
      <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-3 py-3 lg:hidden">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Total da venda</p>
          <strong className="block text-lg tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(Math.max(0,total))}</strong>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">A receber</p>
          <strong className="block text-base tabular-nums text-orange-700 dark:text-orange-300">
            {formatCurrency(Math.max(0,Number.isFinite(remaining)?remaining:0))}
          </strong>
        </div>
      </div>
      <div className="min-w-0 space-y-4">
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <UserRound size={16}/> Cliente
            </h3>
            {!proposal&&hasPermission("sales.quick_customer")&&<button type="button"
              onClick={()=>setQuickCustomerOpen(true)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
              <Plus size={14}/> Novo cliente
            </button>}
          </div>
          {customer ? <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{customer.name}</p>
              {customer.document && <p className="text-xs text-muted-foreground">{customer.document}</p>}
            </div>
            {!proposal && <button type="button" onClick={() => {setCustomer(null);setCustomerSearch("");}}
              className="shrink-0 text-xs font-semibold text-primary">Alterar</button>}
          </div> : <>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
              <input value={customerSearch} onChange={event => setCustomerSearch(event.target.value)}
                placeholder="Buscar por nome, CPF ou WhatsApp" aria-label="Pesquisar cliente"
                className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"/>
            </div>
            <div className="max-h-32 overflow-y-auto rounded-lg border border-border bg-card">
              {customersQuery.isPending ? <LoadingState text="Buscando clientes..."/>
                : customersQuery.isError
                ? <p role="alert" className="p-3 text-xs text-destructive">{systemErrorMessage(customersQuery.error,"Não foi possível buscar clientes.")}</p>
                : (customersQuery.data || []).length
                ? (customersQuery.data || []).map(entry => <button type="button" key={entry.id} onClick={() => setCustomer(entry)}
                  className="block w-full border-b border-border px-3 py-2 text-left hover:bg-muted/30">
                  <span className="block truncate text-sm font-semibold">{entry.name}</span>
                  <span className="text-xs text-muted-foreground">{entry.document || entry.whatsapp || "Cliente cadastrado"}</span>
                </button>)
                : <p className="p-3 text-xs text-muted-foreground">Nenhum cliente encontrado.</p>}
            </div>
            <p className="text-xs text-muted-foreground">
              {mode === "full" ? "Cliente opcional para venda recebida integralmente."
                : "Selecione um cliente para vincular as parcelas a receber."}
            </p>
          </>}
        </section>

        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CreditCard size={16}/> Como será o pagamento?
          </h3>
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {([
              ["full","Recebido","Tudo agora"],
              ["deposit","Entrada","+ parcelas"],
              ["later","A receber","Sem entrada"],
            ] as const).map(([value,label,description]) => <button type="button" key={value}
              aria-pressed={mode===value} onClick={() => changeMode(value)}
              className={"min-w-0 rounded-lg border px-2 py-2.5 text-left text-xs font-semibold sm:px-3 sm:py-3 " +
                (mode===value ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground")}>
              <span className="block">{label}</span>
              <span className="mt-1 block text-[11px] font-normal text-muted-foreground">{description}</span>
            </button>)}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {mode==="full"
              ?"Registre apenas pagamentos realmente recebidos. Esta confirmação não faz cobrança automática."
              :mode==="deposit"
              ?"Informe a entrada recebida agora; o restante será dividido em parcelas."
              :"O pedido ficará a receber no Financeiro, sem simular pagamento agora."}
          </p>

          {isReceived && <>
            <div className="space-y-2">
              {paymentLines.map((line,index) => <div key={line.key} className="grid min-w-0 grid-cols-[minmax(0,1fr)_105px_auto] items-end gap-2">
                <label className="min-w-0 space-y-1">
                  <span className="block text-[11px] font-semibold text-muted-foreground">
                    {index === 0 ? "Forma de pagamento" : "Outra forma"}
                  </span>
                  <select value={line.paymentMethodId} onChange={event => updatePayment(line.key, {paymentMethodId:event.target.value})}
                    className="h-10 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground">
                    <option value="">Selecione...</option>
                    {paymentMethods.map(method => <option key={method.id} value={method.id}>
                      {method.name} · {method.account_name}
                    </option>)}
                  </select>
                </label>
                <label className="min-w-0 space-y-1">
                  <span className="block text-[11px] font-semibold text-muted-foreground">Valor recebido</span>
                  <input value={line.amountText}
                    inputMode="decimal" placeholder={mode === "full" && paymentLines.length===1 ? moneyText(total) : "0,00"}
                    onChange={event => updatePayment(line.key,{amountText:event.target.value})}
                    className="h-10 w-full rounded-lg border border-border bg-background px-2 text-right text-xs text-foreground"/>
                </label>
                {index>0 ? <button type="button" onClick={()=>removePayment(line.key)} aria-label="Remover forma de pagamento"
                  className="flex h-10 w-8 items-center justify-center text-destructive"><Trash2 size={15}/></button>
                : <span className="w-8"/>}
              </div>)}
              {mode === "deposit" && paymentLines.length === 1 && <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Entrada rápida:</span>
                {[25,50].map(percent => <button type="button" key={percent}
                  onClick={() => updatePayment(paymentLines[0].key, {
                    amountText: moneyText(Math.round(total * percent) / 100),
                  })}
                  className="rounded-md border border-border bg-card px-2 py-1.5 font-semibold text-primary">
                  {percent}%
                </button>)}
              </div>}
              {paymentLines.length < MAX_PAYMENTS && <button type="button" onClick={addPayment}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                <Plus size={14}/> Adicionar forma de pagamento
              </button>}
              {mode==="full" && paymentLines.length===1 && paymentLines[0].amountText==="" &&
                <p className="text-xs text-muted-foreground">O valor total será preenchido automaticamente para esta forma.</p>}
            </div>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-xs">
              <input type="checkbox" checked={receivedConfirmed}
                onChange={event => setReceivedConfirmed(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"/>
              <span>Confirmo que o valor de <strong>{formatCurrency(Number.isFinite(received)?received:0)}</strong> já foi realmente recebido.</span>
            </label>
            <p className="text-xs leading-5 text-muted-foreground">
              Não gera cobrança PIX nem processa cartão. Registre aqui apenas pagamentos já confirmados.
            </p>
          </>}

          {mode!=="full" && <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="min-w-[180px] flex-1 space-y-1 text-xs font-semibold">
                <span>Condição de pagamento pronta</span>
                <select defaultValue="" onChange={event=>{
                  const chosen=termsQuery.data?.find(preset=>preset.id===event.target.value);
                  if(!chosen)return;
                  setInstallmentCount(chosen.installment_count);
                  setFirstDueDate(localDate(chosen.first_due_days));
                }} className="h-10 w-full rounded-lg border border-border bg-background px-2 text-xs">
                  <option value="">Personalizar</option>
                  {(termsQuery.data||[]).map(preset=><option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>)}
                </select>
              </label>
              {hasPermission("sales.payment_terms.manage")&&
                <button type="button" onClick={()=>setPaymentTermsOpen(true)}
                  className="mt-4 text-xs font-semibold text-primary">
                  Configurar condições
                </button>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">Saldo a receber</span>
              <strong className="text-base tabular-nums text-foreground">{formatCurrency(Math.max(0,Number.isFinite(remaining)?remaining:0))}</strong>
            </div>
            <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
              <label className="space-y-1">
                <span className="block text-[11px] font-semibold text-muted-foreground">Parcelas</span>
                <select value={installmentCount} onChange={event=>setInstallmentCount(Number(event.target.value))}
                  className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm">
                  {Array.from({length:12},(_,index)=>index+1).map(number=>
                    <option key={number} value={number}>{number}x</option>)}
                </select>
              </label>
              <label className="min-w-0 space-y-1">
                <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                  <CalendarDays size={12}/> Primeiro vencimento
                </span>
                <input type="date" value={firstDueDate} min={localDate()} max={localDate(365)}
                  onChange={event => setFirstDueDate(event.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"/>
              </label>
            </div>
            {futureInstallments.length>0 && <div className="max-h-44 divide-y divide-border overflow-y-auto">
              {futureInstallments.map(installment => <div key={installment.number}
                className="flex justify-between gap-3 py-1.5 text-xs">
                <span>{installment.number}ª parcela · {installment.dueDate.split("-").reverse().join("/")}</span>
                <strong className="tabular-nums">{formatCurrency(installment.amount)}</strong>
              </div>)}
            </div>}
            <p className="text-xs text-muted-foreground">
              As parcelas serão criadas automaticamente no Financeiro. A baixa pode ser feita posteriormente por lá.
            </p>
          </div>}
        </section>

        {!proposal && <section className="space-y-2">
          <label className="block text-xs font-semibold text-muted-foreground">Observações (opcional)</label>
          <textarea rows={2} value={notes} onChange={event=>setNotes(event.target.value)}
            maxLength={1000} placeholder="Retirada, entrega ou combinado com o cliente..."
            className="w-full resize-y rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary"/>
        </section>}
      </div>

      <div className="min-w-0 space-y-4">
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border p-3 text-sm font-semibold">
            <ShoppingBag size={16}/> Resumo da venda
          </div>
          <div className="max-h-52 space-y-3 overflow-y-auto p-3">
            {items.map(item => <div key={item.product.product_id} className="flex justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="line-clamp-2 font-medium">{item.product.name}</p>
                <p className="text-xs text-muted-foreground">{item.quantity} × {formatCurrency(item.product.price || 0)}</p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">
                {formatCurrency(Number(item.product.price || 0) * item.quantity)}
              </span>
            </div>)}
          </div>
          <div className="space-y-3 border-t border-border p-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span><strong>{formatCurrency(subtotal)}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="sales-discount" className="text-sm text-muted-foreground">Desconto (R$)</label>
              <input id="sales-discount" inputMode="decimal" value={discountText} placeholder="0,00"
                onChange={event=>{setDiscountText(event.target.value);setReceivedConfirmed(false);}}
                disabled={!canDiscount || Boolean(proposal)} className="h-9 w-28 rounded-lg border border-border bg-background px-2 text-right text-sm disabled:opacity-60"/>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <strong>Total</strong>
              <strong className="text-xl tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(Math.max(0,total))}</strong>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Recebido</span>
              <strong className="text-emerald-700 dark:text-emerald-300">
                {formatCurrency(Number.isFinite(received)?received:0)}
              </strong>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Em aberto</span>
              <strong className="text-orange-700 dark:text-orange-300">
                {formatCurrency(Math.max(0,Number.isFinite(remaining)?remaining:0))}
              </strong>
            </div>
          </div>
        </section>
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <FileText size={17} className="shrink-0 text-muted-foreground"/>
          <p className="text-xs leading-5 text-muted-foreground">
            Vendas registra o pedido comercial, movimenta o Estoque e gera recebimentos e parcelas
            no Financeiro. Não abre caixa do PDV.
          </p>
        </div>
      </div>

      {!optionsQuery.isPending && optionsQuery.data && !optionsQuery.data.finance_ready &&
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 lg:col-span-2">
          Configure a categoria padrão de recebimentos em Financeiro antes de vender.
        </p>}
      {invalidReason && !errorText && !optionsQuery.isPending && <p role="status"
        className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground lg:col-span-2">
        {invalidReason}
      </p>}
      {errorText && <p role="alert"
        className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive lg:col-span-2">
        {errorText}
      </p>}
    </div>}
  </AdminDialog>
  {paymentTermsOpen&&<SalesPaymentTermsDialog organizationId={organizationId}
    onClose={()=>setPaymentTermsOpen(false)}/>}
  {quickCustomerOpen&&<SalesQuickCustomerDialog organizationId={organizationId}
    onClose={()=>setQuickCustomerOpen(false)}
    onSaved={saved=>{
      setCustomer({id:saved.id,name:saved.name,document:saved.document,
        whatsapp:saved.whatsapp,phone:saved.phone});
      setQuickCustomerOpen(false);
      setCustomerSearch("");
      setErrorText(null);
    }}/>}
  </>;
}
